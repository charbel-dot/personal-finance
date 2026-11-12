import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { Transaction, TransactionType } from '../../shared/schema';
import { ResponsiveSheet } from './ResponsiveSheet';
import { TransactionForm } from './TransactionForm';
import { QuickAddContext, type QuickAddApi, type QuickAddOptions } from '@/context/quickAdd';

interface State {
  type: TransactionType;
  editing?: Transaction;
  options?: QuickAddOptions;
  /** Bumped on every open so the form remounts with fresh defaults. */
  nonce: number;
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  // PWA shortcuts: /?add=expense or /?add=income open the sheet straight away.
  const [state, setState] = useState<State>(() => {
    const add = params.get('add');
    return { type: add === 'income' ? 'income' : 'expense', nonce: Date.now() };
  });
  // Kept separate from `state` so the form stays rendered while the sheet animates out.
  const [open, setOpen] = useState(() => params.get('add') === 'expense' || params.get('add') === 'income');

  const openNew = useCallback<QuickAddApi['openNew']>((type = 'expense', options) => {
    setState({ type, options, nonce: Date.now() });
    setOpen(true);
  }, []);
  const openEdit = useCallback<QuickAddApi['openEdit']>((t) => {
    setState({ type: t.type, editing: t, nonce: Date.now() });
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  // Drop the shortcut param from the URL so a reload doesn't reopen the sheet.
  const hasAddParam = params.has('add');
  useEffect(() => {
    if (!hasAddParam) return;
    setParams(
      (p) => {
        p.delete('add');
        return p;
      },
      { replace: true },
    );
  }, [hasAddParam, setParams]);

  const api = useMemo(() => ({ openNew, openEdit }), [openNew, openEdit]);
  const title = state.editing
    ? 'Edit Transaction'
    : state.options?.send
      ? 'Send With Whish'
      : state.options?.account === 'whish'
        ? `${state.type === 'income' ? 'Receive' : 'Spend'} With Whish`
        : 'New Transaction';

  return (
    <QuickAddContext value={api}>
      {children}
      <ResponsiveSheet open={open} onClose={close} title={title} fullScreen>
        <TransactionForm
          key={state.nonce}
          initialType={state.type}
          initialAccount={state.options?.account}
          send={state.options?.send}
          editing={state.editing}
          onDone={close}
        />
      </ResponsiveSheet>
    </QuickAddContext>
  );
}
