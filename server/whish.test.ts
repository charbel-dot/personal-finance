import { describe, expect, it } from 'vitest';
import {
  createTransaction,
  createWhishTransfer,
  deleteWhishTransfer,
  getWhish,
  updateTransaction,
  ValidationError,
} from './data';

/** In-memory R2 with etag preconditions and list by prefix. */
function memoryBucket(): R2Bucket {
  const objects = new Map<string, { body: string; etag: string }>();
  let version = 0;
  const bucket = {
    get(key: string) {
      const obj = objects.get(key);
      if (!obj) return Promise.resolve(null);
      return Promise.resolve({ etag: obj.etag, json: () => Promise.resolve(JSON.parse(obj.body) as unknown) });
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
    list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      return Promise.resolve({ objects: keys.map((key) => ({ key })), truncated: false, delimitedPrefixes: [] });
    },
  };
  return bucket as unknown as R2Bucket;
}

const topUp = (amount: number) => ({ kind: 'deposit', amount, date: '2026-11-01' }) as const;
const whishSpend = (amount: number) =>
  ({ type: 'expense', amount, categoryId: 'groceries', date: '2026-11-02', account: 'whish' }) as const;

describe('whish money', () => {
  it('tracks top-ups, Whish spending and sends', async () => {
    const db = memoryBucket();
    await createWhishTransfer(db, topUp(10_000));
    await createTransaction(db, whishSpend(2_500));
    await createTransaction(db, { ...whishSpend(1_000), to: 'Sam' });
    await createTransaction(db, { type: 'expense', amount: 50_000, categoryId: 'housing', date: '2026-11-02' });

    const whish = await getWhish(db);
    expect(whish.balance).toBe(6_500);
    expect(whish.transactions).toHaveLength(2);
    expect(whish.transactions.find((t) => t.to === 'Sam')?.amount).toBe(1_000);
  });

  it('never lets the wallet go below zero', async () => {
    const db = memoryBucket();
    await createWhishTransfer(db, topUp(1_000));
    await expect(createTransaction(db, whishSpend(1_001))).rejects.toBeInstanceOf(ValidationError);
    await expect(createWhishTransfer(db, { ...topUp(1_001), kind: 'withdrawal' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const spent = await createTransaction(db, whishSpend(800));
    // Editing the spend past the balance is refused; moving it to cash is fine.
    await expect(updateTransaction(db, spent.id, '2026-11', whishSpend(1_200))).rejects.toBeInstanceOf(ValidationError);
    const moved = await updateTransaction(db, spent.id, '2026-11', { ...whishSpend(1_200), account: undefined });
    expect(moved.account).toBeUndefined();
    expect((await getWhish(db)).balance).toBe(1_000);
  });

  it('refuses to delete a top-up that was already spent', async () => {
    const db = memoryBucket();
    const added = await createWhishTransfer(db, topUp(1_000));
    await createTransaction(db, whishSpend(600));
    await expect(deleteWhishTransfer(db, added.id)).rejects.toBeInstanceOf(ValidationError);
  });
});
