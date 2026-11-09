import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { monthOf } from '../../shared/dates';
import type {
  Bootstrap,
  CategoriesDoc,
  RecurringInput,
  SettingsPatch,
  Transaction,
  TransactionInput,
} from '../../shared/schema';
import { api } from './api';

export const keys = {
  me: ['me'] as const,
  bootstrap: ['bootstrap'] as const,
  balance: ['balance'] as const,
  transactions: (from?: string, to?: string) => ['transactions', from ?? 'all', to ?? 'all'] as const,
  allTransactions: ['transactions'] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: api.me, retry: false, staleTime: 5 * 60_000 });
}

export function useBootstrap() {
  return useQuery({ queryKey: keys.bootstrap, queryFn: api.bootstrap, staleTime: 60_000 });
}

/** Bootstrap data for components rendered under <RequireData>; never undefined there. */
export function useAppData(): Bootstrap {
  const { data } = useBootstrap();
  if (!data) throw new Error('useAppData used before bootstrap loaded');
  return data;
}

export function useBalance() {
  return useQuery({ queryKey: keys.balance, queryFn: api.balance, staleTime: 30_000 });
}

export function useTransactions(range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: keys.transactions(range?.from, range?.to),
    queryFn: () => api.transactions(range ?? undefined),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.allTransactions }),
      qc.invalidateQueries({ queryKey: keys.balance }),
      qc.invalidateQueries({ queryKey: keys.bootstrap }),
    ]);
}

export function useSaveTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ original, input }: { original?: Transaction; input: TransactionInput }) =>
      original ? api.updateTransaction(original.id, monthOf(original.date), input) : api.createTransaction(input),
    onSettled: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (t: Transaction) => api.deleteTransaction(t.id, monthOf(t.date)),
    onSettled: invalidate,
  });
}

export function useSaveRecurring() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RecurringInput }) =>
      id ? api.updateRecurring(id, input) : api.createRecurring(input),
    onSettled: invalidate,
  });
}

export function useDeleteRecurring() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.deleteRecurring, onSettled: invalidate });
}

export function useSaveCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (doc: CategoriesDoc) => api.putCategories(doc),
    onSuccess: (categories) =>
      qc.setQueryData<Bootstrap>(keys.bootstrap, (prev) => (prev ? { ...prev, categories } : prev)),
  });
}

export function usePatchSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.patchSettings(patch),
    onSuccess: (settings) => {
      qc.setQueryData<Bootstrap>(keys.bootstrap, (prev) => (prev ? { ...prev, settings } : prev));
      return qc.invalidateQueries({ queryKey: keys.balance });
    },
  });
}
