import { createContext, use } from 'react';
import type { Account, Transaction, TransactionType } from '../../shared/schema';

export interface QuickAddOptions {
  /** Pre-select where the money moves through (default: cash). */
  account?: Account;
  /** Open as a Whish "send": asks who the money goes to. */
  send?: boolean;
}

export interface QuickAddApi {
  openNew: (type?: TransactionType, options?: QuickAddOptions) => void;
  openEdit: (transaction: Transaction) => void;
}

export const QuickAddContext = createContext<QuickAddApi | null>(null);

export function useQuickAdd(): QuickAddApi {
  const ctx = use(QuickAddContext);
  if (!ctx) throw new Error('useQuickAdd must be used inside <QuickAddProvider>');
  return ctx;
}
