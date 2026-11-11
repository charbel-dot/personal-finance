import { describe, expect, it } from 'vitest';
import { centsToInput, convertCents, formatMoney, parseAmountIn, roundLbp } from './money';
import { settings, settingsPatch, transactionInput } from './schema';
import { whishBalance } from './whish';

describe('USD / LBP conversion', () => {
  it('converts both ways at the rate', () => {
    expect(convertCents(1000, 'USD', 'LBP', 89_500)).toBe(89_500_000); // $10 → 895,000 LBP
    expect(convertCents(89_500_000, 'LBP', 'USD', 89_500)).toBe(1000);
    expect(convertCents(1234, 'USD', 'USD', 89_500)).toBe(1234);
  });

  it('round-trips an LBP amount through USD cents once rounded to 1,000 LBP', () => {
    const typed = 15_000_000; // 150,000 LBP
    const stored = convertCents(typed, 'LBP', 'USD', 89_500);
    expect(roundLbp(convertCents(stored, 'USD', 'LBP', 89_500))).toBe(typed);
  });

  it('parses LBP with any thousands separator and never fractions', () => {
    expect(parseAmountIn('150,000', 'LBP')).toBe(15_000_000);
    expect(parseAmountIn('150.000', 'LBP')).toBe(15_000_000);
    expect(parseAmountIn('1,500,000', 'LBP')).toBe(150_000_000);
    expect(parseAmountIn('12.50', 'USD')).toBe(1250);
  });

  it('writes LBP inputs and amounts without decimals', () => {
    expect(centsToInput(15_000_000, 'LBP')).toBe('150000');
    expect(centsToInput(1250, 'USD')).toBe('12.50');
    expect(formatMoney(15_000_000, 'LBP')).not.toMatch(/[.,]00\b/);
  });
});

describe('currency settings', () => {
  it('treats older settings in another currency as USD with the default rate', () => {
    const parsed = settings.parse({ currency: 'EUR', timezone: 'UTC', openingBalance: 0 });
    expect(parsed.currency).toBe('USD');
    expect(parsed.usdRate).toBe(89_500);
    expect(parsed.displayCurrency).toBeUndefined();
  });

  it('keeps LBP accounts in LBP', () => {
    expect(settings.parse({ currency: 'LBP', timezone: 'UTC', openingBalance: 0 }).currency).toBe('LBP');
  });

  it('only accepts USD or LBP and a sane rate', () => {
    expect(settingsPatch.safeParse({ displayCurrency: 'EUR' }).success).toBe(false);
    expect(settingsPatch.safeParse({ usdRate: 0 }).success).toBe(false);
    expect(settingsPatch.safeParse({ usdRate: 89_000 }).success).toBe(true);
  });

  it('never lets a patch change the stored currency', () => {
    expect(settingsPatch.parse({ currency: 'LBP', usdRate: 90_000 })).toEqual({ usdRate: 90_000 });
  });

  it('stores large LBP amounts', () => {
    const big = { type: 'expense', amount: 500_000_000_000, categoryId: 'housing', date: '2026-11-01' };
    expect(transactionInput.safeParse(big).success).toBe(true); // 5 billion LBP
  });
});

describe('whishBalance', () => {
  it('adds top-ups and Whish income, subtracts withdrawals and Whish spending', () => {
    const transfers = [
      { kind: 'deposit', amount: 10_000 },
      { kind: 'withdrawal', amount: 2_000 },
    ] as const;
    const transactions = [
      { type: 'expense', amount: 3_000, account: 'whish' },
      { type: 'income', amount: 500, account: 'whish' },
      { type: 'expense', amount: 99_999 }, // cash: ignored
    ] as const;
    expect(whishBalance([...transfers], [...transactions])).toBe(5_500);
  });
});
