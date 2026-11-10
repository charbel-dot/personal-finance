import { describe, expect, it } from 'vitest';
import { bySavingsDateDesc, savingsBalance, signedAmount, summarizeSavings } from './savings';
import type { SavingsEntry } from './schema';

const NOW = '2026-11-09T12:00:00.000Z';

function entry(overrides: Partial<SavingsEntry> = {}): SavingsEntry {
  return {
    id: 's1',
    kind: 'deposit',
    amount: 10000,
    sourceId: 'salary',
    date: '2026-11-01',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('savings', () => {
  it('signs deposits positive and withdrawals negative', () => {
    expect(signedAmount({ kind: 'deposit', amount: 500 })).toBe(500);
    expect(signedAmount({ kind: 'withdrawal', amount: 500 })).toBe(-500);
  });

  it('summarizes totals per source, largest first', () => {
    const items = [
      entry({ id: 'a', sourceId: 'salary', amount: 30000 }),
      entry({ id: 'b', sourceId: 'freelance', amount: 50000 }),
      entry({ id: 'c', sourceId: 'salary', amount: 5000, kind: 'withdrawal' }),
      entry({ id: 'd', sourceId: 'salary', amount: 20000 }),
    ];
    const s = summarizeSavings(items);
    expect(s).toMatchObject({ total: 95000, deposited: 100000, withdrawn: 5000 });
    expect(s.bySource).toEqual([
      { sourceId: 'freelance', deposited: 50000, withdrawn: 0, net: 50000 },
      { sourceId: 'salary', deposited: 50000, withdrawn: 5000, net: 45000 },
    ]);
    expect(savingsBalance(items)).toBe(95000);
  });

  it('filters by an inclusive date range', () => {
    const items = [
      entry({ id: 'a', date: '2026-10-31' }),
      entry({ id: 'b', date: '2026-11-01' }),
      entry({ id: 'c', date: '2026-11-30' }),
      entry({ id: 'd', date: '2026-12-01' }),
    ];
    expect(summarizeSavings(items, '2026-11-01', '2026-11-30').total).toBe(20000);
    expect(summarizeSavings([]).bySource).toEqual([]);
  });

  it('sorts newest first, then by creation time', () => {
    const items = [
      entry({ id: 'a', date: '2026-11-01', createdAt: '2026-11-01T10:00:00Z' }),
      entry({ id: 'b', date: '2026-11-02' }),
      entry({ id: 'c', date: '2026-11-01', createdAt: '2026-11-01T11:00:00Z' }),
    ];
    expect(items.sort(bySavingsDateDesc).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });
});
