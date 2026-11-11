import { describe, expect, it } from 'vitest';
import { verifyPassword } from './crypto';
import { createTransaction, getSettings, listTransactions, patchSettings } from './data';
import type { Env } from './env';
import { createUser, dataBucket, deleteUser, findMember, listUsers, OWNER_ID, setPassword } from './users';

/** In-memory R2 with etag preconditions, list by prefix and delete. */
function memoryBucket() {
  const objects = new Map<string, { body: string; etag: string }>();
  let version = 0;
  const bucket = {
    get(key: string) {
      const obj = objects.get(key);
      if (!obj) return Promise.resolve(null);
      return Promise.resolve({ etag: obj.etag, json: () => Promise.resolve(JSON.parse(obj.body) as unknown) });
    },
    head(key: string) {
      return Promise.resolve(objects.has(key) ? { key } : null);
    },
    put(key: string, body: string, options?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } }) {
      const existing = objects.get(key);
      const cond = options?.onlyIf;
      if (cond?.etagMatches && existing?.etag !== cond.etagMatches) return Promise.resolve(null);
      if (cond?.etagDoesNotMatch === '*' && existing) return Promise.resolve(null);
      const etag = `v${++version}`;
      objects.set(key, { body, etag });
      return Promise.resolve({ etag });
    },
    delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
      return Promise.resolve();
    },
    list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      return Promise.resolve({ objects: keys.map((key) => ({ key })), truncated: false, delimitedPrefixes: [] });
    },
  };
  return { bucket: bucket as unknown as R2Bucket, keys: () => [...objects.keys()].sort() };
}

const envFor = (bucket: R2Bucket): Env => ({
  BUCKET: bucket,
  AUTH_USERNAME: 'charbel',
  AUTH_PASSWORD_HASH: 'x',
  SESSION_SECRET: 'x'.repeat(40),
});

const expense = (amount: number) => ({ type: 'expense', amount, categoryId: 'groceries', date: '2026-11-03' }) as const;

describe('users', () => {
  it('creates users with hashed passwords and unique, case-insensitive names', async () => {
    const { bucket } = memoryBucket();
    const env = envFor(bucket);
    const sam = await createUser(env, { username: 'sam', password: 'long-enough' });
    expect(await listUsers(bucket)).toEqual([sam]);
    const found = await findMember(bucket, { username: 'SAM' });
    expect(found?.principal.id).toBe(sam.id);
    expect(found?.passwordHash).not.toContain('long-enough');
    expect(await verifyPassword('long-enough', found?.passwordHash ?? '')).toBe(true);

    await expect(createUser(env, { username: 'Sam', password: 'long-enough' })).rejects.toThrow('taken');
    await expect(createUser(env, { username: 'CHARBEL', password: 'long-enough' })).rejects.toThrow('taken');
  });

  it('keeps each user’s data separate from the owner and from each other', async () => {
    const { bucket, keys } = memoryBucket();
    const env = envFor(bucket);
    const sam = await createUser(env, { username: 'sam', password: 'long-enough' });
    const alex = await createUser(env, { username: 'alex', password: 'long-enough' });
    const owner = dataBucket(bucket, OWNER_ID);
    const samDb = dataBucket(bucket, sam.id);
    const alexDb = dataBucket(bucket, alex.id);

    await createTransaction(owner, expense(1000));
    await createTransaction(samDb, expense(2000));
    await patchSettings(samDb, { currency: 'EUR', tourDone: true });

    expect((await listTransactions(owner)).map((t) => t.amount)).toEqual([1000]);
    expect((await listTransactions(samDb)).map((t) => t.amount)).toEqual([2000]);
    expect(await listTransactions(alexDb)).toEqual([]);
    expect((await getSettings(samDb)).currency).toBe('EUR');
    expect(await getSettings(alexDb)).toMatchObject({ currency: 'USD', tourDone: false });
    expect(await getSettings(owner)).toMatchObject({ currency: 'USD', tourDone: false });
    // The owner's files stay at the root, exactly where single-user data always was.
    expect(keys()).toContain('transactions/2026-11.json');
    expect(keys()).toContain(`users/${sam.id}/transactions/2026-11.json`);
  });

  it('resets passwords and deletes a user with all their data', async () => {
    const { bucket, keys } = memoryBucket();
    const env = envFor(bucket);
    const sam = await createUser(env, { username: 'sam', password: 'long-enough' });
    await createTransaction(dataBucket(bucket, sam.id), expense(2000));
    await createTransaction(dataBucket(bucket, OWNER_ID), expense(1000));

    const updated = await setPassword(bucket, sam.id, 'another-password');
    expect(await verifyPassword('another-password', updated.secret)).toBe(true);

    await deleteUser(bucket, sam.id);
    expect(await listUsers(bucket)).toEqual([]);
    expect(keys().some((k) => k.startsWith(`users/${sam.id}/`))).toBe(false);
    expect(keys()).toContain('transactions/2026-11.json');
    await expect(deleteUser(bucket, sam.id)).rejects.toThrow('not found');
  });
});
