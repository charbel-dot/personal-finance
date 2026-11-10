import { Inbox, ListFilter, Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { addMonthsClamped, endOfMonth, isValidIsoDate, startOfMonth } from '../../shared/dates';
import type { Category, Transaction } from '../../shared/schema';
import { EmptyState, ErrorMessage, RowsSkeleton } from '@/components/Feedback';
import { Page, PageHeader } from '@/components/Layout';
import { TransactionRow } from '@/components/TransactionRow';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { pick, useUrlState } from '@/hooks/use-url-state';
import { formatDayHeading, useMoney } from '@/lib/format';
import { useAppData, useTransactions } from '@/lib/queries';
import { localToday, localYesterday } from '@/lib/today';

type RangeKind = 'month' | '3months' | 'year' | 'all' | 'custom';
type TypeFilter = 'all' | 'income' | 'expense';
type Range = { from: string; to: string };

const PAGE = 100;

function rangeFor(kind: RangeKind, custom: Range, today: string): Range | null {
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

  // Filters live in the URL (?q=&type=&category=&range=&from=&to=) so they are shareable and survive Back.
  const [params, update] = useUrlState();
  const query = params.get('q') ?? '';
  const type = pick<TypeFilter>(params.get('type'), ['all', 'income', 'expense'], 'all');
  const categoryId = params.get('category') ?? 'all';
  const rangeKind = pick<RangeKind>(params.get('range'), ['month', '3months', 'year', 'all', 'custom'], '3months');
  const fromParam = params.get('from') ?? '';
  const toParam = params.get('to') ?? '';
  const custom: Range = {
    from: isValidIsoDate(fromParam) ? fromParam : startOfMonth(today),
    to: isValidIsoDate(toParam) ? toParam : today,
  };
  const setQuery = (q: string) => update({ q });
  const setType = (t: TypeFilter) => update({ type: t === 'all' ? null : t, category: null });
  const setCategoryId = (id: string) => update({ category: id === 'all' ? null : id });
  const setRangeKind = (r: RangeKind) => update({ range: r === '3months' ? null : r });
  const setCustom = (fn: (prev: Range) => Range) => {
    const next = fn(custom);
    update({ from: next.from, to: next.to });
  };
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
    return (tx.data ?? []).filter((t) => {
      if (type !== 'all' && t.type !== type) return false;
      if (categoryId !== 'all' && t.categoryId !== categoryId) return false;
      if (!deferredQuery) return true;
      const haystack =
        `${t.note ?? ''} ${catById.get(t.categoryId)?.name ?? ''} ${(t.amount / 100).toFixed(2)}`.toLowerCase();
      return haystack.includes(deferredQuery);
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
  const clear = () => update({ q: null, type: null, category: null });

  return (
    <Page>
      <PageHeader title="History" subtitle="Every transaction, searchable." />

      <div className="space-y-3">
        <div>
          <Label htmlFor="history-search" className="sr-only">
            Search transactions
          </Label>
          <Input
            id="history-search"
            type="search"
            placeholder="Search notes, categories, amounts…"
            name="q"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            icon={<Search aria-hidden="true" />}
          />
        </div>

        {/* Phones: a two-column grid so every filter is visible; wider screens: one row. */}
        <div
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:flex sm:flex-wrap sm:items-center"
          role="group"
          aria-label="Filters"
        >
          <ListFilter className="size-4 shrink-0 text-muted-foreground max-sm:hidden" aria-hidden="true" />
          <Select value={rangeKind} onValueChange={(v) => setRangeKind(v as RangeKind)}>
            <SelectTrigger aria-label="Date range" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="3months">Last 3 months</SelectItem>
              <SelectItem value="year">This year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as TypeFilter);
            }}
          >
            <SelectTrigger aria-label="Type" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
          <CategorySelect type={type} value={categoryId} onChange={setCategoryId} />
          {hasFilters && (
            <Button variant="ghost" className="h-11 sm:h-10" onClick={clear}>
              <X aria-hidden="true" /> Clear
            </Button>
          )}
        </div>

        {rangeKind === 'custom' && <RangeFields value={custom} onChange={setCustom} />}

        <div className="flex items-center gap-3 text-sm" aria-live="polite">
          <span className="text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'}
          </span>
          <span className="tabular ml-auto font-medium text-income">+{money(totals.income)}</span>
          <span className="tabular font-medium">−{money(totals.expenses)}</span>
        </div>

        <Card className="gap-0 overflow-clip py-0">
          <HistoryList
            status={tx.isPending ? 'loading' : tx.isError ? 'error' : 'ready'}
            error={tx.error}
            onRetry={() => void tx.refetch()}
            filtered={filtered}
            limit={limit}
            onMore={() => setLimit((l) => l + PAGE)}
            hasFilters={hasFilters}
            onClear={clear}
          />
        </Card>
      </div>
    </Page>
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
      <SelectItem key={c.id} value={c.id}>
        {c.name}
        {c.archived ? ' (archived)' : ''}
      </SelectItem>
    ));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Category" className="w-full sm:w-fit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All categories</SelectItem>
        {type === 'all' ? (
          <>
            <SelectGroup>
              <SelectLabel>Expenses</SelectLabel>
              {options(categories.expense)}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Income</SelectLabel>
              {options(categories.income)}
            </SelectGroup>
          </>
        ) : (
          options(categories[type])
        )}
      </SelectContent>
    </Select>
  );
}

function RangeFields({ value, onChange }: { value: Range; onChange: (update: (prev: Range) => Range) => void }) {
  return (
    <div className="grid animate-in grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 fade-in slide-in-from-top-1 sm:max-w-md">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="h-from">From</Label>
        <Input
          id="h-from"
          type="date"
          value={value.from}
          onChange={(e) => {
            const from = e.target.value;
            if (from) onChange((c) => ({ from, to: c.to < from ? from : c.to }));
          }}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="h-to">To</Label>
        <Input
          id="h-to"
          type="date"
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
  if (status === 'loading') return <RowsSkeleton rows={8} />;
  if (status === 'error') return <ErrorMessage error={error} onRetry={onRetry} />;
  if (filtered.length === 0) {
    return hasFilters ? (
      <EmptyState
        icon={Search}
        title="No Matches"
        action={
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear Filters
          </Button>
        }
      >
        Try a different search or filter.
      </EmptyState>
    ) : (
      <EmptyState icon={Inbox} title="No Transactions in This Range">
        Tap + to add your first one.
      </EmptyState>
    );
  }
  return (
    <>
      <DayGroups items={filtered.slice(0, limit)} />
      {filtered.length > limit && (
        <div className="border-t p-4">
          <Button variant="outline" className="w-full" onClick={onMore}>
            Show More
          </Button>
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
          <section
            key={date}
            aria-label={heading}
            className="animate-in duration-300 fade-in [contain-intrinsic-size:auto_240px] [content-visibility:auto]"
          >
            <div className="sticky top-0 z-10 flex justify-between border-b bg-muted px-5 py-2 text-sm font-medium text-muted-foreground">
              <span>{heading}</span>
              <span className="tabular">{money(net, { signed: true })}</span>
            </div>
            <div className="divide-y border-b last:border-b-0">
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
          </section>
        );
      })}
    </>
  );
}
