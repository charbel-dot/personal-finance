/**
 * Calendar-date helpers working purely on ISO `YYYY-MM-DD` strings in UTC,
 * so results never depend on the runtime's local timezone.
 */

export function parseIso(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Adds months to an anchor date, clamping to the last day of shorter months (Jan 31 + 1 → Feb 28). */
export function addMonthsClamped(date: string, months: number): string {
  const d = parseIso(date);
  const day = d.getUTCDate();
  const totalMonths = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(totalMonths / 12);
  const monthIndex = totalMonths - year * 12;
  const clampedDay = Math.min(day, daysInMonth(year, monthIndex));
  return toIso(new Date(Date.UTC(year, monthIndex, clampedDay)));
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function startOfMonth(date: string): string {
  return `${monthOf(date)}-01`;
}

export function endOfMonth(date: string): string {
  const d = parseIso(date);
  const last = daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  return `${monthOf(date)}-${String(last).padStart(2, '0')}`;
}

/** Every month key (YYYY-MM) touched by an inclusive date range. */
export function monthsInRange(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = startOfMonth(from);
  const last = monthOf(to);
  while (monthOf(cursor) <= last) {
    months.push(monthOf(cursor));
    cursor = addMonthsClamped(cursor, 1);
  }
  return months;
}

/** Today's date in a given IANA timezone (falls back to UTC on an unknown zone). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return toIso(now);
  }
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

/** True for a real calendar date in `YYYY-MM-DD` form (dependency-free, safe for the client bundle). */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
