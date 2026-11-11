import { describe, expect, it } from 'vitest';
import {
  createRecurring,
  createTransaction,
  createWhishTransfer,
  deleteTransaction,
  deleteWhishTransfer,
  getBalance,
  getRecurring,
  getWhish,
  reconcileRecurring,
  updateRecurring,
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

  it('moves money between Current Balance and Whish: top-ups take it out, withdrawals put it back', async () => {
    const db = memoryBucket();
    await createTransaction(db, { type: 'income', amount: 100_000, categoryId: 'salary', date: '2026-11-01' });
    expect((await getBalance(db)).balance).toBe(100_000);

    await createWhishTransfer(db, topUp(30_000));
    expect(await getBalance(db)).toMatchObject({ balance: 70_000, whish: 30_000 });

    // Paying with Whish only lowers Whish; cash is untouched.
    await createTransaction(db, whishSpend(5_000));
    expect(await getBalance(db)).toMatchObject({ balance: 70_000, whish: 25_000, expenses: 5_000 });

    await createWhishTransfer(db, { kind: 'withdrawal', amount: 10_000, date: '2026-11-03' });
    expect(await getBalance(db)).toMatchObject({ balance: 80_000, whish: 15_000 });

    // Money received into Whish raises Whish, not cash.
    await createTransaction(db, {
      type: 'income',
      amount: 2_000,
      categoryId: 'client',
      date: '2026-11-04',
      account: 'whish',
    });
    expect(await getBalance(db)).toMatchObject({ balance: 80_000, whish: 17_000 });
  });

  it('refuses to delete Whish income that was already spent', async () => {
    const db = memoryBucket();
    const received = await createTransaction(db, {
      type: 'income',
      amount: 1_000,
      categoryId: 'client',
      date: '2026-11-01',
      account: 'whish',
    });
    await createTransaction(db, whishSpend(800));
    await expect(deleteTransaction(db, received.id, '2026-11')).rejects.toBeInstanceOf(ValidationError);
  });

  it('generates recurring Whish payments, even past zero, and still allows topping up after', async () => {
    const db = memoryBucket();
    await createWhishTransfer(db, topUp(1_000));
    const rule = await createRecurring(db, {
      type: 'expense',
      name: 'Phone',
      amount: 1_500,
      categoryId: 'utilities',
      frequency: 'monthly',
      startDate: '2027-01-05',
      paused: false,
      account: 'whish',
      to: 'Touch',
    });
    await reconcileRecurring(db, new Date('2027-01-06T12:00:00Z'));

    const whish = await getWhish(db);
    const generated = whish.transactions.find((t) => t.recurringId === rule.id);
    expect(generated).toMatchObject({ account: 'whish', to: 'Touch', amount: 1_500, date: '2027-01-05' });
    expect(whish.balance).toBe(-500);

    // Short wallet: further spending is refused, but topping up works.
    await expect(createTransaction(db, whishSpend(1))).rejects.toBeInstanceOf(ValidationError);
    await createWhishTransfer(db, topUp(200));
    expect((await getWhish(db)).balance).toBe(-300);
  });

  it('keeps or clears a recurring rule’s Whish settings on edit', async () => {
    const db = memoryBucket();
    const base = {
      type: 'expense',
      name: 'Gym',
      amount: 900,
      categoryId: 'health',
      frequency: 'monthly',
      startDate: '2027-02-01',
      paused: false,
    } as const;
    const rule = await createRecurring(db, { ...base, account: 'whish', to: 'Coach' });
    await updateRecurring(db, rule.id, { ...base, paused: true, account: 'whish', to: 'Coach' });
    expect((await getRecurring(db))[0]).toMatchObject({ paused: true, account: 'whish', to: 'Coach' });
    await updateRecurring(db, rule.id, base);
    const cleared = (await getRecurring(db))[0];
    expect(cleared.account).toBeUndefined();
    expect(cleared.to).toBeUndefined();
  });
});
