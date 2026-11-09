const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Constant-time comparison for equal-length byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Cloudflare Workers cap PBKDF2 at 100k iterations. */
export const PBKDF2_MAX_ITERATIONS = 100_000;

export async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Verifies `password` against `pbkdf2_sha256:<iterations>:<saltB64url>:<hashB64url>`. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.trim().split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > PBKDF2_MAX_ITERATIONS) return false;
  const expected = base64UrlDecode(parts[3]);
  const actual = await pbkdf2(password, base64UrlDecode(parts[2]), iterations);
  return timingSafeEqual(actual, expected);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function hmacSign(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(data));
  return base64UrlEncode(new Uint8Array(sig));
}

export async function hmacVerify(secret: string, data: string, signature: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify('HMAC', await hmacKey(secret), base64UrlDecode(signature), encoder.encode(data));
  } catch {
    return false;
  }
}

export async function sha256(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return base64UrlEncode(new Uint8Array(digest));
}

export function randomId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${base64UrlEncode(bytes)}`;
}
