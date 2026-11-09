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

/** Cents → plain decimal string suitable for an input value ("1234.5" → "1234.50"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
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
        maximumFractionDigits: options.compact ? 1 : 2,
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

export const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'CHF',
  'JPY',
  'CNY',
  'INR',
  'AED',
  'SAR',
  'LBP',
  'EGP',
  'TRY',
  'BRL',
  'MXN',
  'ZAR',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'SGD',
  'HKD',
  'NZD',
] as const;
