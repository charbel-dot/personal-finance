import { describe, expect, it } from 'vitest';
import {
  generateDue,
  monthlyEquivalent,
  nextDueDate,
  occurrenceAt,
  occurrencesBetween,
  recurringTransactionId,
  upcoming,
} from './recurring';
import type { Recurring } from './schema';

const NOW = '2026-11-09T12:00:00.000Z';

function rule(overrides: Partial<Recurring> = {}): Recurring {
  return {
    id: 'r1',
    type: 'expense',
    name: 'Rent',
    amount: 120000,
    categoryId: 'housing',
    frequency: 'monthly',
    startDate: '2026-09-01',
    paused: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('occurrenceAt', () => {
  it('clamps monthly anchors to month end without drifting', () => {
    expect(occurrenceAt('2026-01-31', 'monthly', 1)).toBe('2026-02-28');
    expect(occurrenceAt('2026-01-31', 'monthly', 2)).toBe('2026-03-31');
    expect(occurrenceAt('2028-01-31', 'monthly', 1)).toBe('2028-02-29');
  });

  it('handles weekly and yearly (incl. leap day)', () => {
    expect(occurrenceAt('2026-11-02', 'weekly', 3)).toBe('2026-11-23');
    expect(occurrenceAt('2028-02-29', 'yearly', 1)).toBe('2029-02-28');
    expect(occurrenceAt('2028-02-29', 'yearly', 4)).toBe('2032-02-29');
  });

  it('crosses year boundaries', () => {
    expect(occurrenceAt('2026-11-15', 'monthly', 3)).toBe('2027-02-15');
  });
});

describe('occurrencesBetween', () => {
  it('returns all occurrences from start when never generated', () => {
    expect(occurrencesBetween('2026-09-01', 'monthly', undefined, '2026-11-09')).toEqual([
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
    ]);
  });

  it('is exclusive of the cursor and inclusive of until', () => {
    expect(occurrencesBetween('2026-09-01', 'monthly', '2026-10-01', '2026-11-01')).toEqual(['2026-11-01']);
    expect(occurrencesBetween('2026-09-01', 'monthly', '2026-11-01', '2026-11-30')).toEqual([]);
  });

  it('returns nothing for a future start date', () => {
    expect(occurrencesBetween('2026-12-01', 'weekly', undefined, '2026-11-09')).toEqual([]);
  });

  it('caps runaway catch-up', () => {
    expect(occurrencesBetween('2000-01-01', 'weekly', undefined, '2026-11-09', 10)).toHaveLength(10);
  });

  it('finds the right index for long histories', () => {
    expect(occurrencesBetween('2020-01-31', 'monthly', '2026-01-31', '2026-04-01')).toEqual([
      '2026-02-28',
      '2026-03-31',
    ]);
  });
});

describe('generateDue', () => {
  it('creates idempotent transactions and advances the cursor', () => {
    const { transactions, rules } = generateDue([rule()], '2026-11-09', NOW);
    expect(transactions.map((t) => t.date)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(transactions[0]).toMatchObject({
      id: recurringTransactionId('r1', '2026-09-01'),
      type: 'expense',
      amount: 120000,
      categoryId: 'housing',
      recurringId: 'r1',
      note: 'Rent',
    });
    expect(rules[0].lastGeneratedDate).toBe('2026-11-01');

    // Running again on the same day produces nothing and returns the same rule object.
    const again = generateDue(rules, '2026-11-09', NOW);
    expect(again.transactions).toHaveLength(0);
    expect(again.rules[0]).toBe(rules[0]);
  });

  it('fast-forwards paused rules without generating', () => {
    const { transactions, rules } = generateDue([rule({ paused: true })], '2026-11-09', NOW);
    expect(transactions).toHaveLength(0);
    expect(rules[0].lastGeneratedDate).toBe('2026-11-01');
  });

  it('generates deterministic ids so two runs never duplicate', () => {
    const a = generateDue([rule()], '2026-11-09', NOW).transactions.map((t) => t.id);
    const b = generateDue([rule()], '2026-11-09', 'later').transactions.map((t) => t.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('includes the note when present', () => {
    const { transactions } = generateDue([rule({ note: 'Flat 4B', startDate: '2026-11-09' })], '2026-11-09', NOW);
    expect(transactions[0].note).toBe('Rent · Flat 4B');
  });
});

describe('nextDueDate / upcoming', () => {
  it('returns the next date on or after today', () => {
    expect(nextDueDate(rule({ lastGeneratedDate: '2026-11-01' }), '2026-11-09')).toBe('2026-12-01');
    expect(nextDueDate(rule({ startDate: '2026-11-09' }), '2026-11-09')).toBe('2026-11-09');
    expect(nextDueDate(rule({ startDate: '2027-01-15' }), '2026-11-09')).toBe('2027-01-15');
  });

  it('lists upcoming active rules soonest first within the horizon', () => {
    const list = upcoming(
      [
        rule({ id: 'a', name: 'A', startDate: '2026-11-20' }),
        rule({ id: 'b', name: 'B', startDate: '2026-11-12', frequency: 'weekly' }),
        rule({ id: 'c', name: 'C', startDate: '2026-11-10', paused: true }),
        rule({ id: 'd', name: 'D', startDate: '2027-06-01' }),
      ],
      '2026-11-09',
      30,
    );
    expect(list.map((x) => [x.rule.id, x.date])).toEqual([
      ['b', '2026-11-12'],
      ['a', '2026-11-20'],
    ]);
  });
});

describe('monthlyEquivalent', () => {
  it('normalises to a monthly cost', () => {
    expect(monthlyEquivalent(1000, 'weekly')).toBe(4333);
    expect(monthlyEquivalent(1000, 'monthly')).toBe(1000);
    expect(monthlyEquivalent(12000, 'yearly')).toBe(1000);
  });
});

describe('recurring income', () => {
  it('generates income transactions for income rules', () => {
    const { transactions } = generateDue(
      [rule({ id: 'sal', type: 'income', name: 'Salary', categoryId: 'salary', startDate: '2026-11-01' })],
      '2026-11-09',
      NOW,
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ type: 'income', categoryId: 'salary', amount: 120000 });
  });
});
