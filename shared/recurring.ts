import { addDays, addMonthsClamped, daysBetween } from './dates';
import type { Frequency, Recurring, Transaction } from './schema';

/** Safety cap so a very old start date can never generate an unbounded batch. */
export const MAX_CATCH_UP = 400;

/** The n-th occurrence (0-based) of a schedule, computed from the anchor so month-end days don't drift. */
export function occurrenceAt(startDate: string, freq: Frequency, n: number): string {
  switch (freq) {
    case 'weekly':
      return addDays(startDate, n * 7);
    case 'monthly':
      return addMonthsClamped(startDate, n);
    case 'yearly':
      return addMonthsClamped(startDate, n * 12);
  }
}

/** Index of the first occurrence strictly after `date` (lower bound estimate, then walk). */
function firstIndexAfter(startDate: string, freq: Frequency, date: string): number {
  if (date < startDate) return 0;
  const days = daysBetween(startDate, date);
  const approx = freq === 'weekly' ? days / 7 : freq === 'monthly' ? days / 31 : days / 366;
  let n = Math.max(0, Math.floor(approx) - 1);
  while (occurrenceAt(startDate, freq, n) <= date) n++;
  return n;
}

/** Occurrence dates in the half-open interval (after, until]. */
export function occurrencesBetween(
  startDate: string,
  freq: Frequency,
  after: string | undefined,
  until: string,
  limit = MAX_CATCH_UP,
): string[] {
  const dates: string[] = [];
  let n = after ? firstIndexAfter(startDate, freq, after) : 0;
  for (;;) {
    const next = occurrenceAt(startDate, freq, n);
    if (next > until || dates.length >= limit) break;
    dates.push(next);
    n++;
  }
  return dates;
}

/** Next due date on or after `today` (or after the last generated one) for display. */
export function nextDueDate(rule: Recurring, today: string): string {
  const after = rule.lastGeneratedDate && rule.lastGeneratedDate >= today ? rule.lastGeneratedDate : addDays(today, -1);
  return occurrenceAt(rule.startDate, rule.frequency, firstIndexAfter(rule.startDate, rule.frequency, after));
}

/** Deterministic id makes generation idempotent across cron + on-load reconciliation. */
export function recurringTransactionId(ruleId: string, date: string): string {
  return `rec_${ruleId}_${date.replaceAll('-', '')}`;
}

export interface GenerationResult {
  transactions: Transaction[];
  rules: Recurring[];
}

/**
 * Pure generator: returns new transactions for every due, non-paused occurrence up to `today`,
 * plus rules with `lastGeneratedDate` advanced. Paused rules are fast-forwarded so resuming
 * does not back-fill the paused period.
 */
export function generateDue(rules: Recurring[], today: string, nowIso: string): GenerationResult {
  const transactions: Transaction[] = [];
  const updated = rules.map((rule) => {
    const due = occurrencesBetween(rule.startDate, rule.frequency, rule.lastGeneratedDate, today);
    if (due.length === 0) return rule;
    const last = due[due.length - 1];
    if (!rule.paused) {
      for (const date of due) {
        transactions.push({
          id: recurringTransactionId(rule.id, date),
          type: rule.type,
          amount: rule.amount,
          categoryId: rule.categoryId,
          date,
          // Transaction notes cap at 280 characters; a long rule name plus note must still fit.
          note: (rule.note ? `${rule.name} · ${rule.note}` : rule.name).slice(0, 280),
          recurringId: rule.id,
          ...(rule.account === 'whish' ? { account: 'whish' as const } : {}),
          ...(rule.account === 'whish' && rule.type === 'expense' && rule.to ? { to: rule.to } : {}),
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }
    return { ...rule, lastGeneratedDate: last, updatedAt: nowIso };
  });
  return { transactions, rules: updated };
}

/** Normalised monthly cost of a rule, used for "recurring as % of income". */
export function monthlyEquivalent(amount: number, freq: Frequency): number {
  switch (freq) {
    case 'weekly':
      return Math.round((amount * 52) / 12);
    case 'monthly':
      return amount;
    case 'yearly':
      return Math.round(amount / 12);
  }
}

/** Upcoming occurrences across all active rules within `days` from today, soonest first. */
export function upcoming(rules: Recurring[], today: string, days = 30): { rule: Recurring; date: string }[] {
  const horizon = addDays(today, days);
  const list: { rule: Recurring; date: string }[] = [];
  for (const rule of rules) {
    if (rule.paused) continue;
    const date = nextDueDate(rule, today);
    if (date <= horizon) list.push({ rule, date });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date) || a.rule.name.localeCompare(b.rule.name));
}
