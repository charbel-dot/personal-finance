import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Inbox,
  Lightbulb,
  PiggyBank,
  Repeat,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { analyzeBudget, type BudgetAnalysis, type Insight } from '../../shared/budget';
import { addDays, daysBetween, isValidIsoDate } from '../../shared/dates';
import { formatPercent } from '../../shared/money';
import { upcoming } from '../../shared/recurring';
import type { Transaction } from '../../shared/schema';
import { EmptyState, ErrorMessage, RowsSkeleton } from '@/components/Feedback';
import { Page, PageHeader } from '@/components/Layout';
import { Segmented } from '@/components/Segmented';
import { TransactionRow } from '@/components/TransactionRow';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuickAdd } from '@/context/quickAdd';
import { useCountUp } from '@/hooks/use-count-up';
import { pick, useUrlState } from '@/hooks/use-url-state';
import { formatDate, formatInDays, useMoney } from '@/lib/format';
import { resolvePeriod, type Period, type PeriodKind } from '@/lib/period';
import { useAppData, useBalance, useMe, useTransactions } from '@/lib/queries';
import { localToday } from '@/lib/today';
import { cn } from '@/lib/utils';
import { CategoryCard, PaceCard } from './DashboardCharts';

const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: 'this-month', label: 'This Month' },
  { kind: 'last-month', label: 'Last Month' },
  { kind: 'custom', label: 'Custom' },
];

const longDate = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function greeting(hour: number) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

/** "charbel.nasseh" → "Charbel": first word of the username, capitalised. */
function firstName(username: string | undefined) {
  const word = username?.split(/[\s._@-]+/).find(Boolean);
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : null;
}

type Range = { from: string; to: string };

/** Dashboard period, kept in the URL (?period=last-month or ?period=custom&from=&to=). */
function useDashboardPeriod(today: string) {
  const [params, update] = useUrlState();
  const fromParam = params.get('from') ?? '';
  const toParam = params.get('to') ?? '';
  const period: Period = {
    kind: pick<PeriodKind>(params.get('period'), ['this-month', 'last-month', 'custom'], 'this-month'),
    from: isValidIsoDate(fromParam) ? fromParam : addDays(today, -29),
    to: isValidIsoDate(toParam) ? toParam : today,
  };
  const setPeriod = (next: Period) => {
    update({
      period: next.kind === 'this-month' ? null : next.kind,
      from: next.kind === 'custom' ? next.from : null,
      to: next.kind === 'custom' ? next.to : null,
    });
  };
  return [period, setPeriod] as const;
}

function DashboardHeader({
  period,
  onPeriod,
  spentToday,
}: {
  period: Period;
  onPeriod: (p: Period) => void;
  spentToday: number;
}) {
  const money = useMoney();
  const me = useMe();
  const name = firstName(me.data?.authenticated ? me.data.username : undefined);
  const now = new Date();
  return (
    <PageHeader
      title={name ? `${greeting(now.getHours())}, ${name}` : greeting(now.getHours())}
      subtitle={
        <>
          {longDate.format(now)}
          {spentToday > 0 && (
            <>
              {' · '}
              <span className="font-medium text-foreground">{money(spentToday)}</span> spent today
            </>
          )}
        </>
      }
      actions={
        <Segmented
          className="w-full sm:w-80"
          fill
          aria-label="Period"
          value={period.kind}
          onValueChange={(kind) => onPeriod({ ...period, kind })}
          items={PERIODS.map((p) => ({ value: p.kind, label: p.label }))}
        />
      }
    />
  );
}

export default function Dashboard() {
  const { categories, recurring, settings } = useAppData();
  const money = useMoney();
  const today = localToday();
  const [period, setPeriod] = useDashboardPeriod(today);
  const resolved = useMemo(
    () => resolvePeriod({ kind: period.kind, from: period.from, to: period.to }, today),
    [period.kind, period.from, period.to, today],
  );
  const { current: curRange, previous: prevRange, days: periodDays } = resolved;
  const tx = useTransactions({ from: prevRange.from, to: curRange.to });

  const { current, previous, analysis } = useMemo(() => {
    const all = tx.data ?? [];
    const inRange = (t: Transaction, r: Range) => t.date >= r.from && t.date <= r.to;
    const cur = all.filter((t) => inRange(t, curRange));
    const prev = all.filter((t) => inRange(t, prevRange));
    return {
      current: cur,
      previous: prev,
      analysis: analyzeBudget({
        current: cur,
        previous: prev,
        categories,
        recurring,
        periodDays,
        format: money,
        rule: settings.budgetRule,
      }),
    };
  }, [tx.data, curRange, prevRange, periodDays, categories, recurring, money, settings.budgetRule]);

  const spentToday = (tx.data ?? [])
    .filter((t) => t.date === today && t.type === 'expense')
    .reduce((a, t) => a + t.amount, 0);
  const status = tx.isError ? 'error' : tx.isPending ? 'loading' : current.length === 0 ? 'empty' : 'ready';
  return (
    <Page>
      <DashboardHeader period={period} onPeriod={setPeriod} spentToday={spentToday} />

      {period.kind === 'custom' && <CustomRange period={period} onChange={setPeriod} />}

      <div className="stagger grid gap-3 sm:gap-4 lg:grid-cols-3">
        <BalanceCard label={resolved.label} range={curRange} analysis={status === 'loading' ? null : analysis} />
        <SavingsCard analysis={status === 'loading' ? null : analysis} />
        <Insights
          status={status}
          error={tx.error}
          onRetry={() => void tx.refetch()}
          analysis={analysis}
          current={current}
          previous={previous}
          cur={curRange}
          prev={prevRange}
          today={today}
        />
        <RecentCard items={tx.isPending ? null : current} today={today} />
        <UpcomingCard today={today} />
      </div>
    </Page>
  );
}

function Insights({
  status,
  error,
  onRetry,
  analysis,
  current,
  previous,
  cur,
  prev,
  today,
}: {
  status: 'error' | 'loading' | 'empty' | 'ready';
  error: unknown;
  onRetry: () => void;
  analysis: BudgetAnalysis;
  current: Transaction[];
  previous: Transaction[];
  cur: Range;
  prev: Range;
  today: string;
}) {
  if (status === 'error') {
    return (
      <Card className="lg:col-span-3">
        <ErrorMessage error={error} onRetry={onRetry} />
      </Card>
    );
  }
  if (status === 'loading') return <Skeleton className="h-80 rounded-xl lg:col-span-3" />;
  if (status === 'empty') return <FirstRun />;
  return (
    <>
      <PaceCard current={current} previous={previous} cur={cur} prev={prev} today={today} />
      <TipsCard tips={analysis.tips} range={cur} />
      <RuleCard analysis={analysis} />
      <CategoryCard
        className="lg:col-span-2"
        title="Spending by Category"
        empty="No expenses in this period."
        slices={analysis.expensesByCategory}
        total={analysis.totals.expenses}
        range={cur}
        type="expense"
      />
      <CategoryCard
        title="Income by Source"
        empty="No income in this period."
        slices={analysis.incomeBySource}
        total={analysis.totals.income}
        range={cur}
        type="income"
      />
    </>
  );
}

/* --------------------------------------------------------------------------- pieces */

function AnimatedMoney({ cents, className, signed }: { cents: number; className?: string; signed?: boolean }) {
  const money = useMoney();
  const value = useCountUp(cents);
  return (
    <span className={cn('tabular', className)}>
      <span className="sr-only">{money(cents, { signed })}</span>
      <span aria-hidden="true">{money(value, { signed })}</span>
    </span>
  );
}

/** Small pulsing dot that marks a figure as live. */
function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2', className)} aria-hidden="true">
      <span className="absolute inset-0 animate-ping rounded-full bg-income opacity-60 [animation-iteration-count:3] motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-income" />
    </span>
  );
}

function IconTile({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) {
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--tone)/12 text-(--tone)"
      style={{ '--tone': tone } as CSSProperties}
      aria-hidden="true"
    >
      <Icon className="size-[18px]" />
    </span>
  );
}

function Stat({
  label,
  value,
  dot,
  tone,
  to,
}: {
  label: string;
  value: ReactNode;
  dot?: string;
  tone?: string;
  /** Where tapping the figure goes (History, filtered). */
  to: string;
}) {
  return (
    <Link
      to={to}
      className="-m-2 block min-w-0 rounded-xl p-2 outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label={`${label}: view transactions`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {dot && <span className="size-2 rounded-full bg-(--dot)" style={{ '--dot': dot } as CSSProperties} />}
        {label}
      </span>
      <span className={cn('tabular mt-1 block truncate text-base font-semibold sm:text-lg', tone)}>{value}</span>
    </Link>
  );
}

function BalanceCard({ label, range, analysis }: { label: string; range: Range; analysis: BudgetAnalysis | null }) {
  const inRange = `/history?range=custom&from=${range.from}&to=${range.to}`;
  const balance = useBalance();
  const { openNew } = useQuickAdd();
  const net = analysis?.totals.net ?? 0;
  const negative = (balance.data?.balance ?? 0) < 0;
  const loadingStat = <Skeleton className="h-6 w-20" />;
  return (
    <Card className="gap-5 lg:col-span-2">
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconTile icon={Wallet} tone="var(--income)" />
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              Current Balance <LiveDot />
            </CardTitle>
            <CardDescription>{label}</CardDescription>
          </div>
        </div>
        <CardAction className="flex gap-2 max-sm:hidden">
          <Button variant="outline" size="sm" className="press" onClick={() => openNew('income')}>
            <ArrowDownLeft className="text-income" aria-hidden="true" /> Income
          </Button>
          <Button variant="outline" size="sm" className="press" onClick={() => openNew('expense')}>
            <ArrowUpRight className="text-expense" aria-hidden="true" /> Expense
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-4xl font-bold tracking-tight sm:text-5xl" aria-live="polite">
          {balance.data ? (
            <Link
              to="/history?range=all"
              className="-m-1 inline-block rounded-xl p-1 outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Balance: view all transactions"
            >
              <AnimatedMoney cents={balance.data.balance} className={negative ? 'text-destructive' : 'text-income'} />
            </Link>
          ) : (
            <Skeleton className="h-12 w-56" />
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 border-t pt-5">
          <Stat
            label="Income"
            to={`${inRange}&type=income`}
            dot="var(--income)"
            value={analysis ? <AnimatedMoney cents={analysis.totals.income} /> : loadingStat}
          />
          <Stat
            label="Expenses"
            to={`${inRange}&type=expense`}
            dot="var(--expense)"
            value={analysis ? <AnimatedMoney cents={analysis.totals.expenses} /> : loadingStat}
          />
          <Stat
            label="Net"
            to={inRange}
            tone={net > 0 ? 'text-income' : net < 0 ? 'text-destructive' : undefined}
            value={analysis ? <AnimatedMoney cents={net} signed /> : loadingStat}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SavingsCard({ analysis }: { analysis: BudgetAnalysis | null }) {
  return (
    <Card className="gap-5">
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconTile icon={PiggyBank} tone="var(--brand-fg)" />
          <div className="min-w-0">
            <CardTitle className="text-base">Saved</CardTitle>
            <CardDescription>Share of income you kept</CardDescription>
          </div>
        </div>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to="/savings">Savings</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        {!analysis ? (
          <Skeleton className="h-24" />
        ) : analysis.totals.income > 0 ? (
          <SavingsBody analysis={analysis} />
        ) : (
          <p className="text-sm text-muted-foreground">Add income for this period to see how much you keep.</p>
        )}
      </CardContent>
    </Card>
  );
}

function SavingsBody({ analysis }: { analysis: BudgetAnalysis }) {
  const money = useMoney();
  const rate = Math.max(0, analysis.totals.savingsRate);
  const shownRate = useCountUp(Math.round(rate * 1000));
  const target = analysis.suggestedSavingsPct;
  const onTrack = rate >= target;
  const Trend = onTrack ? TrendingUp : TrendingDown;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="tabular text-4xl font-bold tracking-tight">
          <span className="sr-only">{formatPercent(rate)}</span>
          <span aria-hidden="true">{formatPercent(shownRate / 1000)}</span>
        </p>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            onTrack ? 'bg-income-soft text-income' : 'bg-expense-soft text-expense',
          )}
        >
          <Trend className="size-3.5" aria-hidden="true" />
          {onTrack ? 'On track' : 'Below target'}
        </span>
      </div>
      <div className="space-y-2">
        <div className="relative h-2.5 rounded-full bg-muted" aria-hidden="true">
          <div
            className={cn('grow-x h-full rounded-full', onTrack ? 'bg-income' : 'bg-expense')}
            style={{ width: `${Math.min(100, rate * 100)}%` }}
          />
          <span
            className="absolute -top-1 h-4.5 w-0.5 rounded-full bg-foreground/70"
            style={{ left: `${Math.min(100, target * 100)}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Target {formatPercent(target)} ≈ {money(analysis.suggestedSavingsAmount)}/month
        </p>
      </div>
    </>
  );
}

const TIP_STYLE: Record<Insight['severity'], { icon: LucideIcon; className: string }> = {
  high: { icon: CircleAlert, className: 'text-destructive' },
  medium: { icon: CircleAlert, className: 'text-warning' },
  low: { icon: Lightbulb, className: 'text-muted-foreground' },
  positive: { icon: CircleCheck, className: 'text-income' },
};

/** Where a tip leads: the transactions, categories or page it is about. */
function tipLink(id: string, range: Range): string {
  const inRange = `/history?range=custom&from=${range.from}&to=${range.to}`;
  const category = /^(?:share|mom)-(.+)$/.exec(id)?.[1];
  if (category) return `${inRange}&category=${encodeURIComponent(category)}`;
  switch (id) {
    case 'needs-high':
    case 'wants-high':
      return '/categories';
    case 'savings-gap':
    case 'savings-good':
      return '/savings';
    case 'recurring-share':
      return '/recurring';
    case 'no-income':
      return `${inRange}&type=income`;
    default:
      return `${inRange}&type=expense`;
  }
}

function TipsCard({ tips, range }: { tips: Insight[]; range: Range }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Budget Tips</CardTitle>
        <CardDescription>Worked out from your own numbers, refreshed as you log.</CardDescription>
      </CardHeader>
      <CardContent>
        {tips.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to flag right now. Keep logging and tips will appear.</p>
        ) : (
          <ul className="stagger space-y-2.5">
            {tips.map((t) => {
              const { icon: Icon, className } = TIP_STYLE[t.severity];
              return (
                <li key={t.id}>
                  <Link
                    to={tipLink(t.id, range)}
                    className={cn(
                      'flex gap-3 rounded-xl border p-3.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      t.severity === 'high' ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/40',
                    )}
                  >
                    <Icon className={cn('mt-0.5 size-[18px] shrink-0', className)} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{t.detail}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const GROUP_LABEL = { needs: 'Needs', wants: 'Wants', savings: 'Savings' } as const;

function RuleCard({ analysis }: { analysis: BudgetAnalysis }) {
  const { settings } = useAppData();
  const r = settings.budgetRule;
  const split = settings.autoSplit;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {split ? 'Budget Split' : 'Budget Check'}{' '}
          <span className="tabular font-normal text-muted-foreground">
            {r.needs}/{r.wants}/{r.savings}
          </span>
        </CardTitle>
        <CardDescription>
          {split
            ? 'Your income, split into buckets: what’s left in each.'
            : 'Needs, wants and savings as a share of income.'}
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings">Edit</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="stagger space-y-5">
        {analysis.totals.income === 0 ? (
          <p className="text-sm text-muted-foreground">Add income for this period to see your buckets.</p>
        ) : split ? (
          analysis.rule.map((b) => (
            <BucketLink key={b.group} group={b.group}>
              <SplitBucket bucket={b} income={analysis.totals.income} />
            </BucketLink>
          ))
        ) : (
          analysis.rule.map((b) => (
            <BucketLink key={b.group} group={b.group}>
              <ShareBucket bucket={b} />
            </BucketLink>
          ))
        )}
      </CardContent>
    </Card>
  );
}

type Bucket = BudgetAnalysis['rule'][number];

/** Savings goes to the Savings page; needs and wants to the categories behind them. */
function BucketLink({ group, children }: { group: Bucket['group']; children: ReactNode }) {
  return (
    <Link
      to={group === 'savings' ? '/savings' : '/categories'}
      className="-mx-2 block rounded-xl px-2 py-1.5 outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
    </Link>
  );
}

/** Auto-split view: the bucket's share of income, what went out of it, and what is left. */
function SplitBucket({ bucket, income }: { bucket: Bucket; income: number }) {
  const money = useMoney();
  const allocated = Math.round(income * bucket.target);
  const used = bucket.amount;
  const savings = bucket.group === 'savings';
  const left = allocated - used;
  const ratio = allocated > 0 ? used / allocated : 0;
  const good = savings ? used >= allocated : used <= allocated;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          <span className="font-medium">{GROUP_LABEL[bucket.group]}</span>
          <span className="tabular text-muted-foreground"> · {money(allocated, { compact: true })}</span>
        </span>
        <span className={cn('tabular font-semibold', good ? 'text-income' : 'text-expense')}>
          {savings
            ? used >= allocated
              ? `${money(used, { compact: true })} saved`
              : `${money(allocated - used, { compact: true })} to go`
            : left >= 0
              ? `${money(left, { compact: true })} left`
              : `${money(-left, { compact: true })} over`}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${GROUP_LABEL[bucket.group]}: ${money(used)} of ${money(allocated)}`}
      >
        <div
          className={cn('grow-x h-full rounded-full', good ? 'bg-income' : 'bg-expense')}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Classic view: each group as a share of income against its target. */
function ShareBucket({ bucket }: { bucket: Bucket }) {
  const money = useMoney();
  const pct = Math.round(bucket.pct * 100);
  const ok = bucket.group === 'savings' ? bucket.pct >= bucket.target : bucket.pct <= bucket.target;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          <span className="font-medium">{GROUP_LABEL[bucket.group]}</span>
          <span className="text-muted-foreground"> · target {Math.round(bucket.target * 100)}%</span>
        </span>
        <span className={cn('tabular font-semibold', ok ? 'text-income' : 'text-expense')}>
          {pct}% <span className="font-normal text-muted-foreground">· {money(bucket.amount, { compact: true })}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn('grow-x h-full rounded-full', ok ? 'bg-income' : 'bg-expense')}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
        <span
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground/60"
          style={{ left: `${bucket.target * 100}%` }}
        />
      </div>
    </div>
  );
}

function RecentCard({ items, today }: { items: Transaction[] | null; today: string }) {
  const { categories } = useAppData();
  const byId = new Map([...categories.expense, ...categories.income].map((c) => [c.id, c]));
  return (
    <Card className="gap-0 pb-0 lg:col-span-2">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Recent Transactions</CardTitle>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to="/history">View All</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <div className="divide-y border-t">
        {items === null ? (
          <RowsSkeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState icon={Inbox} title="No Transactions Yet" />
        ) : (
          items
            .slice(0, 6)
            .map((t) => <TransactionRow key={t.id} transaction={t} category={byId.get(t.categoryId)} today={today} />)
        )}
      </div>
    </Card>
  );
}

function UpcomingCard({ today }: { today: string }) {
  const { recurring, categories } = useAppData();
  const money = useMoney();
  const list = upcoming(recurring, today, 30);
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Upcoming</CardTitle>
        <CardDescription>Recurring, next 30 days</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to="/recurring">Manage</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <div className="border-t">
        {list.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nothing Due Soon">
            Add rent, bills and subscriptions under Recurring.
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {list.map(({ rule, date }) => {
              const cat = categories[rule.type].find((c) => c.id === rule.categoryId);
              const inDays = daysBetween(today, date);
              const soon = inDays <= 3;
              return (
                <li key={rule.id}>
                  <Link
                    to={`/recurring?edit=${encodeURIComponent(rule.id)}`}
                    className="flex min-h-16 items-center gap-3 px-5 py-3 outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                  >
                    <Repeat
                      className="size-4 shrink-0 text-(--dot)"
                      style={{ '--dot': cat?.color } as CSSProperties}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate font-medium">
                        {rule.name}
                        {soon && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-expense-soft px-1.5 py-0.5 text-[11px] font-medium text-expense">
                            <span className="size-1.5 animate-pulse rounded-full bg-expense" aria-hidden="true" />
                            {rule.type === 'income' ? 'Arriving soon' : 'Due soon'}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(date, today)} · {formatInDays(inDays)}
                      </p>
                    </div>
                    <span className={cn('tabular font-semibold', rule.type === 'income' && 'text-income')}>
                      {rule.type === 'income' ? '+' : ''}
                      {money(rule.amount)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function FirstRun() {
  const { openNew } = useQuickAdd();
  return (
    <Card className="lg:col-span-3">
      <EmptyState
        icon={Wallet}
        title="Nothing Logged for This Period"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openNew('income')}>
              Add Income
            </Button>
            <Button onClick={() => openNew('expense')}>Add Expense</Button>
          </div>
        }
      >
        Log income and expenses to see your spending pace, charts and budget tips.
      </EmptyState>
    </Card>
  );
}

function CustomRange({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const tooLong = daysBetween(period.from, period.to) > 3650;
  return (
    <Card className="mb-4 animate-in py-4 fade-in slide-in-from-top-1">
      <CardContent className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 px-4 sm:max-w-md">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="range-from">From</Label>
          <Input
            id="range-from"
            type="date"
            value={period.from}
            max={period.to}
            onChange={(e) => {
              const from = e.target.value;
              if (from) onChange({ ...period, from, to: period.to < from ? from : period.to });
            }}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="range-to">To</Label>
          <Input
            id="range-to"
            type="date"
            value={period.to}
            min={period.from}
            onChange={(e) => {
              const to = e.target.value;
              if (to) onChange({ ...period, to, from: period.from > to ? to : period.from });
            }}
          />
        </div>
        {tooLong && (
          <p className="col-span-2 text-sm text-destructive" role="alert">
            Ranges are limited to 10 years.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
