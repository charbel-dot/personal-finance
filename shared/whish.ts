import type { Transaction, WhishTransfer } from './schema';

/** Whish charges 1% of every cash withdrawal, taken from the wallet on top of the amount. */
export const WHISH_WITHDRAWAL_FEE_RATE = 0.01;

/** The fee Whish takes for withdrawing `amount` (minor units, same currency), rounded to the minor unit. */
export const whishWithdrawalFee = (amount: number): number => Math.round(amount * WHISH_WITHDRAWAL_FEE_RATE);

/** Whether a transaction went through the Whish Money wallet. */
export const isWhish = (t: Pick<Transaction, 'account'>): boolean => t.account === 'whish';

/**
 * Signed effect of a transfer on the Whish balance. A withdrawal takes its amount plus its fee
 * (withdrawals recorded before 1.9.0 have no fee).
 */
export const signedTransfer = (e: Pick<WhishTransfer, 'kind' | 'amount' | 'fee'>): number =>
  e.kind === 'deposit' ? e.amount : -(e.amount + (e.fee ?? 0));

/** Total Whish fees paid across `transfers`, in cents. */
export const whishFees = (transfers: Pick<WhishTransfer, 'fee'>[]): number =>
  transfers.reduce((total, e) => total + (e.fee ?? 0), 0);

/** Top-ups − withdrawals (with their fees) + Whish income − Whish expenses, in cents. */
export function whishBalance(
  transfers: Pick<WhishTransfer, 'kind' | 'amount' | 'fee'>[],
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
