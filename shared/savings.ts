import type { SavingsEntry } from './schema';

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
