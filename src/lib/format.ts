import { useMemo } from 'react';
import { parseIso } from '../../shared/dates';
import { centsToInput, convertCents, formatMoney, parseAmountIn, roundLbp, type Currency } from '../../shared/money';
import { useAppData } from './queries';

export interface CurrencyTools {
  /** Currency amounts are stored in. */
  ledger: Currency;
  /** Currency amounts are shown and typed in by default. */
  display: Currency;
  /** Lebanese pounds per US dollar. */
  rate: number;
  /** Stored amount → the same amount in `to` (default: display), LBP rounded to 1,000 when converted. */
  toCurrency: (cents: number, to?: Currency) => number;
  /** Stored amount → input text in `currency` (default: display). */
  toInput: (cents: number, currency?: Currency) => string;
  /**
   * Input text typed in `currency` (default: display) → stored amount, or null when invalid or
   * too small to store. Pass the original stored amount when editing: if the text still reads
   * the same, the original is returned untouched, so re-saving never drifts with rounding.
   */
  fromInput: (input: string, currency?: Currency, original?: number) => number | null;
}

export function useCurrency(): CurrencyTools {
  const { settings } = useAppData();
  const ledger = settings.currency;
  const display = settings.displayCurrency ?? ledger;
  const rate = settings.usdRate;
  return useMemo(() => {
    const toCurrency = (cents: number, to: Currency = display) => {
      const converted = convertCents(cents, ledger, to, rate);
      return to === 'LBP' && ledger !== 'LBP' ? roundLbp(converted) : converted;
    };
    const toInput = (cents: number, currency: Currency = display) =>
      centsToInput(toCurrency(cents, currency), currency);
    const fromInput = (input: string, currency: Currency = display, original?: number) => {
      if (original !== undefined && input === toInput(original, currency)) return original;
      const cents = parseAmountIn(input, currency);
      if (cents === null) return null;
      const stored = convertCents(cents, currency, ledger, rate);
      return stored > 0 ? stored : null;
    };
    return { ledger, display, rate, toCurrency, toInput, fromInput };
  }, [ledger, display, rate]);
}

/** Formats a stored amount in the display currency. */
export function useMoney() {
  const { display, toCurrency } = useCurrency();
  return useMemo(
    () => (cents: number, options?: { compact?: boolean; signed?: boolean }) =>
      formatMoney(toCurrency(cents), display, options),
    [display, toCurrency],
  );
}

/** Formats a stored amount in the second currency (the one that isn't the main currency). */
export function useSecondMoney() {
  const { display, toCurrency } = useCurrency();
  const second = display === 'USD' ? 'LBP' : 'USD';
  return useMemo(
    () => (cents: number, options?: { compact?: boolean; signed?: boolean }) =>
      formatMoney(toCurrency(cents, second), second, options),
    [second, toCurrency],
  );
}

/** Whether a row of figures should stack: any of them is too long to share a phone-width row. */
export function longFigures(values: string[], limit = 14): boolean {
  return values.some((v) => v.length > limit);
}

const rateFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** "1 USD = 89,500 LBP" */
export function formatRate(rate: number): string {
  return `1 USD = ${rateFmt.format(rate)} LBP`;
}

/** Prefix for an amount field: "$" for USD, the plain code "LBP" for Lebanese pounds. */
export function currencySymbol(currency: string): string {
  if (currency === 'LBP') return 'LBP';
  try {
    const part = new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dateYearFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const weekdayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export function formatDate(iso: string, today?: string): string {
  const sameYear = today ? iso.slice(0, 4) === today.slice(0, 4) : true;
  return (sameYear ? dateFmt : dateYearFmt).format(parseIso(iso));
}

export function formatDayHeading(iso: string, today: string, yesterday: string): string {
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  return weekdayFmt.format(parseIso(iso));
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatInDays(days: number): string {
  return relative.format(days, 'day');
}
