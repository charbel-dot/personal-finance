import type { z } from 'zod';

export class ConflictError extends Error {
  constructor(key: string) {
    super(`Too many concurrent updates to ${key}`);
    this.name = 'ConflictError';
  }
}

export class CorruptDataError extends Error {
  constructor(key: string) {
    super(`Stored object ${key} failed validation`);
    this.name = 'CorruptDataError';
  }
}

export interface Versioned<T> {
  data: T;
  /** undefined when the object does not exist yet. */
  etag: string | undefined;
}

export async function readJson<S extends z.ZodType>(
  bucket: R2Bucket,
  key: string,
  schema: S,
  fallback: () => z.infer<S>,
): Promise<Versioned<z.infer<S>>> {
  const obj = await bucket.get(key);
  if (!obj) return { data: fallback(), etag: undefined };
  const parsed = schema.safeParse(await obj.json());
  if (!parsed.success) throw new CorruptDataError(key);
  return { data: parsed.data, etag: obj.etag };
}

const MAX_ATTEMPTS = 6;

/**
 * Optimistic-concurrency read-modify-write. Uses R2 conditional puts:
 * `etagMatches` when the object exists, `etagDoesNotMatch: '*'` (create-only) when it doesn't.
 * `mutate` may return `undefined` to signal "no change" and skip the write.
 */
export async function updateJson<S extends z.ZodType, R = undefined>(
  bucket: R2Bucket,
  key: string,
  schema: S,
  fallback: () => z.infer<S>,
  mutate: (current: z.infer<S>) => { next: z.infer<S>; result: R } | undefined,
): Promise<{ data: z.infer<S>; result: R | undefined; changed: boolean }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, etag } = await readJson(bucket, key, schema, fallback);
    const change = mutate(structuredClone(data));
    if (!change) return { data, result: undefined, changed: false };
    const next = schema.parse(change.next);
    const written = await bucket.put(key, JSON.stringify(next), {
      httpMetadata: { contentType: 'application/json' },
      onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' },
    });
    if (written) return { data: next, result: change.result, changed: true };
    // Precondition failed: someone else wrote in between. Back off a little and retry.
    await new Promise((resolve) => setTimeout(resolve, 15 * 2 ** attempt + Math.random() * 20));
  }
  throw new ConflictError(key);
}

export async function listKeys(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}
