import { describe, expect, it } from 'vitest';
import {
  createGoal,
  createSavings,
  deleteGoal,
  deleteSavings,
  listSavings,
  NotFoundError,
  updateGoal,
  updateSavings,
  ValidationError,
} from './data';

/** Minimal in-memory R2: get/put with etag preconditions, enough for the JSON store. */
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
  };
  return bucket as unknown as R2Bucket;
}

const deposit = (amount: number, sourceId = 'salary', date = '2026-11-01') =>
  ({ kind: 'deposit', amount, sourceId, date }) as const;

describe('savings data', () => {
  it('creates, lists newest first, updates and deletes', async () => {
    const bucket = memoryBucket();
    const a = await createSavings(bucket, deposit(10000, 'salary', '2026-11-01'));
    const b = await createSavings(bucket, deposit(2500, 'freelance', '2026-11-05'));
    expect((await listSavings(bucket)).items.map((e) => e.id)).toEqual([b.id, a.id]);

    const updated = await updateSavings(bucket, a.id, { ...deposit(12000), note: 'Bonus' });
    expect(updated).toMatchObject({ amount: 12000, note: 'Bonus', createdAt: a.createdAt });

    await deleteSavings(bucket, b.id);
    expect((await listSavings(bucket)).items.map((e) => e.id)).toEqual([a.id]);
    await expect(deleteSavings(bucket, b.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an unknown income source', async () => {
    await expect(createSavings(memoryBucket(), deposit(100, 'nope'))).rejects.toBeInstanceOf(ValidationError);
  });

  it('never lets the savings balance go negative', async () => {
    const bucket = memoryBucket();
    const d = await createSavings(bucket, deposit(5000));
    await expect(
      createSavings(bucket, { kind: 'withdrawal', amount: 6000, sourceId: 'salary', date: '2026-11-02' }),
    ).rejects.toBeInstanceOf(ValidationError);
    const w = await createSavings(bucket, { kind: 'withdrawal', amount: 5000, sourceId: 'salary', date: '2026-11-02' });
    // Deleting the deposit would leave only the withdrawal.
    await expect(deleteSavings(bucket, d.id)).rejects.toBeInstanceOf(ValidationError);
    // Shrinking the deposit below the withdrawal is rejected too.
    await expect(updateSavings(bucket, d.id, deposit(1000))).rejects.toBeInstanceOf(ValidationError);
    await deleteSavings(bucket, w.id);
    await deleteSavings(bucket, d.id);
    expect((await listSavings(bucket)).items).toEqual([]);
  });

  it('tracks goals: tag entries, guard per-goal withdrawals, untag on delete', async () => {
    const bucket = memoryBucket();
    const goal = await createGoal(bucket, { name: 'Trip', target: 100000, color: '#3b82f6' });
    await expect(createSavings(bucket, { ...deposit(100), goalId: 'g_missing' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const d = await createSavings(bucket, { ...deposit(30000), goalId: goal.id });
    await createSavings(bucket, deposit(50000)); // untagged
    // Overall savings would cover it, but the goal only holds 300.00.
    await expect(
      createSavings(bucket, {
        kind: 'withdrawal',
        amount: 40000,
        sourceId: 'salary',
        date: '2026-11-03',
        goalId: goal.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const renamed = await updateGoal(bucket, goal.id, {
      name: 'Japan',
      target: 200000,
      targetDate: '2027-06-01',
      color: '#3b82f6',
    });
    expect(renamed).toMatchObject({
      name: 'Japan',
      target: 200000,
      targetDate: '2027-06-01',
      createdAt: goal.createdAt,
    });

    await deleteGoal(bucket, goal.id);
    const after = await listSavings(bucket);
    expect(after.goals).toEqual([]);
    expect(after.items.find((e) => e.id === d.id)?.goalId).toBeUndefined();
    await expect(deleteGoal(bucket, goal.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
