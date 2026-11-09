import { useCallback } from 'react';
import { parseIso } from '../../shared/dates';
import { formatMoney } from '../../shared/money';
import { useAppData } from './queries';

export function useMoney() {
  const { settings } = useAppData();
  const { currency } = settings;
  return useCallback(
    (cents: number, options?: { compact?: boolean; signed?: boolean }) => formatMoney(cents, currency, options),
    [currency],
  );
}

export function currencySymbol(currency: string): string {
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
