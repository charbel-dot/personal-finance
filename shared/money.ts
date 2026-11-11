/** Parses user input like "12", "12.5", "1,234.56" or "12,50" into integer cents. Returns null when invalid. */
export function parseAmount(input: string): number | null {
  let s = input.trim().replace(/\s/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // "1.234,56" or "12,5" – comma is the decimal separator when followed by 1-2 digits.
    const decimals = s.length - lastComma - 1;
    s = decimals > 0 && decimals <= 2 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else {
    s = s.replace(/,/g, '');
  }
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

/** Cents → plain string for an input value: "1234.50" in USD, whole pounds ("150000") in LBP. */
export function centsToInput(cents: number, currency: Currency = 'USD'): string {
  return currency === 'LBP' ? String(Math.round(cents / 100)) : (cents / 100).toFixed(2);
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  cents: number,
  currency: string,
  options: { compact?: boolean; signed?: boolean } = {},
): string {
  const key = `${currency}|${options.compact ? 'c' : ''}|${options.signed ? 's' : ''}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        notation: options.compact ? 'compact' : 'standard',
        maximumFractionDigits: options.compact ? 1 : currency === 'LBP' ? 0 : 2,
        signDisplay: options.signed ? 'exceptZero' : 'auto',
      });
    } catch {
      fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    }
    formatters.set(key, fmt);
  }
  return fmt.format(cents / 100);
}

export function formatPercent(ratio: number, digits = 0): string {
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: digits,
  }).format(Number.isFinite(ratio) ? ratio : 0);
}

/** The only two currencies the app works in. */
export const CURRENCIES = ['USD', 'LBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Lebanese pounds per US dollar used when nothing has been set yet. */
export const DEFAULT_USD_RATE = 89_500;
export const MAX_USD_RATE = 10_000_000;

/**
 * Converts an amount in minor units between USD and LBP at `rate` LBP per USD.
 * Same-currency conversions return the amount untouched.
 */
export function convertCents(cents: number, from: Currency, to: Currency, rate: number): number {
  if (from === to) return cents;
  return from === 'USD' ? Math.round(cents * rate) : Math.round(cents / rate);
}

/**
 * Amounts converted into LBP are rounded to the nearest 1,000 LBP (minor units: 100,000) for
 * display. Lebanese prices are quoted in thousands, and it hides the sub-cent noise of converting
 * a USD-cent amount back (at most ±0.5¢ × rate, i.e. under 500 LBP at today's rates).
 */
export function roundLbp(cents: number): number {
  return Math.round(cents / 100_000) * 100_000;
}

/** Parses an amount typed in `currency`. LBP has no fractions, so dots and commas are separators. */
export function parseAmountIn(input: string, currency: Currency): number | null {
  return parseAmount(currency === 'LBP' ? input.replace(/[.,]/g, '') : input);
}
