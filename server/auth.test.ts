import { describe, expect, it } from 'vitest';
import { base64UrlEncode, pbkdf2, verifyPassword } from './crypto';
import type { Env } from './env';
import { createToken, sessionCookie, verifyToken } from './session';
import { ownerPrincipal, type Principal } from './users';

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
  const owner = ownerPrincipal(env);
  const asOwner = (uid: string) => Promise.resolve(uid === 'owner' ? owner : null);

  it('round-trips and expires', async () => {
    const now = Date.UTC(2026, 10, 9);
    const { token, maxAge } = await createToken(env, owner, true, now);
    expect(maxAge).toBe(30 * 24 * 3600);
    expect(await verifyToken(env, token, asOwner, now + 1000)).toMatchObject({ remember: true, user: owner });
    expect(await verifyToken(env, token, asOwner, now + (maxAge + 1) * 1000)).toBeNull();
  });

  it('rejects tampered tokens and tokens from an old password', async () => {
    const { token } = await createToken(env, owner, false);
    const [body, sig] = token.split('.');
    expect(await verifyToken(env, `${body}x.${sig}`, asOwner)).toBeNull();
    expect(await verifyToken({ ...env, SESSION_SECRET: 'y'.repeat(40) }, token, asOwner)).toBeNull();
    const changed = ownerPrincipal({ ...env, AUTH_PASSWORD_HASH: 'changed' });
    expect(await verifyToken(env, token, () => Promise.resolve(changed))).toBeNull();
  });

  it('binds a token to its user: deleted users and new passwords end the session', async () => {
    const member: Principal = { id: 'u_1', username: 'sam', role: 'member', secret: 'hash-1' };
    const { token } = await createToken(env, member, false);
    expect(await verifyToken(env, token, () => Promise.resolve(member))).toMatchObject({ user: member });
    expect(await verifyToken(env, token, () => Promise.resolve(null))).toBeNull();
    const reset = { ...member, secret: 'hash-2' };
    expect(await verifyToken(env, token, () => Promise.resolve(reset))).toBeNull();
  });

  it('sets a session-only cookie unless remembered', () => {
    expect(sessionCookie('t', false, 100)).not.toContain('Max-Age');
    expect(sessionCookie('t', true, 100)).toContain('Max-Age=100');
    expect(sessionCookie('t', true, 100)).toMatch(/HttpOnly; Secure; SameSite=Strict/);
  });
});
