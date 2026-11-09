import { Repeat } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Category, Transaction } from '../../shared/schema';
import { useQuickAdd } from '@/context/quickAdd';
import { formatDate, useMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  transaction: Transaction;
  category: Category | undefined;
  showDate?: boolean;
  today: string;
}

export function TransactionRow({ transaction: t, category, showDate = true, today }: Props) {
  const money = useMoney();
  const { openEdit } = useQuickAdd();
  const income = t.type === 'income';
  const name = category?.name ?? (income ? 'Income' : 'Expense');
  const meta = [t.note ? name : null, showDate ? formatDate(t.date, today) : null].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={() => openEdit(t)}
      aria-label={`${name}, ${income ? 'income' : 'expense'} ${money(t.amount)}${t.note ? `, ${t.note}` : ''}, ${formatDate(t.date, today)}. Edit`}
      className="group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent sm:px-6"
    >
      <span
        className="size-2.5 shrink-0 rounded-full bg-(--dot) ring-4 ring-(--dot)/15"
        style={{ '--dot': category?.color ?? 'var(--muted-foreground)' } as CSSProperties}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{t.note ?? name}</span>
        {(meta || t.recurringId) && (
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {t.recurringId && <Repeat className="size-3 shrink-0" aria-label="Recurring" />}
            {meta}
          </span>
        )}
      </span>
      <span className={cn('tabular shrink-0 font-semibold', income ? 'text-income' : 'text-foreground')}>
        {income ? '+' : '−'}
        {money(t.amount)}
      </span>
    </button>
  );
}
