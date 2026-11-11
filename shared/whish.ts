import type { Transaction, WhishTransfer } from './schema';

/** Whether a transaction went through the Whish Money wallet. */
export const isWhish = (t: Pick<Transaction, 'account'>): boolean => t.account === 'whish';

/** Signed effect of a transfer on the Whish balance. */
export const signedTransfer = (e: Pick<WhishTransfer, 'kind' | 'amount'>): number =>
  e.kind === 'deposit' ? e.amount : -e.amount;

/** Top-ups − withdrawals + Whish income − Whish expenses, in cents. */
export function whishBalance(
  transfers: Pick<WhishTransfer, 'kind' | 'amount'>[],
  transactions: Pick<Transaction, 'type' | 'amount' | 'account'>[],
): number {
  let total = 0;
  for (const e of transfers) total += signedTransfer(e);
  for (const t of transactions) {
    if (!isWhish(t)) continue;
    total += t.type === 'income' ? t.amount : -t.amount;
  }
  return total;
}

export const byTransferDateDesc = (a: WhishTransfer, b: WhishTransfer) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
