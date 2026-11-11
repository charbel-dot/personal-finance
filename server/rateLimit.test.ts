import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { base64UrlEncode, pbkdf2 } from './crypto';
import type { Env } from './env';
import { MAX_PER_ACCOUNT, MAX_PER_CLIENT } from './rateLimit';

/** In-memory R2 with etag preconditions; `delay` widens race windows for concurrency tests. */
function memoryBucket(delay = 0) {
  const objects = new Map<string, { body: string; etag: string }>();
  let version = 0;
  const wait = () => new Promise((r) => setTimeout(r, delay));
  const bucket = {
    get(key: string) {
      const obj = objects.get(key);
      if (!obj) return Promise.resolve(null);
      return Promise.resolve({ etag: obj.etag, json: () => Promise.resolve(JSON.parse(obj.body) as unknown) });
    },
    async put(key: string, body: string, options?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } }) {
      await wait();
      const existing = objects.get(key);
      const cond = options?.onlyIf;
      if (cond?.etagMatches && existing?.etag !== cond.etagMatches) return null;
      if (cond?.etagDoesNotMatch === '*' && existing) return null;
      const etag = `v${++version}`;
      objects.set(key, { body, etag });
      return { etag };
    },
    list() {
      return Promise.resolve({ objects: [], truncated: false, delimitedPrefixes: [] });
    },
  };
  return bucket as unknown as R2Bucket;
}

// Few iterations keep the test fast; verifyPassword accepts 10k and up.
async function hash(password: string) {
  const salt = new Uint8Array(16).fill(7);
  return `pbkdf2_sha256:10000:${base64UrlEncode(salt)}:${base64UrlEncode(await pbkdf2(password, salt, 10_000))}`;
}

async function setup(delay = 0) {
  const env: Env = {
    BUCKET: memoryBucket(delay),
    AUTH_USERNAME: 'owner',
    AUTH_PASSWORD_HASH: await hash('right-password'),
    SESSION_SECRET: 's'.repeat(40),
  };
  const app = createApp();
  const login = (password: string, ip: string, username = 'owner'): Promise<Response> =>
    Promise.resolve(
      app.fetch(
        new Request('https://money.test/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ username, password }),
        }),
        env,
      ),
    );
  return { login };
}

describe('login rate limiting', () => {
  it('counts parallel guesses: one client never gets more than its budget', async () => {
    const { login } = await setup(3);
    const results = await Promise.all(Array.from({ length: 20 }, () => login('wrong', '10.0.0.1')));
    const tried = results.filter((r) => r.status === 401).length;
    expect(tried).toBeLessThanOrEqual(MAX_PER_CLIENT);
    expect(results.every((r) => r.status === 401 || r.status === 429)).toBe(true);
  });

  it('does not lock everyone out: failures from many clients leave other accounts usable', async () => {
    const { login } = await setup();
    for (let i = 0; i < 12; i++) {
      for (let n = 0; n < MAX_PER_CLIENT; n++) {
        // 60 failures against a made-up account from 12 addresses
        expect((await login('wrong', `10.0.1.${i}`, 'nobody')).status).toBe(i * 5 + n < MAX_PER_ACCOUNT ? 401 : 429);
      }
    }
    expect((await login('right-password', '10.0.2.1')).status).toBe(200);
  });

  it('limits guesses against one account across many addresses', async () => {
    const { login } = await setup();
    for (let i = 0; i < MAX_PER_ACCOUNT; i++) expect((await login('wrong', `10.0.3.${i}`)).status).toBe(401);
    const blocked = await login('wrong', '10.0.4.1');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('a successful sign-in returns its attempt and clears the client', async () => {
    const { login } = await setup();
    for (let i = 0; i < MAX_PER_CLIENT - 1; i++) expect((await login('wrong', '10.0.5.1')).status).toBe(401);
    expect((await login('right-password', '10.0.5.1')).status).toBe(200);
    expect((await login('wrong', '10.0.5.1')).status).toBe(401);
  });
});
