import { ArrowDownToLine, ArrowUpFromLine, Percent, PiggyBank } from 'lucide-react';
import { Link } from 'react-router';
import type { CategoriesDoc } from '../../shared/schema';
import { ENTRY_LABEL, type ReportEntry } from '../../shared/report';
import { TransactionRow } from './TransactionRow';
import { formatDate, useMoney, useSecondMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const ROW =
  'flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent';

/**
 * One line of activity. Income and expenses open their edit sheet; savings and Whish moves link to
 * the page where they are managed.
 */
export function EntryRow({
  entry,
  categories,
  today,
  showDate = true,
}: {
  entry: ReportEntry;
  categories: CategoriesDoc;
  today: string;
  showDate?: boolean;
}) {
  const money = useMoney();
  const second = useSecondMoney();
  if (entry.transaction) {
    const t = entry.transaction;
    const category = categories[t.type].find((c) => c.id === t.categoryId);
    return <TransactionRow transaction={t} category={category} today={today} showDate={showDate} />;
  }

  const savings = entry.kind === 'savings-deposit' || entry.kind === 'savings-withdrawal';
  const into = entry.kind === 'savings-deposit' || entry.kind === 'whish-topup';
  const Icon = savings ? PiggyBank : entry.kind === 'whish-fee' ? Percent : into ? ArrowDownToLine : ArrowUpFromLine;
  const label = ENTRY_LABEL[entry.kind];
  const meta = [
    entry.note ? label : null,
    savings ? entry.category : null,
    showDate ? formatDate(entry.date, today) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      to={savings ? '/savings' : '/whish'}
      className={ROW}
      aria-label={`${label} ${money(entry.amount)}${entry.note ? `, ${entry.note}` : ''}, ${formatDate(entry.date, today)}. Open ${savings ? 'Savings' : 'Whish Money'}`}
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full',
          savings ? 'bg-brand/15 text-brand-fg' : 'bg-whish/12 text-whish',
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{entry.title}</span>
        {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
      </span>
      <span className="row-amount flex flex-col items-end" aria-hidden="true">
        <span className="tabular font-semibold">
          {into ? '+' : '−'}
          {money(entry.amount)}
        </span>
        <span className="tabular text-xs text-muted-foreground">{second(entry.amount)}</span>
      </span>
    </Link>
  );
}
