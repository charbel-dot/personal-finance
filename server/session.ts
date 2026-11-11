import { z } from 'zod';
import { base64UrlDecode, base64UrlEncode, hmacSign, hmacVerify, sha256 } from './crypto';
import type { Env } from './env';
import { OWNER_ID, type Principal } from './users';

/** `__Host-` prefix forces Secure, Path=/ and no Domain attribute. */
export const SESSION_COOKIE = '__Host-money_session';
export const REMEMBER_TTL = 30 * 24 * 60 * 60; // 30 days
export const SESSION_TTL = 12 * 60 * 60; // session-only cookie, but the token itself expires after 12h

const payloadSchema = z.object({
  v: z.literal(1),
  iat: z.number().int(),
  exp: z.number().int(),
  remember: z.boolean(),
  /** Fingerprint of the credentials: changing the password or username invalidates all sessions. */
  fp: z.string(),
  /** Whose session this is. Tokens from before multi-user have none and belong to the owner. */
  uid: z.string().max(80).optional(),
});
type SessionPayload = z.infer<typeof payloadSchema>;

export interface Session {
  user: Principal;
  issuedAt: number;
  expiresAt: number;
  remember: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** For the owner this is the same value single-user tokens carried, so existing sessions survive. */
async function fingerprint(user: Principal): Promise<string> {
  return (await sha256(`${user.username}\n${user.secret}`)).slice(0, 16);
}

export async function createToken(
  env: Env,
  user: Principal,
  remember: boolean,
  now = Date.now(),
): Promise<{ token: string; maxAge: number }> {
  const iat = Math.floor(now / 1000);
  const ttl = remember ? REMEMBER_TTL : SESSION_TTL;
  const payload: SessionPayload = {
    v: 1,
    iat,
    exp: iat + ttl,
    remember,
    fp: await fingerprint(user),
    uid: user.id,
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  return { token: `${body}.${await hmacSign(env.SESSION_SECRET, body)}`, maxAge: ttl };
}

/**
 * Checks the signature and expiry, then resolves the user (`lookup`) and checks the token was
 * issued for their current password. A deleted user or a changed password ends the session.
 */
export async function verifyToken(
  env: Env,
  token: string | undefined,
  lookup: (uid: string) => Promise<Principal | null>,
  now = Date.now(),
): Promise<Session | null> {
  if (!token || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  if (!(await hmacVerify(env.SESSION_SECRET, body, sig))) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(base64UrlDecode(body)));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  const payload = parsed.data;
  if (payload.exp <= Math.floor(now / 1000)) return null;
  const user = await lookup(payload.uid ?? OWNER_ID);
  if (!user || payload.fp !== (await fingerprint(user))) return null;
  return { user, issuedAt: payload.iat, expiresAt: payload.exp, remember: payload.remember };
}

export function sessionCookie(token: string, remember: boolean, maxAge: number): string {
  const attrs = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict'];
  if (remember) attrs.push(`Max-Age=${maxAge}`);
  return attrs.join('; ');
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
