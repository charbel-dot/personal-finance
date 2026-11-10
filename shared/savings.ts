import { daysBetween } from './dates';
import type { SavingsEntry, SavingsGoal } from './schema';

export interface SourceSavings {
  sourceId: string;
  deposited: number;
  withdrawn: number;
  /** deposited − withdrawn, in cents. */
  net: number;
}

export interface SavingsSummary {
  /** All-time saved amount (deposits minus withdrawals), in cents. */
  total: number;
  deposited: number;
  withdrawn: number;
  /** Per source, largest net first. Sources with no entries are omitted. */
  bySource: SourceSavings[];
}

/** Signed effect of an entry on the savings balance. */
export const signedAmount = (e: Pick<SavingsEntry, 'kind' | 'amount'>): number =>
  e.kind === 'deposit' ? e.amount : -e.amount;

/** Totals for entries whose date falls in [from, to] (both optional, inclusive). */
export function summarizeSavings(entries: SavingsEntry[], from?: string, to?: string): SavingsSummary {
  const map = new Map<string, SourceSavings>();
  let deposited = 0;
  let withdrawn = 0;
  for (const e of entries) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    const row = map.get(e.sourceId) ?? { sourceId: e.sourceId, deposited: 0, withdrawn: 0, net: 0 };
    if (e.kind === 'deposit') {
      row.deposited += e.amount;
      deposited += e.amount;
    } else {
      row.withdrawn += e.amount;
      withdrawn += e.amount;
    }
    row.net = row.deposited - row.withdrawn;
    map.set(e.sourceId, row);
  }
  const bySource = [...map.values()].sort((a, b) => b.net - a.net || a.sourceId.localeCompare(b.sourceId));
  return { total: deposited - withdrawn, deposited, withdrawn, bySource };
}

/** Savings balance across all entries. */
export function savingsBalance(entries: SavingsEntry[]): number {
  return entries.reduce((acc, e) => acc + signedAmount(e), 0);
}

export const bySavingsDateDesc = (a: SavingsEntry, b: SavingsEntry) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

export interface GoalProgress {
  goal: SavingsGoal;
  /** Net saved towards the goal (deposits − withdrawals tagged with it), in cents. */
  saved: number;
  /** 0..1 */
  ratio: number;
  remaining: number;
  reached: boolean;
  /** Whole months left until targetDate (at least 1), when a date is set and not reached. */
  monthsLeft?: number;
  /** Amount to save each month to hit the date, when a date is set and not reached. */
  perMonth?: number;
  /** targetDate is in the past and the goal isn't reached. */
  overdue: boolean;
}

export function goalProgress(goal: SavingsGoal, entries: SavingsEntry[], today: string): GoalProgress {
  const saved = entries.filter((e) => e.goalId === goal.id).reduce((acc, e) => acc + signedAmount(e), 0);
  const remaining = Math.max(0, goal.target - saved);
  const reached = saved >= goal.target;
  const progress: GoalProgress = {
    goal,
    saved,
    ratio: goal.target > 0 ? Math.min(1, Math.max(0, saved / goal.target)) : 0,
    remaining,
    reached,
    overdue: false,
  };
  if (goal.targetDate && !reached) {
    const days = daysBetween(today, goal.targetDate);
    if (days < 0) progress.overdue = true;
    else {
      const monthsLeft = Math.max(1, Math.ceil(days / 30.44));
      progress.monthsLeft = monthsLeft;
      progress.perMonth = Math.ceil(remaining / monthsLeft);
    }
  }
  return progress;
}
