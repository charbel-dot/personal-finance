import { addDays, daysBetween } from './dates';
import type { Transaction } from './schema';

export interface PacePoint {
  /** ISO date at the end of the bucket. */
  date: string;
  /** Cumulative spend in the current period up to `date`; null for days still in the future. */
  current: number | null;
  /** Cumulative spend at the same offset into the previous period. */
  previous: number;
}

interface Range {
  from: string;
  to: string;
}

/**
 * Cumulative spending through the period next to the same point of the previous period.
 * Long ranges (over ~3 months) are bucketed by week so the chart stays readable.
 */
export function spendingPace(
  current: Transaction[],
  previous: Transaction[],
  cur: Range,
  prev: Range,
  today: string,
): PacePoint[] {
  const days = daysBetween(cur.from, cur.to) + 1;
  if (days <= 0) return [];
  const step = days > 92 ? 7 : 1;
  const buckets = Math.ceil(days / step);

  const sortedCur = current.filter((t) => t.type === 'expense').sort((a, b) => a.date.localeCompare(b.date));
  const sortedPrev = previous.filter((t) => t.type === 'expense').sort((a, b) => a.date.localeCompare(b.date));

  const points: PacePoint[] = [];
  let ci = 0;
  let pi = 0;
  let curSum = 0;
  let prevSum = 0;
  for (let b = 0; b < buckets; b++) {
    const offset = Math.min(days - 1, b * step + step - 1);
    const date = addDays(cur.from, offset);
    const prevDate = addDays(prev.from, offset);
    while (ci < sortedCur.length && sortedCur[ci].date <= date) curSum += sortedCur[ci++].amount;
    while (pi < sortedPrev.length && sortedPrev[pi].date <= prevDate && sortedPrev[pi].date <= prev.to) {
      prevSum += sortedPrev[pi++].amount;
    }
    const bucketStart = addDays(cur.from, b * step);
    points.push({ date, current: bucketStart > today ? null : curSum, previous: prevSum });
  }
  return points;
}
