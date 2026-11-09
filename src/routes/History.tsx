import { useDeferredValue, useMemo, useState } from 'react';
import { addMonthsClamped, endOfMonth, startOfMonth } from '../../shared/dates';
import type { Category, Transaction } from '../../shared/schema';
import { EmptyState, ErrorMessage, SkeletonList } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/Layout';
import { TransactionRow } from '../components/TransactionRow';
import { formatDayHeading, useMoney } from '../lib/format';
import { useAppData, useTransactions } from '../lib/queries';
import { localToday, localYesterday } from '../lib/today';

type RangeKind = 'month' | '3months' | 'year' | 'all' | 'custom';
type TypeFilter = 'all' | 'income' | 'expense';

const PAGE = 100;

function rangeFor(kind: RangeKind, custom: { from: string; to: string }, today: string) {
  switch (kind) {
    case 'month':
      return { from: startOfMonth(today), to: today };
    case '3months':
      return { from: addMonthsClamped(startOfMonth(today), -2), to: today };
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'custom':
      return custom;
    case 'all':
      return null;
  }
}

export default function History() {
  const { categories } = useAppData();
  const money = useMoney();
  const today = localToday();

  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [categoryId, setCategoryId] = useState('all');
  const [rangeKind, setRangeKind] = useState<RangeKind>('3months');
  const [custom, setCustom] = useState({ from: startOfMonth(today), to: today });
  const [limit, setLimit] = useState(PAGE);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const range = rangeFor(rangeKind, custom, today);

  // Ranges ending today also include future-dated entries (up to a year ahead).
  const tx = useTransactions(range?.to === today ? { ...range, to: endOfMonth(addMonthsClamped(today, 12)) } : range);
  const catById = useMemo(
    () => new Map([...categories.expense, ...categories.income].map((c) => [c.id, c])),
    [categories],
  );

  const filtered = useMemo(() => {
    const items = tx.data ?? [];
    return items.filter((t) => {
      if (type !== 'all' && t.type !== type) return false;
      if (categoryId !== 'all' && t.categoryId !== categoryId) return false;
      if (deferredQuery) {
        const haystack =
          `${t.note ?? ''} ${catById.get(t.categoryId)?.name ?? ''} ${(t.amount / 100).toFixed(2)}`.toLowerCase();
        if (!haystack.includes(deferredQuery)) return false;
      }
      return true;
    });
  }, [tx.data, type, categoryId, deferredQuery, catById]);

  const totals = useMemo(() => {
    let income = 0;
    let expenses = 0;
    for (const t of filtered) {
      if (t.type === 'income') income += t.amount;
      else expenses += t.amount;
    }
    return { income, expenses };
  }, [filtered]);

  const hasFilters = query !== '' || type !== 'all' || categoryId !== 'all';

  return (
    <>
      <PageHeader title="History" />
      <div className="main stack">
        <div className="search">
          <Icon name="search" size={18} />
          <label htmlFor="history-search" className="sr-only">
            Search transactions
          </label>
          <input
            id="history-search"
            className="input"
            type="search"
            placeholder="Search notes, categories, amounts"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
        </div>

        <div className="filters">
          <label className="sr-only" htmlFor="f-range">
            Date range
          </label>
          <select
            id="f-range"
            className="select"
            value={rangeKind}
            onChange={(e) => setRangeKind(e.target.value as RangeKind)}
          >
            <option value="month">This month</option>
            <option value="3months">Last 3 months</option>
            <option value="year">This year</option>
            <option value="all">All time</option>
            <option value="custom">Custom…</option>
          </select>
          <label className="sr-only" htmlFor="f-type">
            Type
          </label>
          <select
            id="f-type"
            className="select"
            value={type}
            onChange={(e) => {
              setType(e.target.value as TypeFilter);
              setCategoryId('all');
            }}
          >
            <option value="all">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>
          <label className="sr-only" htmlFor="f-cat">
            Category
          </label>
          <CategorySelect type={type} value={categoryId} onChange={setCategoryId} />
        </div>

        {rangeKind === 'custom' && <RangeFields value={custom} onChange={setCustom} />}

        <div className="row small" aria-live="polite">
          <span className="muted">{filtered.length} transactions</span>
          <span style={{ marginLeft: 'auto' }} className="num amount--income">
            +{money(totals.income)}
          </span>
          <span className="num">−{money(totals.expenses)}</span>
        </div>

        <section className="card card--flush" aria-label="Transactions">
          <HistoryList
            status={tx.isPending ? 'loading' : tx.isError ? 'error' : 'ready'}
            error={tx.error}
            onRetry={() => void tx.refetch()}
            filtered={filtered}
            limit={limit}
            onMore={() => setLimit((l) => l + PAGE)}
            hasFilters={hasFilters}
            onClear={() => {
              setQuery('');
              setType('all');
              setCategoryId('all');
            }}
          />
        </section>
      </div>
    </>
  );
}

function CategorySelect({
  type,
  value,
  onChange,
}: {
  type: TypeFilter;
  value: string;
  onChange: (id: string) => void;
}) {
  const { categories } = useAppData();
  const options = (list: Category[]) =>
    list.map((c) => (
      <option key={c.id} value={c.id}>
        {c.name}
        {c.archived ? ' (archived)' : ''}
      </option>
    ));
  return (
    <select id="f-cat" className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">All categories</option>
      {type === 'all' ? (
        <>
          <optgroup label="Expenses">{options(categories.expense)}</optgroup>
          <optgroup label="Income">{options(categories.income)}</optgroup>
        </>
      ) : (
        options(categories[type])
      )}
    </select>
  );
}

function RangeFields({
  value,
  onChange,
}: {
  value: { from: string; to: string };
  onChange: (update: (prev: { from: string; to: string }) => { from: string; to: string }) => void;
}) {
  return (
    <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div className="field">
        <label htmlFor="h-from" className="field__label">
          From
        </label>
        <input
          id="h-from"
          type="date"
          className="input"
          value={value.from}
          onChange={(e) => {
            const from = e.target.value;
            if (from) onChange((c) => ({ from, to: c.to < from ? from : c.to }));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="h-to" className="field__label">
          To
        </label>
        <input
          id="h-to"
          type="date"
          className="input"
          value={value.to}
          onChange={(e) => {
            const to = e.target.value;
            if (to) onChange((c) => ({ to, from: c.from > to ? to : c.from }));
          }}
        />
      </div>
    </div>
  );
}

interface HistoryListProps {
  status: 'loading' | 'error' | 'ready';
  error: unknown;
  onRetry: () => void;
  filtered: Transaction[];
  limit: number;
  onMore: () => void;
  hasFilters: boolean;
  onClear: () => void;
}

function HistoryList({ status, error, onRetry, filtered, limit, onMore, hasFilters, onClear }: HistoryListProps) {
  if (status === 'loading') return <SkeletonList rows={8} />;
  if (status === 'error') return <ErrorMessage error={error} onRetry={onRetry} />;
  if (filtered.length === 0) {
    return hasFilters ? (
      <EmptyState
        icon="search"
        title="No matches"
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={onClear}>
            Clear filters
          </button>
        }
      >
        Try a different search or filter.
      </EmptyState>
    ) : (
      <EmptyState icon="list" title="No transactions in this range">
        Tap + to add your first one.
      </EmptyState>
    );
  }
  return (
    <>
      <DayGroups items={filtered.slice(0, limit)} />
      {filtered.length > limit && (
        <div style={{ padding: 16 }}>
          <button type="button" className="btn btn--secondary btn--block" onClick={onMore}>
            Show more
          </button>
        </div>
      )}
    </>
  );
}

function DayGroups({ items }: { items: Transaction[] }) {
  const { categories } = useAppData();
  const money = useMoney();
  const today = localToday();
  const yesterday = localYesterday();
  const catById = new Map([...categories.expense, ...categories.income].map((c) => [c.id, c]));
  const groups = new Map<string, Transaction[]>();
  for (const t of items) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
  return (
    <>
      {[...groups].map(([date, dayItems]) => {
        const net = dayItems.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0);
        const heading = formatDayHeading(date, today, yesterday);
        return (
          <div key={date} role="group" aria-label={heading}>
            <div className="day-header">
              <span>{heading}</span>
              <span className="num">{money(net, { signed: true })}</span>
            </div>
            {dayItems.map((t) => (
              <TransactionRow
                key={t.id}
                transaction={t}
                category={catById.get(t.categoryId)}
                today={today}
                showDate={false}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
