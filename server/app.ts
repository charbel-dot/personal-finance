import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  categoriesDoc,
  goalInput,
  id as idSchema,
  loginInput,
  monthKey,
  newUserInput,
  passwordChange,
  passwordReset,
  rangeQuery,
  recurringInput,
  savingsInput,
  settingsPatch,
  transactionInput,
  type Bootstrap,
} from '../shared/schema';
import { sha256, timingSafeEqual, verifyPassword } from './crypto';
import {
  createGoal,
  createRecurring,
  createSavings,
  createTransaction,
  deleteGoal,
  deleteRecurring,
  deleteSavings,
  deleteTransaction,
  getBalance,
  getCategories,
  getRecurring,
  getSettings,
  listSavings,
  listTransactions,
  NotFoundError,
  patchSettings,
  putCategories,
  reconcileRecurring,
  updateGoal,
  updateRecurring,
  updateSavings,
  updateTransaction,
  ValidationError,
} from './data';
import type { Env } from './env';
import { attemptKeys, releaseAttempt, reserveAttempt, type AttemptKeys } from './rateLimit';
import { clearSessionCookie, createToken, SESSION_COOKIE, sessionCookie, verifyToken, type Session } from './session';
import { ConflictError, CorruptDataError } from './store';
import {
  createUser,
  dataBucket,
  deleteUser,
  findMember,
  listUsers,
  ownerPrincipal,
  principalFor,
  setPassword,
  type Principal,
} from './users';

/** `db` is the signed-in user's own storage: the bucket root for the owner, their folder otherwise. */
type AppEnv = { Bindings: Env; Variables: { session: Session; db: R2Bucket } };

/** Run when no account matches, so a wrong username costs the same time as a wrong password. */
const DUMMY_HASH = 'pbkdf2_sha256:100000:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid input', z.flattenError(parsed.error));
  }
  return parsed.data;
}

function parseParam<S extends z.ZodType>(schema: S, value: unknown, what: string): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, `Invalid ${what}`);
  return parsed.data;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Reserves a sign-in attempt (see rateLimit.ts) or answers 429 with Retry-After. */
async function reserveOrThrow(c: Context<AppEnv>, keys: AttemptKeys) {
  const retryAfter = await reserveAttempt(c.env.BUCKET, keys);
  if (retryAfter > 0) {
    c.header('Retry-After', String(retryAfter));
    throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} min.`);
  }
}

export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api');

  // Security headers + never cache API responses.
  app.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    c.header('Cross-Origin-Resource-Policy', 'same-origin');
  });

  // CSRF defence-in-depth on top of SameSite=Strict: same-origin check + JSON-only bodies.
  app.use('*', async (c, next) => {
    if (MUTATING.has(c.req.method)) {
      const origin = c.req.header('Origin');
      if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, 'Cross-origin request blocked');
      const type = c.req.header('Content-Type') ?? '';
      if (c.req.method !== 'DELETE' && !type.startsWith('application/json')) {
        throw new HttpError(415, 'Expected application/json');
      }
    }
    await next();
  });

  app.use(
    '*',
    bodyLimit({
      maxSize: 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Request body too large');
      },
    }),
  );

  app.use('*', async (c, next) => {
    if (
      !c.env.AUTH_USERNAME ||
      !c.env.AUTH_PASSWORD_HASH ||
      !c.env.SESSION_SECRET ||
      c.env.SESSION_SECRET.length < 32
    ) {
      throw new HttpError(500, 'Server is not configured: set AUTH_USERNAME, AUTH_PASSWORD_HASH and SESSION_SECRET');
    }
    await next();
  });

  app.get('/health', (c) => c.json({ ok: true }));

  /* --------------------------------------------------------------------------- auth */

  app.post('/auth/login', async (c) => {
    const input = await parseBody(c, loginInput);
    const keys = await attemptKeys(c.req.header('CF-Connecting-IP') ?? 'local', input.username);
    await reserveOrThrow(c, keys);
    // The owner signs in with the configured secrets; everyone else is looked up in the user list.
    const [userA, userB] = await Promise.all([sha256(input.username), sha256(c.env.AUTH_USERNAME)]);
    const isOwner = timingSafeEqual(new TextEncoder().encode(userA), new TextEncoder().encode(userB));
    const member = isOwner ? null : await findMember(c.env.BUCKET, { username: input.username });
    const user: Principal | null = isOwner ? ownerPrincipal(c.env) : (member?.principal ?? null);
    // Always run the slow hash so response time doesn't reveal whether the username exists.
    const passwordOk = await verifyPassword(
      input.password,
      isOwner ? c.env.AUTH_PASSWORD_HASH : (member?.passwordHash ?? DUMMY_HASH),
    );
    if (!user || !passwordOk) throw new HttpError(401, 'Incorrect username or password');
    await releaseAttempt(c.env.BUCKET, keys);
    const { token, maxAge } = await createToken(c.env, user, input.remember);
    c.header('Set-Cookie', sessionCookie(token, input.remember, maxAge));
    return c.json({ ok: true });
  });

  app.post('/auth/logout', (c) => {
    c.header('Set-Cookie', clearSessionCookie());
    return c.json({ ok: true });
  });

  // Session probe: public so the logged-out state is a normal 200, not a console-visible 401.
  app.get('/auth/me', async (c) => {
    const s = await verifyToken(c.env, readCookie(c.req.header('Cookie'), SESSION_COOKIE), (uid) =>
      principalFor(c.env, uid),
    );
    return c.json(
      s
        ? {
            authenticated: true,
            username: s.user.username,
            role: s.user.role,
            remember: s.remember,
            issuedAt: s.issuedAt,
            expiresAt: s.expiresAt,
          }
        : { authenticated: false },
    );
  });

  // Everything below requires a valid session.
  app.use('*', async (c, next) => {
    const session = await verifyToken(c.env, readCookie(c.req.header('Cookie'), SESSION_COOKIE), (uid) =>
      principalFor(c.env, uid),
    );
    if (!session) {
      c.header('Set-Cookie', clearSessionCookie());
      throw new HttpError(401, 'Not signed in');
    }
    c.set('session', session);
    c.set('db', dataBucket(c.env.BUCKET, session.user.id));
    await next();
    // Sliding renewal for "remember me" sessions older than a day, unless the handler already
    // issued a session (a password change does), which must not be overwritten by a stale one.
    const issued = c.res.headers.has('Set-Cookie');
    if (!issued && session.remember && Date.now() / 1000 - session.issuedAt > 24 * 60 * 60) {
      const { token, maxAge } = await createToken(c.env, session.user, true);
      c.header('Set-Cookie', sessionCookie(token, true, maxAge), { append: true });
    }
  });

  /* ---------------------------------------------------------------------- bootstrap */

  app.get('/bootstrap', async (c) => {
    const [{ generated, today, rules: recurring }, settings, categories] = await Promise.all([
      reconcileRecurring(c.var.db),
      getSettings(c.var.db),
      getCategories(c.var.db),
    ]);
    return c.json({ settings, categories, recurring, generated, today } satisfies Bootstrap);
  });

  app.get('/balance', async (c) => c.json(await getBalance(c.var.db)));

  /* ------------------------------------------------------------------- transactions */

  app.get('/transactions', async (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (from || to) {
      const range = parseParam(rangeQuery, { from, to }, 'date range');
      return c.json({ items: await listTransactions(c.var.db, range.from, range.to) });
    }
    return c.json({ items: await listTransactions(c.var.db) });
  });

  app.post('/transactions', async (c) => {
    const input = await parseBody(c, transactionInput);
    return c.json(await createTransaction(c.var.db, input), 201);
  });

  app.put('/transactions/:id', async (c) => {
    const id = parseParam(idSchema, c.req.param('id'), 'id');
    const from = parseParam(monthKey, c.req.query('month'), 'month');
    const input = await parseBody(c, transactionInput);
    return c.json(await updateTransaction(c.var.db, id, from, input));
  });

  app.delete('/transactions/:id', async (c) => {
    const id = parseParam(idSchema, c.req.param('id'), 'id');
    const month = parseParam(monthKey, c.req.query('month'), 'month');
    await deleteTransaction(c.var.db, id, month);
    return c.body(null, 204);
  });

  /* ---------------------------------------------------------------------- recurring */

  app.get('/recurring', async (c) => c.json({ items: await getRecurring(c.var.db) }));

  app.post('/recurring', async (c) => {
    const rule = await createRecurring(c.var.db, await parseBody(c, recurringInput));
    await reconcileRecurring(c.var.db);
    return c.json(rule, 201);
  });

  app.put('/recurring/:id', async (c) => {
    const id = parseParam(idSchema, c.req.param('id'), 'id');
    const rule = await updateRecurring(c.var.db, id, await parseBody(c, recurringInput));
    await reconcileRecurring(c.var.db);
    return c.json(rule);
  });

  app.delete('/recurring/:id', async (c) => {
    await deleteRecurring(c.var.db, parseParam(idSchema, c.req.param('id'), 'id'));
    return c.body(null, 204);
  });

  app.post('/recurring/reconcile', async (c) => c.json(await reconcileRecurring(c.var.db)));

  /* ------------------------------------------------------------------------ savings */

  app.get('/savings', async (c) => c.json(await listSavings(c.var.db)));

  // Goals are registered before /savings/:id so "goals" is never read as an entry id.
  app.post('/savings/goals', async (c) => c.json(await createGoal(c.var.db, await parseBody(c, goalInput)), 201));

  app.put('/savings/goals/:id', async (c) => {
    const id = parseParam(idSchema, c.req.param('id'), 'id');
    return c.json(await updateGoal(c.var.db, id, await parseBody(c, goalInput)));
  });

  app.delete('/savings/goals/:id', async (c) => {
    await deleteGoal(c.var.db, parseParam(idSchema, c.req.param('id'), 'id'));
    return c.body(null, 204);
  });

  app.post('/savings', async (c) => c.json(await createSavings(c.var.db, await parseBody(c, savingsInput)), 201));

  app.put('/savings/:id', async (c) => {
    const id = parseParam(idSchema, c.req.param('id'), 'id');
    return c.json(await updateSavings(c.var.db, id, await parseBody(c, savingsInput)));
  });

  app.delete('/savings/:id', async (c) => {
    await deleteSavings(c.var.db, parseParam(idSchema, c.req.param('id'), 'id'));
    return c.body(null, 204);
  });

  /* --------------------------------------------------------------- settings/categories */

  app.put('/categories', async (c) => c.json(await putCategories(c.var.db, await parseBody(c, categoriesDoc))));

  app.patch('/settings', async (c) => {
    const patch = await parseBody(c, settingsPatch);
    if (patch.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: patch.timezone });
      } catch {
        throw new HttpError(400, 'Unknown timezone');
      }
    }
    return c.json(await patchSettings(c.var.db, patch));
  });

  /* -------------------------------------------------------------------------- users */

  // A member changes their own password. The owner's lives in Cloudflare secrets.
  app.post('/auth/password', async (c) => {
    const { user, remember } = c.var.session;
    if (user.role === 'owner') {
      throw new HttpError(400, 'Your password is a Cloudflare secret: change it with npm run hash-password.');
    }
    // Guesses at the current password share the account's sign-in budget.
    const [input, keys] = await Promise.all([
      parseBody(c, passwordChange),
      attemptKeys(c.req.header('CF-Connecting-IP') ?? 'local', user.username),
    ]);
    await reserveOrThrow(c, keys);
    if (!(await verifyPassword(input.current, user.secret))) throw new HttpError(400, 'Current password is wrong');
    const [updated] = await Promise.all([
      setPassword(c.env.BUCKET, user.id, input.next),
      releaseAttempt(c.env.BUCKET, keys),
    ]);
    // Other devices are signed out (their tokens carry the old fingerprint); keep this one signed in.
    const { token, maxAge } = await createToken(c.env, updated, remember);
    c.header('Set-Cookie', sessionCookie(token, remember, maxAge));
    return c.json({ ok: true });
  });

  // Managing people is the owner's job.
  app.use('/users/*', async (c, next) => {
    if (c.var.session.user.role !== 'owner') throw new HttpError(403, 'Only the owner can manage users');
    await next();
  });
  app.use('/users', async (c, next) => {
    if (c.var.session.user.role !== 'owner') throw new HttpError(403, 'Only the owner can manage users');
    await next();
  });

  app.get('/users', async (c) => c.json({ items: await listUsers(c.env.BUCKET) }));

  app.post('/users', async (c) => c.json(await createUser(c.env, await parseBody(c, newUserInput)), 201));

  app.put('/users/:id/password', async (c) => {
    const id = parseParam(idSchema, c.req.param('id'), 'id');
    await setPassword(c.env.BUCKET, id, (await parseBody(c, passwordReset)).password);
    return c.json({ ok: true });
  });

  app.delete('/users/:id', async (c) => {
    await deleteUser(c.env.BUCKET, parseParam(idSchema, c.req.param('id'), 'id'));
    return c.body(null, 204);
  });

  app.notFound(() => {
    throw new HttpError(404, 'Not found');
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: err.message, details: err.details }, err.status);
    }
    if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof ConflictError) return c.json({ error: 'Busy, please retry' }, 409);
    if (err instanceof CorruptDataError) {
      console.error(err);
      return c.json({ error: 'Stored data is corrupt' }, 500);
    }
    console.error(err);
    return c.json({ error: 'Something went wrong' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
