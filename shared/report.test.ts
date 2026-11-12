import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './defaults';
import { buildReport, earliestDate } from './report';
import type { SavingsEntry, Transaction, WhishTransfer } from './schema';

const at = '2026-11-01T10:00:00.000Z';
const tx = (over: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount' | 'categoryId' | 'date'>) => ({
  createdAt: at,
  updatedAt: at,
  ...over,
});

const transactions: Transaction[] = [
  tx({ id: 't1', type: 'income', amount: 300_000, categoryId: 'salary', date: '2026-11-01' }),
  tx({ id: 't2', type: 'expense', amount: 100_000, categoryId: 'housing', date: '2026-11-02', recurringId: 'r1' }),
  tx({ id: 't3', type: 'expense', amount: 2_500, categoryId: 'dining', date: '2026-11-05', note: 'Lunch' }),
  tx({
    id: 't4',
    type: 'expense',
    amount: 1_000,
    categoryId: 'shopping',
    date: '2026-11-05',
    account: 'whish',
    to: 'Sam',
  }),
  tx({ id: 't5', type: 'income', amount: 5_000, categoryId: 'client', date: '2026-11-06', account: 'whish' }),
  // Outside the range.
  tx({ id: 't6', type: 'expense', amount: 99_999, categoryId: 'housing', date: '2026-10-31' }),
  tx({ id: 't7', type: 'expense', amount: 4_000, categoryId: 'groceries', date: '2026-12-01' }),
];
const savings: SavingsEntry[] = [
  { id: 's1', kind: 'deposit', amount: 20_000, sourceId: 'salary', date: '2026-11-03', createdAt: at, updatedAt: at },
  { id: 's2', kind: 'withdrawal', amount: 5_000, sourceId: 'salary', date: '2026-11-04', createdAt: at, updatedAt: at },
];
const transfers: WhishTransfer[] = [
  { id: 'w1', kind: 'deposit', amount: 10_000, date: '2026-11-04', createdAt: at, updatedAt: at },
  { id: 'w2', kind: 'withdrawal', amount: 3_000, date: '2026-11-07', createdAt: at, updatedAt: at },
];

const report = buildReport({
  from: '2026-11-01',
  to: '2026-11-30',
  today: '2026-11-10',
  transactions,
  savings,
  transfers,
  categories: DEFAULT_CATEGORIES,
});

describe('buildReport', () => {
  it('totals only what falls inside the range', () => {
    expect(report).toMatchObject({
      income: 305_000,
      expenses: 103_500,
      net: 201_500,
      incomeCount: 2,
      expenseCount: 3,
      recurringExpenses: 100_000,
      oneOffExpenses: 3_500,
    });
    expect(report.keptRate).toBeCloseTo(201_500 / 305_000);
  });

  it('averages spending over the days so far, not the whole month', () => {
    expect(report.days).toBe(10);
    expect(report.dailySpend).toBe(10_350);
  });

  it('breaks spending down by category, budget group and account', () => {
    expect(report.expenseByCategory.map((r) => [r.id, r.amount, r.count])).toEqual([
      ['housing', 100_000, 1],
      ['dining', 2_500, 1],
      ['shopping', 1_000, 1],
    ]);
    expect(report.expenseByCategory.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1);
    expect(report.incomeBySource.map((r) => r.id)).toEqual(['salary', 'client']);
    expect(report.byGroup).toEqual({ needs: 100_000, wants: 3_500, savings: 0, none: 0 });
    expect(report.byAccount).toEqual({
      cash: { income: 300_000, expenses: 102_500 },
      whish: { income: 5_000, expenses: 1_000 },
    });
    expect(report.largestExpense?.id).toBe('t2');
    expect(report.largestIncome?.id).toBe('t1');
  });

  it('includes savings and Whish moves', () => {
    expect(report.savings).toEqual({ deposited: 20_000, withdrawn: 5_000, net: 15_000, count: 2 });
    expect(report.whish).toEqual({ toppedUp: 10_000, withdrawn: 3_000, count: 2 });
  });

  it('lists every entry newest first with a direction', () => {
    expect(report.entries.map((e) => e.id)).toEqual(['w2', 't5', 't3', 't4', 's2', 'w1', 's1', 't2', 't1']);
    const send = report.entries.find((e) => e.id === 't4');
    expect(send).toMatchObject({ sign: -1, account: 'whish', title: 'Sent to Sam', category: 'Shopping' });
    expect(report.entries.find((e) => e.id === 's1')).toMatchObject({ sign: 0, kind: 'savings-deposit' });
  });

  it('groups by month for multi-month ranges', () => {
    const year = buildReport({
      from: '2026-10-01',
      to: '2026-12-31',
      today: '2026-12-31',
      transactions,
      savings: [],
      transfers: [],
      categories: DEFAULT_CATEGORIES,
    });
    expect(year.byMonth.map((m) => [m.month, m.income, m.expenses])).toEqual([
      ['2026-12', 0, 4_000],
      ['2026-11', 305_000, 103_500],
      ['2026-10', 0, 99_999],
    ]);
  });

  it('copes with an empty range and a range in the future', () => {
    const empty = buildReport({
      from: '2027-01-01',
      to: '2027-01-31',
      today: '2026-11-10',
      transactions,
      savings,
      transfers,
      categories: DEFAULT_CATEGORIES,
    });
    expect(empty).toMatchObject({ income: 0, expenses: 0, days: 1, dailySpend: 0, keptRate: null, entries: [] });
  });

  it('finds the earliest date for an all-time report', () => {
    expect(earliestDate({ transactions, savings, transfers })).toBe('2026-10-31');
    expect(earliestDate({ transactions: [], savings: [], transfers: [] })).toBeNull();
  });
});
