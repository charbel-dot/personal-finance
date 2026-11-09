import { describe, expect, it } from 'vitest';
import { base64UrlEncode, pbkdf2, verifyPassword } from './crypto';
import type { Env } from './env';
import { createToken, sessionCookie, verifyToken } from './session';

async function makeHash(password: string, iterations = 100_000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2_sha256:${iterations}:${base64UrlEncode(salt)}:${base64UrlEncode(hash)}`;
}

describe('verifyPassword', () => {
  it('accepts the right password and rejects others', async () => {
    const stored = await makeHash('correct horse battery');
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('wrong', stored)).toBe(false);
  });

  it('rejects malformed or weak hashes', async () => {
    expect(await verifyPassword('x', 'plaintext')).toBe(false);
    expect(await verifyPassword('x', await makeHash('x', 1000))).toBe(false);
  });
});

describe('session tokens', () => {
  const env = {
    AUTH_USERNAME: 'me',
    AUTH_PASSWORD_HASH: 'pbkdf2_sha256:100000:abc:def',
    SESSION_SECRET: 'x'.repeat(40),
  } as Env;

  it('round-trips and expires', async () => {
    const now = Date.UTC(2026, 10, 9);
    const { token, maxAge } = await createToken(env, true, now);
    expect(maxAge).toBe(30 * 24 * 3600);
    expect(await verifyToken(env, token, now + 1000)).toMatchObject({ remember: true });
    expect(await verifyToken(env, token, now + (maxAge + 1) * 1000)).toBeNull();
  });

  it('rejects tampered tokens and tokens from an old password', async () => {
    const { token } = await createToken(env, false);
    const [body, sig] = token.split('.');
    expect(await verifyToken(env, `${body}x.${sig}`)).toBeNull();
    expect(await verifyToken({ ...env, SESSION_SECRET: 'y'.repeat(40) }, token)).toBeNull();
    expect(await verifyToken({ ...env, AUTH_PASSWORD_HASH: 'changed' }, token)).toBeNull();
  });

  it('sets a session-only cookie unless remembered', () => {
    expect(sessionCookie('t', false, 100)).not.toContain('Max-Age');
    expect(sessionCookie('t', true, 100)).toContain('Max-Age=100');
    expect(sessionCookie('t', true, 100)).toMatch(/HttpOnly; Secure; SameSite=Strict/);
  });
});
