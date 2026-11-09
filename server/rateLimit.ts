import { z } from 'zod';
import { sha256 } from './crypto';
import { readJson, updateJson } from './store';

/**
 * Login rate limiting backed by R2 (strongly consistent, unlike KV, so parallel
 * guesses can't race past the limit). Free-tier friendly: one small object.
 */
const KEY = 'security/login-attempts.json';
export const WINDOW_SECONDS = 15 * 60;
export const MAX_PER_CLIENT = 5;
/** Global ceiling across all clients to slow down distributed guessing. */
export const MAX_GLOBAL = 50;

const bucketEntry = z.object({ count: z.number().int().nonnegative(), resetAt: z.number() });
const doc = z.object({ clients: z.record(z.string(), bucketEntry), global: bucketEntry });
type Doc = z.infer<typeof doc>;

const empty = (): Doc => ({ clients: {}, global: { count: 0, resetAt: 0 } });

function prune(d: Doc, now: number): Doc {
  const clients = Object.fromEntries(Object.entries(d.clients).filter(([, v]) => v.resetAt > now));
  return { clients, global: d.global.resetAt > now ? d.global : { count: 0, resetAt: 0 } };
}

export async function clientKey(ip: string): Promise<string> {
  // Store a hash, not the raw IP.
  return (await sha256(`login:${ip}`)).slice(0, 22);
}

/** Returns seconds until the client may retry, or 0 when allowed. */
export async function checkLimit(bucket: R2Bucket, key: string, now = Date.now()): Promise<number> {
  const { data } = await readJson(bucket, KEY, doc, empty);
  const d = prune(data, now);
  const client = d.clients[key] as Doc['global'] | undefined;
  const blockedUntil = Math.max(
    client && client.count >= MAX_PER_CLIENT ? client.resetAt : 0,
    d.global.count >= MAX_GLOBAL ? d.global.resetAt : 0,
  );
  return blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;
}

export async function recordFailure(bucket: R2Bucket, key: string, now = Date.now()): Promise<void> {
  await updateJson(bucket, KEY, doc, empty, (current) => {
    const d = prune(current, now);
    const resetAt = now + WINDOW_SECONDS * 1000;
    const client = (d.clients[key] as Doc['global'] | undefined) ?? { count: 0, resetAt };
    d.clients[key] = { count: client.count + 1, resetAt: client.resetAt };
    d.global = d.global.count === 0 ? { count: 1, resetAt } : { ...d.global, count: d.global.count + 1 };
    return { next: d, result: undefined };
  });
}

export async function clearClient(bucket: R2Bucket, key: string, now = Date.now()): Promise<void> {
  await updateJson(bucket, KEY, doc, empty, (current) => {
    if (!(key in current.clients)) return undefined;
    const d = prune(current, now);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete d.clients[key];
    return { next: d, result: undefined };
  });
}
