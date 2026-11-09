import { describe, expect, it } from 'vitest';
import { monthsInRange, todayIn } from './dates';
import { parseAmount } from './money';

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
