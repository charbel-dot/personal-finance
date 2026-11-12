import { Download, Inbox, Printer } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { addDays, addMonthsClamped, endOfMonth, isValidIsoDate, parseIso, startOfMonth } from '../../shared/dates';
import { centsToInput, formatPercent } from '../../shared/money';
import { buildReport, earliestDate, ENTRY_LABEL, type BreakdownRow, type Report } from '../../shared/report';
import type { CategoriesDoc } from '../../shared/schema';
import { FitAmount } from '@/components/FitAmount';
import { WhishLogo } from '@/components/AccountFields';
import { EntryRow } from '@/components/EntryRow';
import { EmptyState, ErrorMessage } from '@/components/Feedback';
import { Page, PageHeader } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { pick, useUrlState } from '@/hooks/use-url-state';
import { download, toCsv } from '@/lib/export';
import { longFigures, useCurrency, useMoney, useSecondMoney } from '@/lib/format';
import { useAppData, useSavings, useTransactions, useWhish } from '@/lib/queries';
import { localToday } from '@/lib/today';
import { cn } from '@/lib/utils';

type RangeKind = 'this-month' | 'last-month' | 'last-30' | 'this-year' | 'last-year' | 'all' | 'custom';
type Range = { from: string; to: string };
type EntryFilter = 'all' | 'income' | 'expense' | 'savings' | 'whish';

const RANGES: { value: RangeKind; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-30', label: 'Last 30 days' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom dates' },
];

const FILTERS: { value: EntryFilter; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expenses' },
  { value: 'savings', label: 'Savings' },
  { value: 'whish', label: 'Whish Money' },
];

const PAGE = 50;

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The dates a preset covers. `null` means everything ever logged (resolved once data loads). */
function presetRange(kind: RangeKind, custom: Range, today: string): Range | null {
  const year = Number(today.slice(0, 4));
  switch (kind) {
    case 'this-month':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'last-month': {
      const from = addMonthsClamped(startOfMonth(today), -1);
      return { from, to: endOfMonth(from) };
    }
    case 'last-30':
      return { from: addDays(today, -29), to: today };
    case 'this-year':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'last-year':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case 'custom':
      return custom;
    case 'all':
      return null;
  }
}

function matchesFilter(kind: string, filter: EntryFilter) {
  if (filter === 'all') return true;
  if (filter === 'savings') return kind.startsWith('savings');
  if (filter === 'whish') return kind.startsWith('whish');
  return kind === filter;
}

/** Report range kept in the URL (?range=&from=&to=), so a report can be bookmarked or shared. */
function useReportRange(today: string) {
  const [params, update] = useUrlState();
  const kind = pick<RangeKind>(
    params.get('range'),
    RANGES.map((r) => r.value),
    'this-month',
  );
  const fromParam = params.get('from') ?? '';
  const toParam = params.get('to') ?? '';
  const parsed: Range = {
    from: isValidIsoDate(fromParam) ? fromParam : startOfMonth(today),
    to: isValidIsoDate(toParam) ? toParam : today,
  };
  // A hand-edited URL with the dates the wrong way round is read in order.
  const custom: Range = parsed.from <= parsed.to ? parsed : { from: parsed.to, to: parsed.from };
  const setKind = (next: RangeKind) =>
    update({
      range: next === 'this-month' ? null : next,
      from: next === 'custom' ? custom.from : null,
      to: next === 'custom' ? custom.to : null,
    });
  // A start after the end drags the end along (and the other way round), so the range is always valid.
  const setCustom = (next: Range, moved: 'from' | 'to') => {
    const fixed =
      next.from <= next.to
        ? next
        : moved === 'from'
          ? { from: next.from, to: next.from }
          : { from: next.to, to: next.to };
    update({ range: 'custom', from: fixed.from, to: fixed.to });
  };
  return { kind, custom, setKind, setCustom };
}

/**
 * Printing always uses the light theme: browsers drop dark backgrounds when printing, which would
 * leave light text on white paper.
 */
function usePrintInLight() {
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = root.classList.contains('dark');
      root.classList.remove('dark');
    };
    const after = () => {
      if (wasDark) root.classList.add('dark');
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
}

export default function Reports() {
  const { categories } = useAppData();
  const today = localToday();
  const { kind, custom, setKind, setCustom } = useReportRange(today);
  const preset = presetRange(kind, custom, today);
  const tx = useTransactions(preset);
  const savings = useSavings();
  const whish = useWhish();
  usePrintInLight();

  const report = useMemo(() => {
    if (!tx.data || !savings.data || !whish.data) return null;
    const lists = { transactions: tx.data, savings: savings.data.items, transfers: whish.data.transfers };
    const range = preset ?? { from: earliestDate(lists) ?? today, to: today };
    const latest = [...lists.transactions, ...lists.savings, ...lists.transfers].reduce(
      (max, e) => (e.date > max ? e.date : max),
      range.to,
    );
    return buildReport({ ...lists, from: range.from, to: preset ? range.to : latest, today, categories });
  }, [tx.data, savings.data, whish.data, preset, today, categories]);

  const error = tx.error ?? savings.error ?? whish.error;

  return (
    <Page>
      <PageHeader
        title="Reports"
        subtitle="Everything you logged, added up every way, for any dates you pick."
        actions={report && <ReportActions report={report} />}
      />
      <div className="stagger grid grid-cols-[minmax(0,1fr)] gap-4 pb-4">
        <RangeCard kind={kind} custom={custom} report={report} onKind={setKind} onCustom={setCustom} />
        {error ? (
          <Card>
            <ErrorMessage
              error={error}
              onRetry={() => {
                void tx.refetch();
                void savings.refetch();
                void whish.refetch();
              }}
            />
          </Card>
        ) : report ? (
          <ReportBody report={report} categories={categories} today={today} />
        ) : (
          <ReportSkeleton />
        )}
      </div>
    </Page>
  );
}

function ReportActions({ report }: { report: Report }) {
  const { display, toCurrency } = useCurrency();
  function exportCsv() {
    const rows = [
      [
        'date',
        'type',
        'description',
        'category or source',
        'account',
        'sent to',
        `amount (${display})`,
        'recurring',
        'note',
      ],
      ...report.entries.map((e) => [
        e.date,
        ENTRY_LABEL[e.kind],
        e.title,
        e.category,
        e.account === 'whish' ? 'Whish Money' : 'Cash',
        e.to ?? '',
        `${e.sign < 0 ? '-' : ''}${centsToInput(toCurrency(e.amount), display)}`,
        e.recurring ? 'yes' : '',
        e.note ?? '',
      ]),
    ];
    download(`money-report-${report.from}-to-${report.to}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
    toast.success(`Exported ${report.entries.length} entries`);
  }
  return (
    <div className="flex gap-2 print:hidden">
      <Button variant="outline" onClick={exportCsv} disabled={report.entries.length === 0}>
        <Download aria-hidden="true" /> Export CSV
      </Button>
      <Button variant="outline" onClick={() => window.print()}>
        <Printer aria-hidden="true" /> Print
      </Button>
    </div>
  );
}

function RangeCard({
  kind,
  custom,
  report,
  onKind,
  onCustom,
}: {
  kind: RangeKind;
  custom: Range;
  report: Report | null;
  onKind: (kind: RangeKind) => void;
  onCustom: (range: Range, moved: 'from' | 'to') => void;
}) {
  return (
    <Card className="gap-4">
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-end print:hidden">
          <div className="space-y-2">
            <Label htmlFor="report-range">Period</Label>
            <Select value={kind} onValueChange={(v) => onKind(v as RangeKind)}>
              <SelectTrigger id="report-range" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <DateField
                id="report-from"
                label="From"
                value={custom.from}
                onChange={(from) => onCustom({ ...custom, from }, 'from')}
              />
              <DateField
                id="report-to"
                label="To"
                value={custom.to}
                onChange={(to) => onCustom({ ...custom, to }, 'to')}
              />
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {report ? <RangeSummary report={report} /> : 'Loading…'}
        </p>
      </CardContent>
    </Card>
  );
}

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        className="h-11"
        value={value}
        onChange={(e) => {
          if (isValidIsoDate(e.target.value)) onChange(e.target.value);
        }}
      />
    </div>
  );
}

function RangeSummary({ report }: { report: Report }) {
  const span = `${dayFmt.format(parseIso(report.from))} – ${dayFmt.format(parseIso(report.to))}`;
  return (
    <>
      <span className="font-medium text-foreground">{span}</span>
      {` · ${report.entries.length} ${report.entries.length === 1 ? 'entry' : 'entries'}`}
    </>
  );
}

function ReportSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4" aria-busy="true" aria-label="Loading report">
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

function ReportBody({ report, categories, today }: { report: Report; categories: CategoriesDoc; today: string }) {
  if (report.entries.length === 0) {
    return (
      <Card>
        <EmptyState icon={Inbox} title="Nothing in These Dates">
          No income, expenses, savings or Whish moves were logged in this period. Try another period.
        </EmptyState>
      </Card>
    );
  }
  return (
    <>
      <SummaryCard report={report} />
      <div className="grid gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))]">
        <BreakdownCard
          title="Spending by Category"
          description="Where your money went."
          rows={report.expenseByCategory}
          total={report.expenses}
          type="expense"
          report={report}
        />
        <BreakdownCard
          title="Income by Source"
          description="Where your money came from."
          rows={report.incomeBySource}
          total={report.income}
          type="income"
          report={report}
        />
        <SplitCard report={report} />
        <MovesCard report={report} />
      </div>
      {report.byMonth.length > 1 && <MonthsCard report={report} />}
      <EntriesCard report={report} categories={categories} today={today} />
    </>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/30 p-3 sm:p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className={cn('mt-1 font-semibold', tone)}>
        <FitAmount text={value} max="1.25rem" min="0.8125rem" />
      </div>
      {sub && <p className="tabular mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{sub}</p>}
    </div>
  );
}

function SummaryCard({ report }: { report: Report }) {
  const money = useMoney();
  const second = useSecondMoney();
  const netTone = report.net > 0 ? 'text-income' : report.net < 0 ? 'text-destructive' : undefined;
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle className="text-base">Summary</CardTitle>
      </CardHeader>
      <CardContent
        className={cn(
          'grid gap-3',
          longFigures([money(report.income), money(report.expenses), money(report.net, { signed: true })], 16)
            ? 'grid-cols-1 sm:grid-cols-2'
            : 'grid-cols-2 lg:grid-cols-4',
        )}
      >
        <Tile
          label="Income"
          value={money(report.income)}
          sub={`${second(report.income)} · ${report.incomeCount} ${report.incomeCount === 1 ? 'entry' : 'entries'}`}
          tone="text-income"
        />
        <Tile
          label="Expenses"
          value={money(report.expenses)}
          sub={`${second(report.expenses)} · ${report.expenseCount} ${report.expenseCount === 1 ? 'entry' : 'entries'}`}
        />
        <Tile
          label="Net"
          value={money(report.net, { signed: true })}
          sub={second(report.net, { signed: true })}
          tone={netTone}
        />
        <Tile
          label="Kept"
          value={report.keptRate === null ? '—' : formatPercent(report.keptRate)}
          sub={report.keptRate === null ? 'No income in this period' : 'of income not spent'}
        />
        <Tile
          label="Spent per day"
          value={money(report.dailySpend)}
          sub={`over ${report.days} ${report.days === 1 ? 'day' : 'days'}`}
        />
        <Tile
          label="Biggest expense"
          value={report.largestExpense ? money(report.largestExpense.amount) : '—'}
          sub={report.largestExpense ? (report.largestExpense.note ?? report.largestExpense.date) : 'None'}
        />
        <Tile
          label="Saved"
          value={money(report.savings.net, { signed: report.savings.net !== 0 })}
          sub={`${money(report.savings.deposited)} in · ${money(report.savings.withdrawn)} out`}
        />
        <Tile
          label="Recurring spend"
          value={money(report.recurringExpenses)}
          sub={`${money(report.oneOffExpenses)} one-off`}
        />
      </CardContent>
    </Card>
  );
}

function historyLink(report: Report, type: 'income' | 'expense', categoryId?: string) {
  const params = new URLSearchParams({ range: 'custom', from: report.from, to: report.to, type });
  if (categoryId) params.set('category', categoryId);
  return `/history?${params.toString()}`;
}

function BreakdownCard({
  title,
  description,
  rows,
  total,
  type,
  report,
}: {
  title: string;
  description: string;
  rows: BreakdownRow[];
  total: number;
  type: 'income' | 'expense';
  report: Report;
}) {
  const money = useMoney();
  return (
    <Card className="gap-0 pb-0 break-inside-avoid">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {description} Total <span className="tabular font-medium text-foreground">{money(total)}</span>
        </CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <p className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
          {type === 'income' ? 'No income in this period.' : 'No spending in this period.'}
        </p>
      ) : (
        <ul className="divide-y border-t">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to={historyLink(report, type, r.id)}
                className="block px-5 py-3 outline-none hover:bg-accent/60 focus-visible:bg-accent"
                aria-label={`${r.name}: ${money(r.amount)}, ${formatPercent(r.share)}, ${r.count} ${r.count === 1 ? 'entry' : 'entries'}. View in History`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="size-2.5 shrink-0 rounded-full bg-(--dot)"
                    style={{ '--dot': r.color ?? 'var(--muted-foreground)' } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {r.count}× · {formatPercent(r.share)}
                  </span>
                  <span className="row-amount tabular font-semibold">{money(r.amount)}</span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-(--dot)"
                    style={
                      {
                        '--dot': r.color ?? 'var(--muted-foreground)',
                        width: `${Math.max(2, r.share * 100)}%`,
                      } as CSSProperties
                    }
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SplitRow({ label, amount, of, color }: { label: ReactNode; amount: number; of: number; color: string }) {
  const money = useMoney();
  const share = of > 0 ? amount / of : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">{label}</span>
        <span className="row-amount tabular">
          <span className="font-semibold">{money(amount)}</span>{' '}
          <span className="text-muted-foreground">{formatPercent(share)}</span>
        </span>
      </div>
      <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-(--bar)"
          style={{ '--bar': color, width: `${share * 100}%` } as CSSProperties}
        />
      </span>
    </div>
  );
}

function SplitCard({ report }: { report: Report }) {
  const g = report.byGroup;
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle className="text-base">How You Spent</CardTitle>
        <CardDescription>Needs, wants and savings, and what was paid with cash or Whish.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SplitRow label="Needs" amount={g.needs} of={report.expenses} color="var(--chart-1)" />
        <SplitRow label="Wants" amount={g.wants} of={report.expenses} color="var(--chart-2)" />
        <SplitRow label="Savings & investing" amount={g.savings} of={report.expenses} color="var(--chart-3)" />
        {g.none > 0 && (
          <SplitRow label="Not grouped" amount={g.none} of={report.expenses} color="var(--muted-foreground)" />
        )}
        <div className="space-y-4 border-t pt-4">
          <SplitRow
            label="Paid with cash"
            amount={report.byAccount.cash.expenses}
            of={report.expenses}
            color="var(--expense)"
          />
          <SplitRow
            label={
              <>
                <WhishLogo size={14} /> Paid with Whish
              </>
            }
            amount={report.byAccount.whish.expenses}
            of={report.expenses}
            color="var(--color-whish)"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MoveLine({ label, value, to }: { label: ReactNode; value: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-sm outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">{label}</span>
      <span className="row-amount tabular font-semibold">{value}</span>
    </Link>
  );
}

function MovesCard({ report }: { report: Report }) {
  const money = useMoney();
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle className="text-base">Savings and Whish</CardTitle>
        <CardDescription>Money moved between your own pots. These don’t count as income or spending.</CardDescription>
      </CardHeader>
      <CardContent className="-mx-2 space-y-1">
        <MoveLine label="Put into savings" value={money(report.savings.deposited)} to="/savings" />
        <MoveLine label="Taken out of savings" value={money(report.savings.withdrawn)} to="/savings" />
        <MoveLine
          label={
            <>
              <WhishLogo size={14} /> Topped up Whish
            </>
          }
          value={money(report.whish.toppedUp)}
          to="/whish"
        />
        <MoveLine
          label={
            <>
              <WhishLogo size={14} /> Withdrawn from Whish
            </>
          }
          value={money(report.whish.withdrawn)}
          to="/whish"
        />
        <MoveLine
          label={
            <>
              <WhishLogo size={14} /> Received into Whish
            </>
          }
          value={money(report.byAccount.whish.income)}
          to="/whish"
        />
        {report.whish.fees > 0 && (
          <MoveLine
            label={
              <>
                <WhishLogo size={14} /> Whish withdrawal fees (1%)
              </>
            }
            value={`−${money(report.whish.fees)}`}
            to="/whish"
          />
        )}
      </CardContent>
    </Card>
  );
}

function MonthsCard({ report }: { report: Report }) {
  const money = useMoney();
  return (
    <Card className="gap-0 pb-0 break-inside-avoid">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Month by Month</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto border-t">
        <table className="w-full min-w-[28rem] text-sm">
          <caption className="sr-only">Income, expenses and net for each month in the period</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="px-5 py-2.5 font-medium">
                Month
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Income
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Expenses
              </th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">
                Net
              </th>
            </tr>
          </thead>
          <tbody className="divide-y border-t">
            {report.byMonth.map((m) => (
              <tr key={m.month}>
                <th scope="row" className="px-5 py-3 text-left font-medium">
                  {monthFmt.format(parseIso(`${m.month}-01`))}
                </th>
                <td className="tabular px-3 py-3 text-right text-income">{money(m.income)}</td>
                <td className="tabular px-3 py-3 text-right">{money(m.expenses)}</td>
                <td
                  className={cn(
                    'tabular px-5 py-3 text-right font-semibold',
                    m.net > 0 ? 'text-income' : m.net < 0 && 'text-destructive',
                  )}
                >
                  {money(m.net, { signed: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EntriesCard({ report, categories, today }: { report: Report; categories: CategoriesDoc; today: string }) {
  const [filter, setFilter] = useState<EntryFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const shown = report.entries.filter((e) => matchesFilter(e.kind, filter));
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <CardTitle className="text-base">All Entries</CardTitle>
          <CardDescription>
            {shown.length} {shown.length === 1 ? 'entry' : 'entries'}, newest first. Tap one to open it.
          </CardDescription>
        </div>
        <div className="w-full space-y-2 sm:w-52 print:hidden">
          <Label htmlFor="report-filter" className="sr-only">
            Show
          </Label>
          <Select
            value={filter}
            onValueChange={(v) => {
              setFilter(v as EntryFilter);
              setLimit(PAGE);
            }}
          >
            <SelectTrigger id="report-filter" className="h-10 w-full" aria-label="Show">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <div className="divide-y border-t">
        {shown.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">Nothing of this kind in the period.</p>
        ) : (
          shown
            .slice(0, limit)
            .map((e) => <EntryRow key={`${e.kind}-${e.id}`} entry={e} categories={categories} today={today} />)
        )}
      </div>
      {shown.length > limit && (
        <div className="border-t p-3 text-center print:hidden">
          <Button variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
            Show {Math.min(PAGE, shown.length - limit)} More
          </Button>
        </div>
      )}
    </Card>
  );
}
