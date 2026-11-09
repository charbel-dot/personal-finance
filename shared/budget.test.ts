import { describe, expect, it } from 'vitest';
import { analyzeBudget, computeTotals, suggestSavingsPct } from './budget';
import { DEFAULT_CATEGORIES } from './defaults';
import type { Recurring, Transaction } from './schema';

let seq = 0;
function tx(type: Transaction['type'], categoryId: string, dollars: number, date = '2026-11-05'): Transaction {
  seq++;
  return {
    id: `t${seq}`,
    type,
    categoryId,
    amount: Math.round(dollars * 100),
    date,
    createdAt: '2026-11-05T00:00:00Z',
    updatedAt: '2026-11-05T00:00:00Z',
  };
}

const fmt = (c: number) => `$${(c / 100).toFixed(0)}`;
const base = { categories: DEFAULT_CATEGORIES, recurring: [] as Recurring[], periodDays: 30, format: fmt };

describe('computeTotals', () => {
  it('counts transfers to savings categories as saved, not consumed', () => {
    const t = computeTotals(
      [tx('income', 'salary', 5000), tx('expense', 'housing', 2000), tx('expense', 'savings', 1000)],
      DEFAULT_CATEGORIES,
    );
    expect(t).toMatchObject({ income: 500000, expenses: 300000, net: 200000 });
    expect(t.savingsRate).toBeCloseTo(0.6);
  });

  it('has a zero savings rate without income', () => {
    expect(computeTotals([tx('expense', 'dining', 10)], DEFAULT_CATEGORIES).savingsRate).toBe(0);
  });
});

describe('suggestSavingsPct', () => {
  it('suggests 20% when needs are within 50%', () => {
    expect(suggestSavingsPct(0.4, 0.1)).toBe(0.2);
  });
  it('stretches an already-good rate by 5%, capped at 40%', () => {
    expect(suggestSavingsPct(0.3, 0.27)).toBe(0.3);
    expect(suggestSavingsPct(0.2, 0.6)).toBe(0.4);
  });
  it('lowers the target when needs dominate, but never below 5%', () => {
    expect(suggestSavingsPct(0.6, 0)).toBe(0.15);
    expect(suggestSavingsPct(0.9, 0)).toBe(0.05);
  });
});

describe('analyzeBudget', () => {
  it('computes the 50/30/20 split against income', () => {
    const a = analyzeBudget({
      ...base,
      current: [
        tx('income', 'salary', 4000),
        tx('expense', 'housing', 1600),
        tx('expense', 'groceries', 400),
        tx('expense', 'dining', 600),
        tx('expense', 'savings', 400),
      ],
      previous: [],
    });
    const byGroup = Object.fromEntries(a.rule.map((r) => [r.group, r.pct]));
    expect(byGroup.needs).toBeCloseTo(0.5);
    expect(byGroup.wants).toBeCloseTo(0.15);
    expect(byGroup.savings).toBeCloseTo(0.35);
    expect(a.incomeBySource[0]).toMatchObject({ id: 'salary', share: 1 });
    expect(a.expensesByCategory[0]).toMatchObject({ id: 'housing', name: 'Housing' });
  });

  it('flags overspending as the top tip', () => {
    const a = analyzeBudget({
      ...base,
      current: [tx('income', 'salary', 1000), tx('expense', 'housing', 900), tx('expense', 'shopping', 400)],
      previous: [],
    });
    expect(a.tips[0].id).toBe('overspending');
    expect(a.tips[0].severity).toBe('high');
    expect(a.tips.length).toBeLessThanOrEqual(3);
  });

  it('flags a disproportionate wants category', () => {
    const a = analyzeBudget({
      ...base,
      current: [
        tx('income', 'salary', 5000),
        tx('expense', 'housing', 1000),
        tx('expense', 'groceries', 300),
        tx('expense', 'shopping', 900),
      ],
      previous: [],
    });
    expect(a.insights.map((i) => i.id)).toContain('share-shopping');
  });

  it('flags month-over-month increases above 25% and a meaningful delta', () => {
    const a = analyzeBudget({
      ...base,
      current: [tx('income', 'salary', 5000), tx('expense', 'dining', 600), tx('expense', 'groceries', 410)],
      previous: [tx('expense', 'dining', 300, '2026-10-05'), tx('expense', 'groceries', 400, '2026-10-05')],
    });
    const ids = a.insights.map((i) => i.id);
    expect(ids).toContain('mom-dining');
    expect(ids).not.toContain('mom-groceries');
  });

  it('reports recurring costs as a share of monthly income', () => {
    const recurring: Recurring[] = [
      {
        id: 'r',
        type: 'expense',
        name: 'Rent',
        amount: 200000,
        categoryId: 'housing',
        frequency: 'monthly',
        startDate: '2026-01-01',
        paused: false,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'p',
        type: 'expense',
        name: 'Paused',
        amount: 999999,
        categoryId: 'subscriptions',
        frequency: 'monthly',
        startDate: '2026-01-01',
        paused: true,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const a = analyzeBudget({ ...base, recurring, current: [tx('income', 'salary', 5000)], previous: [] });
    expect(a.recurringMonthly).toBe(200000);
    expect(a.recurringPctOfIncome).toBeCloseTo(0.4, 1);
    expect(a.insights.find((i) => i.id === 'recurring-share')?.severity).toBe('high');
  });

  it('praises a healthy savings rate', () => {
    const a = analyzeBudget({
      ...base,
      current: [tx('income', 'salary', 5000), tx('expense', 'housing', 1500), tx('expense', 'groceries', 500)],
      previous: [],
    });
    expect(a.insights.map((i) => i.id)).toContain('savings-good');
    expect(a.suggestedSavingsPct).toBe(0.4);
  });

  it('asks for income when only expenses exist', () => {
    const a = analyzeBudget({ ...base, current: [tx('expense', 'dining', 20)], previous: [] });
    expect(a.tips[0].id).toBe('no-income');
  });

  it('is empty for no data', () => {
    const a = analyzeBudget({ ...base, current: [], previous: [] });
    expect(a.tips).toEqual([]);
    expect(a.totals.income).toBe(0);
  });
});

describe('custom budget rule', () => {
  it('uses the configured percentages for targets and messages', () => {
    const a = analyzeBudget({
      ...base,
      rule: { needs: 60, wants: 20, savings: 20 },
      current: [tx('income', 'salary', 1000), tx('expense', 'housing', 550), tx('expense', 'dining', 250)],
      previous: [],
    });
    expect(a.rule.map((r) => r.target)).toEqual([0.6, 0.2, 0.2]);
    const wants = a.insights.find((i) => i.id === 'wants-high');
    expect(wants?.title).toContain('target 20%');
    expect(a.insights.map((i) => i.id)).not.toContain('needs-high');
  });

  it('ignores recurring income when measuring committed costs', () => {
    const a = analyzeBudget({
      ...base,
      recurring: [
        {
          id: 's',
          type: 'income',
          name: 'Salary',
          amount: 500000,
          categoryId: 'salary',
          frequency: 'monthly',
          startDate: '2026-01-01',
          paused: false,
          createdAt: '',
          updatedAt: '',
        },
      ],
      current: [tx('income', 'salary', 5000)],
      previous: [],
    });
    expect(a.recurringMonthly).toBe(0);
  });
});
