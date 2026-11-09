import { createContext, use } from 'react';
import type { Transaction, TransactionType } from '../../shared/schema';

export interface QuickAddApi {
  openNew: (type?: TransactionType) => void;
  openEdit: (transaction: Transaction) => void;
}

export const QuickAddContext = createContext<QuickAddApi | null>(null);

export function useQuickAdd(): QuickAddApi {
  const ctx = use(QuickAddContext);
  if (!ctx) throw new Error('useQuickAdd must be used inside <QuickAddProvider>');
  return ctx;
}
