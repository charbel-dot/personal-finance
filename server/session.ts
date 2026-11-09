import { z } from 'zod';
import { base64UrlDecode, base64UrlEncode, hmacSign, hmacVerify, sha256 } from './crypto';
import type { Env } from './env';

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
});
type SessionPayload = z.infer<typeof payloadSchema>;

export interface Session {
  issuedAt: number;
  expiresAt: number;
  remember: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function fingerprint(env: Env): Promise<string> {
  return (await sha256(`${env.AUTH_USERNAME}\n${env.AUTH_PASSWORD_HASH}`)).slice(0, 16);
}

export async function createToken(
  env: Env,
  remember: boolean,
  now = Date.now(),
): Promise<{ token: string; maxAge: number }> {
  const iat = Math.floor(now / 1000);
  const ttl = remember ? REMEMBER_TTL : SESSION_TTL;
  const payload: SessionPayload = { v: 1, iat, exp: iat + ttl, remember, fp: await fingerprint(env) };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  return { token: `${body}.${await hmacSign(env.SESSION_SECRET, body)}`, maxAge: ttl };
}

export async function verifyToken(env: Env, token: string | undefined, now = Date.now()): Promise<Session | null> {
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
  if (payload.fp !== (await fingerprint(env))) return null;
  return { issuedAt: payload.iat, expiresAt: payload.exp, remember: payload.remember };
}

export function sessionCookie(token: string, remember: boolean, maxAge: number): string {
  const attrs = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict'];
  if (remember) attrs.push(`Max-Age=${maxAge}`);
  return attrs.join('; ');
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
