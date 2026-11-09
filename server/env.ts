export interface Env {
  BUCKET: R2Bucket;
  /** Login username (plain, not secret-sensitive but kept as a secret anyway). */
  AUTH_USERNAME: string;
  /** Output of `npm run hash-password` — `pbkdf2_sha256:<iterations>:<salt>:<hash>`. */
  AUTH_PASSWORD_HASH: string;
  /** ≥32 random bytes, base64/hex. Used to HMAC-sign session tokens. */
  SESSION_SECRET: string;
}
