import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { Transaction, TransactionType } from '../../shared/schema';
import { QuickAddContext, type QuickAddApi } from '../context/quickAdd';
import { Sheet } from './Sheet';
import { TransactionForm } from './TransactionForm';

interface State {
  type: TransactionType;
  editing?: Transaction;
  /** Bumped on every open so the form remounts with fresh defaults. */
  nonce: number;
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  // PWA shortcuts: /?add=expense or /?add=income open the sheet straight away.
  const [state, setState] = useState<State | null>(() => {
    const add = params.get('add');
    return add === 'expense' || add === 'income' ? { type: add, nonce: Date.now() } : null;
  });

  const openNew = useCallback<QuickAddApi['openNew']>((type = 'expense') => {
    setState({ type, nonce: Date.now() });
  }, []);
  const openEdit = useCallback<QuickAddApi['openEdit']>((t) => {
    setState({ type: t.type, editing: t, nonce: Date.now() });
  }, []);
  const close = useCallback(() => setState(null), []);

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
  const title = state?.editing ? 'Edit transaction' : 'New transaction';

  return (
    <QuickAddContext value={api}>
      {children}
      <Sheet open={state !== null} onClose={close} title={title}>
        {state && <TransactionForm key={state.nonce} initialType={state.type} editing={state.editing} onDone={close} />}
      </Sheet>
    </QuickAddContext>
  );
}
