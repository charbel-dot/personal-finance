import { Repeat } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Category, Transaction } from '../../shared/schema';
import { useQuickAdd } from '@/context/quickAdd';
import { formatDate, useMoney, useSecondMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  transaction: Transaction;
  category: Category | undefined;
  showDate?: boolean;
  today: string;
}

/** Title, secondary line and accessible label for a transaction row. */
function describe(t: Transaction, name: string, amount: string, date: string, showDate: boolean) {
  const meta = [t.note || t.to ? name : null, t.to ? `To ${t.to}` : null, showDate ? date : null];
  const label = [
    `${name}, ${t.type} ${amount}${t.account === 'whish' ? ' with Whish Money' : ''}`,
    t.to ? `to ${t.to}` : null,
    t.note,
    `${date}. Edit`,
  ];
  return {
    title: t.note ?? (t.to ? `Sent to ${t.to}` : name),
    meta: meta.filter(Boolean).join(' · '),
    label: label.filter(Boolean).join(', '),
  };
}

export function TransactionRow({ transaction: t, category, showDate = true, today }: Props) {
  const money = useMoney();
  const second = useSecondMoney();
  const { openEdit } = useQuickAdd();
  const income = t.type === 'income';
  const name = category?.name ?? (income ? 'Income' : 'Expense');
  const whish = t.account === 'whish';
  const { title, meta, label } = describe(t, name, money(t.amount), formatDate(t.date, today), showDate);

  return (
    <button
      type="button"
      onClick={() => openEdit(t)}
      aria-label={label}
      className="group flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent"
    >
      <span
        className="size-2.5 shrink-0 rounded-full bg-(--dot) ring-4 ring-(--dot)/15"
        style={{ '--dot': category?.color ?? 'var(--muted-foreground)' } as CSSProperties}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {(meta !== '' || Boolean(t.recurringId) || whish) && (
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {whish && (
              <img
                src="/whish-logo.png"
                alt="Whish Money"
                width={12}
                height={12}
                className="size-3 shrink-0 rounded-[3px]"
              />
            )}
            {t.recurringId && <Repeat className="size-3 shrink-0" aria-label="Recurring" />}
            {meta}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className={cn('tabular font-semibold', income ? 'text-income' : 'text-foreground')}>
          {income ? '+' : '−'}
          {money(t.amount)}
        </span>
        <span className="tabular text-xs text-muted-foreground" aria-hidden="true">
          {second(t.amount)}
        </span>
      </span>
    </button>
  );
}
