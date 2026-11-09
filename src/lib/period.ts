import { addDays, addMonthsClamped, daysBetween, endOfMonth, startOfMonth } from '../../shared/dates';

export type PeriodKind = 'this-month' | 'last-month' | 'custom';

export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
}

export interface ResolvedPeriod {
  current: { from: string; to: string };
  /** Comparable period right before `current`, used for period-over-period insights. */
  previous: { from: string; to: string };
  days: number;
  label: string;
}

const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function resolvePeriod(period: Period, today: string): ResolvedPeriod {
  if (period.kind === 'this-month') {
    const from = startOfMonth(today);
    // Month-to-date vs. the same days of last month — a fair comparison mid-month.
    const prevFrom = addMonthsClamped(from, -1);
    const prevTo = addMonthsClamped(today, -1);
    return {
      current: { from, to: endOfMonth(today) },
      previous: { from: prevFrom, to: prevTo },
      // A calendar month is already "monthly": don't extrapolate month-to-date income (salary lands on day 1).
      days: daysBetween(from, endOfMonth(today)) + 1,
      label: monthLabel.format(new Date(`${from}T00:00:00Z`)),
    };
  }
  if (period.kind === 'last-month') {
    const from = addMonthsClamped(startOfMonth(today), -1);
    const to = endOfMonth(from);
    const prevFrom = addMonthsClamped(from, -1);
    return {
      current: { from, to },
      previous: { from: prevFrom, to: endOfMonth(prevFrom) },
      days: daysBetween(from, to) + 1,
      label: monthLabel.format(new Date(`${from}T00:00:00Z`)),
    };
  }
  const days = daysBetween(period.from, period.to) + 1;
  const effectiveDays = Math.max(1, daysBetween(period.from, period.to < today ? period.to : today) + 1);
  return {
    current: { from: period.from, to: period.to },
    previous: { from: addDays(period.from, -days), to: addDays(period.from, -1) },
    days: Math.min(days, effectiveDays),
    label: 'Custom range',
  };
}
