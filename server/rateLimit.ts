import { z } from 'zod';
import { sha256 } from './crypto';
import { ConflictError, updateJson } from './store';

/**
 * Login rate limiting backed by R2 (one small object, free-tier friendly).
 *
 * Every attempt is *reserved* before the password is checked, in the same conditional write that
 * checks the limits, so parallel guesses cannot all slip past a read-only check. A successful
 * sign-in hands its reservation back. If the reservation can't be written (heavy contention),
 * the attempt is refused rather than allowed uncounted.
 *
 * Two independent budgets per window:
 * - per client (hashed IP): stops one source from guessing;
 * - per account (hashed username): stops many sources guessing one account.
 * There is deliberately no global ceiling: it would let anyone lock every user out.
 */
const KEY = 'security/login-attempts.json';
export const WINDOW_SECONDS = 15 * 60;
export const MAX_PER_CLIENT = 5;
export const MAX_PER_ACCOUNT = 20;

const entry = z.object({ count: z.number().int().nonnegative(), resetAt: z.number() });
type Entry = z.infer<typeof entry>;
/** `global` is a leftover of the old format; it is read and dropped. */
const doc = z.object({
  clients: z.record(z.string(), entry),
  accounts: z.record(z.string(), entry).default({}),
  global: entry.optional(),
});
type Doc = z.infer<typeof doc>;

const empty = (): Doc => ({ clients: {}, accounts: {} });

function live(map: Record<string, Entry>, now: number): Record<string, Entry> {
  return Object.fromEntries(Object.entries(map).filter(([, v]) => v.resetAt > now));
}

export interface AttemptKeys {
  client: string;
  account: string;
}

export async function attemptKeys(ip: string, username: string): Promise<AttemptKeys> {
  // Store hashes, never the raw IP or username.
  const [client, account] = await Promise.all([
    sha256(`login:${ip}`),
    sha256(`account:${username.trim().toLowerCase()}`),
  ]);
  return { client: client.slice(0, 22), account: account.slice(0, 22) };
}

/**
 * Reserves one attempt for both keys. Returns 0 when reserved, otherwise the seconds until the
 * caller may retry (nothing is reserved then).
 */
export async function reserveAttempt(bucket: R2Bucket, keys: AttemptKeys, now = Date.now()): Promise<number> {
  try {
    const { result } = await updateJson(bucket, KEY, doc, empty, (current) => {
      const clients = live(current.clients, now);
      const accounts = live(current.accounts, now);
      const c = clients[keys.client] as Entry | undefined;
      const a = accounts[keys.account] as Entry | undefined;
      const blockedUntil = Math.max(
        c && c.count >= MAX_PER_CLIENT ? c.resetAt : 0,
        a && a.count >= MAX_PER_ACCOUNT ? a.resetAt : 0,
      );
      if (blockedUntil > now) return { next: { clients, accounts }, result: Math.ceil((blockedUntil - now) / 1000) };
      const resetAt = now + WINDOW_SECONDS * 1000;
      clients[keys.client] = { count: (c?.count ?? 0) + 1, resetAt: c?.resetAt ?? resetAt };
      accounts[keys.account] = { count: (a?.count ?? 0) + 1, resetAt: a?.resetAt ?? resetAt };
      return { next: { clients, accounts }, result: 0 };
    });
    return result ?? 0;
  } catch (err) {
    // Fail closed: an attempt we couldn't count is not allowed to run.
    if (err instanceof ConflictError) return 5;
    throw err;
  }
}

/** A successful sign-in returns its reservation and clears this client's failures. */
export async function releaseAttempt(bucket: R2Bucket, keys: AttemptKeys, now = Date.now()): Promise<void> {
  await updateJson(bucket, KEY, doc, empty, (current) => {
    const clients = live(current.clients, now);
    const accounts = live(current.accounts, now);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete clients[keys.client];
    const a = accounts[keys.account] as Entry | undefined;
    if (a) {
      if (a.count <= 1) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete accounts[keys.account];
      } else accounts[keys.account] = { ...a, count: a.count - 1 };
    }
    return { next: { clients, accounts }, result: undefined };
  });
}
