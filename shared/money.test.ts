import { describe, expect, it } from 'vitest';
import { monthsInRange, todayIn } from './dates';
import { formatAmountInput, parseAmount, parseAmountIn } from './money';

describe('parseAmount', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.55', 1255],
    ['1,234.56', 123456],
    ['12,50', 1250],
    ['1.234,56', 123456],
    [' 7 ', 700],
  ])('parses %s', (input, cents) => {
    expect(parseAmount(input)).toBe(cents);
  });

  it.each(['', 'abc', '-5', '0', '1.234', '12.345', '1e5'])('rejects %s', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('dates', () => {
  it('lists months in a range', () => {
    expect(monthsInRange('2026-11-30', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('computes today in a timezone', () => {
    const now = new Date('2026-11-09T23:30:00Z');
    expect(todayIn('UTC', now)).toBe('2026-11-09');
    expect(todayIn('Asia/Beirut', now)).toBe('2026-11-10');
    expect(todayIn('Not/AZone', now)).toBe('2026-11-09');
  });
});

describe('isValidIsoDate', () => {
  it('accepts real dates and rejects impossible ones', async () => {
    const { isValidIsoDate } = await import('./dates');
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('26-1-1')).toBe(false);
  });
});

describe('formatAmountInput', () => {
  it.each([
    ['', 'USD', ''],
    ['1234', 'USD', '1,234'],
    ['1234567.891', 'USD', '1,234,567.89'],
    ['1,2345', 'USD', '12,345'],
    ['.5', 'USD', '0.5'],
    ['12,', 'USD', '12.'],
    ['1,234,', 'USD', '1,234.'],
    ['007', 'USD', '7'],
    ['-1500', 'USD', '-1,500'],
    ['600000', 'LBP', '600,000'],
    ['600.000', 'LBP', '600,000'],
    ['1,500,000', 'LBP', '1,500,000'],
    ['-89500', 'LBP', '-89,500'],
  ] as const)('formats %s in %s', (raw, currency, expected) => {
    expect(formatAmountInput(raw, currency)).toBe(expected);
  });

  it('round-trips through parsing', () => {
    expect(parseAmountIn(formatAmountInput('1234567.5', 'USD'), 'USD')).toBe(123_456_750);
    expect(parseAmountIn(formatAmountInput('600000', 'LBP'), 'LBP')).toBe(60_000_000);
  });
});
