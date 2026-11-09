import type { CSSProperties } from 'react';
import type { Category, Transaction } from '../../shared/schema';
import { useQuickAdd } from '../context/quickAdd';
import { formatDate, useMoney } from '../lib/format';

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
  const subtitle = [showDate ? formatDate(t.date, today) : null, t.recurringId ? 'Recurring' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      className="list-item"
      onClick={() => openEdit(t)}
      aria-label={`${name}, ${income ? 'income' : 'expense'} ${money(t.amount)}${t.note ? `, ${t.note}` : ''}, ${formatDate(t.date, today)}. Edit`}
    >
      <span className="dot dot--row" style={{ '--dot': category?.color } as CSSProperties} />
      <span className="list-item__main">
        <span className="list-item__title" style={{ display: 'block' }}>
          {t.note ?? name}
        </span>
        <span className="list-item__sub" style={{ display: 'block' }}>
          {t.note ? name : ''}
          {t.note && subtitle ? ' · ' : ''}
          {subtitle}
        </span>
      </span>
      <span className={`amount ${income ? 'amount--income' : 'amount--expense'}`}>
        {income ? '+' : '−'}
        {money(t.amount)}
      </span>
    </button>
  );
}
