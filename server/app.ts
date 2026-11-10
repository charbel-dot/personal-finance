import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  categoriesDoc,
  id as idSchema,
  loginInput,
  monthKey,
  rangeQuery,
  recurringInput,
  savingsInput,
  settingsPatch,
  transactionInput,
  type Bootstrap,
} from '../shared/schema';
import { sha256, timingSafeEqual, verifyPassword } from './crypto';
import {
  createRecurring,
  createSavings,
  createTransaction,
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
  updateRecurring,
  updateSavings,
  updateTransaction,
  ValidationError,
} from './data';
import type { Env } from './env';
import { checkLimit, clearClient, clientKey, recordFailure } from './rateLimit';
import { clearSessionCookie, createToken, SESSION_COOKIE, sessionCookie, verifyToken, type Session } from './session';
import { ConflictError, CorruptDataError } from './store';

type AppEnv = { Bindings: Env; Variables: { session: Session } };

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

export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api');

  // Security headers + never cache API responses.
  app.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
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
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    const key = await clientKey(ip);
    const retryAfter = await checkLimit(c.env.BUCKET, key);
    if (retryAfter > 0) {
      c.header('Retry-After', String(retryAfter));
      throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} min.`);
    }
    const input = await parseBody(c, loginInput);
    // Always run the slow hash so response time doesn't reveal whether the username matched.
    const [userA, userB, passwordOk] = await Promise.all([
      sha256(input.username),
      sha256(c.env.AUTH_USERNAME),
      verifyPassword(input.password, c.env.AUTH_PASSWORD_HASH),
    ]);
    const userOk = timingSafeEqual(new TextEncoder().encode(userA), new TextEncoder().encode(userB));
    if (!userOk || !passwordOk) {
      await recordFailure(c.env.BUCKET, key);
      throw new HttpError(401, 'Incorrect username or password');
    }
    await clearClient(c.env.BUCKET, key);
    const { token, maxAge } = await createToken(c.env, input.remember);
    c.header('Set-Cookie', sessionCookie(token, input.remember, maxAge));
    return c.json({ ok: true });
  });

  app.post('/auth/logout', (c) => {
    c.header('Set-Cookie', clearSessionCookie());
    return c.json({ ok: true });
  });

  // Session probe: public so the logged-out state is a normal 200, not a console-visible 401.
  app.get('/auth/me', async (c) => {
    const s = await verifyToken(c.env, readCookie(c.req.header('Cookie'), SESSION_COOKIE));
    return c.json(
      s
        ? {
            authenticated: true,
            username: c.env.AUTH_USERNAME,
            remember: s.remember,
            issuedAt: s.issuedAt,
            expiresAt: s.expiresAt,
          }
        : { authenticated: false },
    );
  });

  // Everything below requires a valid session.
  app.use('*', async (c, next) => {
    const session = await verifyToken(c.env, readCookie(c.req.header('Cookie'), SESSION_COOKIE));
    if (!session) {
      c.header('Set-Cookie', clearSessionCookie());
      throw new HttpError(401, 'Not signed in');
    }
    c.set('session', session);
    await next();
    // Sliding renewal for "remember me" sessions older than a day.
    if (session.remember && Date.now() / 1000 - session.issuedAt > 24 * 60 * 60) {
      const { token, maxAge } = await createToken(c.env, true);
      c.header('Set-Cookie', sessionCookie(token, true, maxAge), { append: true });
    }
  });

  /* ---------------------------------------------------------------------- bootstrap */

  app.get('/bootstrap', async (c) => {
    const [{ generated, today, rules: recurring }, settings, categories] = await Promise.all([
      reconcileRecurring(c.env.BUCKET),
      getSettings(c.env.BUCKET),
      getCategories(c.env.BUCKET),
    ]);
    return c.json({ settings, categories, recurring, generated, today } satisfies Bootstrap);
  });

  app.get('/balance', async (c) => c.json(await getBalance(c.env.BUCKET)));

  /* ------------------------------------------------------------------- transactions */

  app.get('/transactions', async (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (from || to) {
      const range = parseParam(rangeQuery, { from, to }, 'date range');
      return c.json({ items: await listTransactions(c.env.BUCKET, range.from, range.to) });
    }
    return c.json({ items: await listTransactions(c.env.BUCKET) });
  });

  app.post('/transactions', async (c) => {
    const input = await parseBody(c, transactionInput);
    return c.json(await createTransaction(c.env.BUCKET, input), 201);
  });

  app.put('/transactions/:id', async (c) => {
    const id = parseParam(idSchema, c.req.param('id'), 'id');
    const from = parseParam(monthKey, c.req.query('month'), 'month');
    const input = await parseBody(c, transactionInput);
    return c.json(await updateTransaction(c.env.BUCKET, id, from, input));
  });

  app.delete('/transactions/:id', async (c) => {
    const id = parseParam(idSchema, c.req.param('id'), 'id');
    const month = parseParam(monthKey, c.req.query('month'), 'month');
    await deleteTransaction(c.env.BUCKET, id, month);
    return c.body(null, 204);
  });

  /* ---------------------------------------------------------------------- recurring */

  app.get('/recurring', async (c) => c.json({ items: await getRecurring(c.env.BUCKET) }));

  app.post('/recurring', async (c) => {
    const rule = await createRecurring(c.env.BUCKET, await parseBody(c, recurringInput));
    await reconcileRecurring(c.env.BUCKET);
    return c.json(rule, 201);
  });

  app.put('/recurring/:id', async (c) => {
    const id = parseParam(idSchema, c.req.param('id'), 'id');
    const rule = await updateRecurring(c.env.BUCKET, id, await parseBody(c, recurringInput));
    await reconcileRecurring(c.env.BUCKET);
    return c.json(rule);
  });

  app.delete('/recurring/:id', async (c) => {
    await deleteRecurring(c.env.BUCKET, parseParam(idSchema, c.req.param('id'), 'id'));
    return c.body(null, 204);
  });

  app.post('/recurring/reconcile', async (c) => c.json(await reconcileRecurring(c.env.BUCKET)));

  /* ------------------------------------------------------------------------ savings */

  app.get('/savings', async (c) => c.json({ items: await listSavings(c.env.BUCKET) }));

  app.post('/savings', async (c) => c.json(await createSavings(c.env.BUCKET, await parseBody(c, savingsInput)), 201));

  app.put('/savings/:id', async (c) => {
    const id = parseParam(idSchema, c.req.param('id'), 'id');
    return c.json(await updateSavings(c.env.BUCKET, id, await parseBody(c, savingsInput)));
  });

  app.delete('/savings/:id', async (c) => {
    await deleteSavings(c.env.BUCKET, parseParam(idSchema, c.req.param('id'), 'id'));
    return c.body(null, 204);
  });

  /* --------------------------------------------------------------- settings/categories */

  app.put('/categories', async (c) => c.json(await putCategories(c.env.BUCKET, await parseBody(c, categoriesDoc))));

  app.patch('/settings', async (c) => {
    const patch = await parseBody(c, settingsPatch);
    if (patch.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: patch.timezone });
      } catch {
        throw new HttpError(400, 'Unknown timezone');
      }
    }
    return c.json(await patchSettings(c.env.BUCKET, patch));
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
