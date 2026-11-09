import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { analyzeBudget, type BudgetAnalysis, type Insight, type Slice } from '../../shared/budget';
import { addDays, daysBetween } from '../../shared/dates';
import { formatPercent } from '../../shared/money';
import { upcoming } from '../../shared/recurring';
import type { Category, Transaction } from '../../shared/schema';
import { Donut } from '../components/Donut';
import { EmptyState, ErrorMessage, Skeleton, SkeletonList } from '../components/Feedback';
import { Icon, type IconName } from '../components/Icon';
import { PageHeader } from '../components/Layout';
import { TransactionRow } from '../components/TransactionRow';
import { useQuickAdd } from '../context/quickAdd';
import { formatDate, formatInDays, useMoney } from '../lib/format';
import { resolvePeriod, type Period, type PeriodKind } from '../lib/period';
import { useAppData, useBalance, useTransactions } from '../lib/queries';
import { localToday } from '../lib/today';

const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: 'this-month', label: 'This month' },
  { kind: 'last-month', label: 'Last month' },
  { kind: 'custom', label: 'Custom' },
];

export default function Dashboard() {
  const { categories, recurring } = useAppData();
  const money = useMoney();
  const today = localToday();
  const [period, setPeriod] = useState<Period>(() => ({
    kind: 'this-month',
    from: addDays(today, -29),
    to: today,
  }));
  const resolved = useMemo(() => resolvePeriod(period, today), [period, today]);
  const { current: curRange, previous: prevRange, days: periodDays } = resolved;
  const tx = useTransactions({ from: prevRange.from, to: curRange.to });

  const { current, analysis } = useMemo(() => {
    const all = tx.data ?? [];
    const inRange = (t: Transaction, r: { from: string; to: string }) => t.date >= r.from && t.date <= r.to;
    const cur = all.filter((t) => inRange(t, curRange));
    const prev = all.filter((t) => inRange(t, prevRange));
    return {
      current: cur,
      analysis: analyzeBudget({
        current: cur,
        previous: prev,
        categories,
        recurring,
        periodDays,
        format: (c) => money(c),
      }),
    };
  }, [tx.data, curRange, prevRange, periodDays, categories, recurring, money]);

  const loading = tx.isPending;

  return (
    <>
      <PageHeader title="Overview" />
      <div className="main stack">
        <div className="segmented" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.kind}
              type="button"
              aria-pressed={period.kind === p.kind}
              onClick={() => setPeriod((prev) => ({ ...prev, kind: p.kind }))}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period.kind === 'custom' && <CustomRange period={period} onChange={setPeriod} />}

        <BalanceCard label={resolved.label} analysis={loading ? null : analysis} />
        <Insights
          state={tx.isError ? 'error' : loading ? 'loading' : current.length === 0 ? 'empty' : 'ready'}
          error={tx.error}
          onRetry={() => void tx.refetch()}
          analysis={analysis}
        />
        <RecentCard items={loading ? null : current} today={today} />

        <UpcomingCard today={today} categories={categories.expense} />
      </div>
    </>
  );
}

function BalanceCard({ label, analysis }: { label: string; analysis: BudgetAnalysis | null }) {
  const money = useMoney();
  const balance = useBalance();
  const net = analysis?.totals.net ?? 0;
  return (
    <section className="card hero" aria-labelledby="balance-label">
      <div className="card__title">
        <span className="tile" style={{ '--tile': 'var(--income)' } as CSSProperties}>
          <Icon name="wallet" size={18} />
        </span>
        <div>
          <h2 id="balance-label">Current balance</h2>
          <p className="muted xs">{label}</p>
        </div>
      </div>
      <p
        className="hero__amount num"
        aria-live="polite"
        data-negative={balance.data ? balance.data.balance < 0 : undefined}
      >
        {balance.data ? money(balance.data.balance) : <Skeleton width={160} height={38} style={{ opacity: 0.4 }} />}
      </p>
      <div className="stat-row">
        <Stat label="Income" dot="var(--income)" value={analysis && money(analysis.totals.income)} />
        <Stat label="Expenses" dot="var(--expense)" value={analysis && money(analysis.totals.expenses)} />
        <Stat
          label="Net"
          value={analysis && money(net, { signed: true })}
          tone={net > 0 ? 'good' : net < 0 ? 'bad' : undefined}
        />
      </div>
    </section>
  );
}

function Insights({
  state,
  error,
  onRetry,
  analysis,
}: {
  state: 'error' | 'loading' | 'empty' | 'ready';
  error: unknown;
  onRetry: () => void;
  analysis: BudgetAnalysis;
}) {
  if (state === 'error') {
    return (
      <div className="card">
        <ErrorMessage error={error} onRetry={onRetry} />
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div className="grid-2">
        <Skeleton height={200} style={{ borderRadius: 14 }} />
        <Skeleton height={200} style={{ borderRadius: 14 }} />
      </div>
    );
  }
  if (state === 'empty') return <FirstRun />;
  return (
    <>
      <Tips tips={analysis.tips} />
      <div className="grid-2">
        <DonutCard
          title="Expenses by category"
          slices={analysis.expensesByCategory}
          total={analysis.totals.expenses}
          empty="No expenses in this period"
        />
        <DonutCard
          title="Income by source"
          slices={analysis.incomeBySource}
          total={analysis.totals.income}
          empty="No income in this period"
        />
        <SplitCard analysis={analysis} />
        <RuleCard analysis={analysis} />
      </div>
    </>
  );
}

function RecentCard({ items, today }: { items: Transaction[] | null; today: string }) {
  const { categories } = useAppData();
  const byId = new Map([...categories.expense, ...categories.income].map((c) => [c.id, c]));
  return (
    <section className="card card--flush" aria-labelledby="recent-h">
      <div className="card__head">
        <h2 id="recent-h">Recent</h2>
        <Link to="/history" className="link-btn">
          See all
        </Link>
      </div>
      {items === null ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState icon="list" title="No transactions yet" />
      ) : (
        <div style={{ marginTop: 8 }}>
          {items.slice(0, 6).map((t) => (
            <TransactionRow key={t.id} transaction={t} category={byId.get(t.categoryId)} today={today} />
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  dot,
  tone,
}: {
  label: string;
  value: string | null;
  dot?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div>
      <p className="stat__label muted">
        {dot && <span className="dot" style={{ '--dot': dot } as CSSProperties} />}
        {label}
      </p>
      <p className="stat__value num" data-tone={tone}>
        {value ?? <Skeleton width={70} height={18} style={{ opacity: 0.4 }} />}
      </p>
    </div>
  );
}

function CustomRange({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const tooLong = daysBetween(period.from, period.to) > 3650;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label htmlFor="range-from" className="field__label">
            From
          </label>
          <input
            id="range-from"
            type="date"
            className="input"
            value={period.from}
            max={period.to}
            onChange={(e) => {
              const from = e.target.value;
              if (from) onChange({ ...period, from, to: period.to < from ? from : period.to });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="range-to" className="field__label">
            To
          </label>
          <input
            id="range-to"
            type="date"
            className="input"
            value={period.to}
            min={period.from}
            onChange={(e) => {
              const to = e.target.value;
              if (to) onChange({ ...period, to, from: period.from > to ? to : period.from });
            }}
          />
        </div>
      </div>
      {tooLong && (
        <p className="field__error" role="alert" style={{ marginTop: 8 }}>
          Ranges are limited to 10 years.
        </p>
      )}
    </div>
  );
}

function FirstRun() {
  const { openNew } = useQuickAdd();
  return (
    <div className="card">
      <EmptyState
        title="Nothing logged for this period"
        action={
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => openNew('income')}>
              Add income
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => openNew('expense')}>
              Add expense
            </button>
          </div>
        }
      >
        Log income and expenses to see charts and personalised budget tips.
      </EmptyState>
    </div>
  );
}

const TIP_ICON: Record<Insight['severity'], IconName> = {
  high: 'alert',
  medium: 'alert',
  low: 'bulb',
  positive: 'check',
};

function Tips({ tips }: { tips: Insight[] }) {
  if (tips.length === 0) return null;
  return (
    <section className="card" aria-labelledby="tips-h">
      <div className="card__head">
        <h2 id="tips-h">Budget tips</h2>
      </div>
      <ul className="list stack" style={{ gap: 8 }}>
        {tips.map((t) => (
          <li key={t.id} className="tip" data-severity={t.severity}>
            <span className="tip__icon">
              <Icon name={TIP_ICON[t.severity]} size={18} />
            </span>
            <div>
              <p className="tip__title">{t.title}</p>
              <p className="tip__detail">{t.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Legend({
  slices,
  total,
}: {
  slices: Slice[] | { id: string; name: string; color: string; value: number }[];
  total: number;
}) {
  const money = useMoney();
  const top = slices.slice(0, 5);
  const rest = slices.slice(5).reduce((acc, s) => acc + s.value, 0);
  const rows = rest > 0 ? [...top, { id: 'rest', name: 'Others', color: '#94a3b8', value: rest }] : top;
  return (
    <ul className="legend">
      {rows.map((s) => (
        <li key={s.id}>
          <span className="dot" style={{ '--dot': s.color } as CSSProperties} />
          <span className="legend__name">{s.name}</span>
          <span className="num small">{money(s.value, { compact: true })}</span>
          <span className="num xs muted legend__pct">{formatPercent(total > 0 ? s.value / total : 0)}</span>
        </li>
      ))}
    </ul>
  );
}

function DonutCard({ title, slices, total, empty }: { title: string; slices: Slice[]; total: number; empty: string }) {
  const money = useMoney();
  return (
    <section className="card">
      <div className="card__head">
        <h2>{title}</h2>
      </div>
      {total === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <div className="donut-wrap">
          <Donut
            label={`${title}: ${slices.map((s) => `${s.name} ${formatPercent(s.share)}`).join(', ')}`}
            slices={slices.map((s) => ({ id: s.id, label: s.name, value: s.value, color: s.color }))}
            center={
              <>
                <span className="donut__value num">{money(total, { compact: true })}</span>
                <span className="xs muted">total</span>
              </>
            }
          />
          <Legend slices={slices} total={total} />
        </div>
      )}
    </section>
  );
}

function SplitCard({ analysis }: { analysis: BudgetAnalysis }) {
  const money = useMoney();
  const { income, expenses } = analysis.totals;
  const savedPct = Math.max(0, analysis.totals.savingsRate);
  // Consumption excludes transfers into savings categories.
  const consumption = Math.round(income * (1 - analysis.totals.savingsRate));
  const saved = Math.max(0, income - consumption);
  const over = Math.max(0, consumption - income);
  const slices = [
    { id: 'spent', name: 'Spent', color: 'var(--expense)', value: Math.min(consumption, income) },
    { id: 'saved', name: 'Saved', color: 'var(--income)', value: saved },
    ...(over > 0 ? [{ id: 'over', name: 'Overspent', color: 'var(--danger)', value: over }] : []),
  ];
  return (
    <section className="card">
      <div className="card__head">
        <h2>Income vs. expenses</h2>
      </div>
      {income === 0 ? (
        <p className="muted small">Add income to see your savings split.</p>
      ) : (
        <div className="donut-wrap">
          <Donut
            label={`Saved ${formatPercent(savedPct)} of income`}
            slices={slices.map((s) => ({ id: s.id, label: s.name, value: s.value, color: s.color }))}
            center={
              <>
                <span className="donut__value num">{formatPercent(savedPct)}</span>
                <span className="xs muted">saved</span>
              </>
            }
          />
          <ul className="legend">
            <li>
              <span className="dot" style={{ '--dot': 'var(--income)' } as CSSProperties} />
              <span className="legend__name">Income</span>
              <span className="num small">{money(income, { compact: true })}</span>
            </li>
            <li>
              <span className="dot" style={{ '--dot': 'var(--expense)' } as CSSProperties} />
              <span className="legend__name">Expenses</span>
              <span className="num small">{money(expenses, { compact: true })}</span>
            </li>
            <li>
              <span
                className="dot"
                style={{ '--dot': over > 0 ? 'var(--danger)' : 'var(--income)' } as CSSProperties}
              />
              <span className="legend__name">{over > 0 ? 'Overspent' : 'Saved'}</span>
              <span className="num small">{money(over > 0 ? over : saved, { compact: true })}</span>
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}

const GROUP_LABEL = { needs: 'Needs', wants: 'Wants', savings: 'Savings' } as const;

function RuleCard({ analysis }: { analysis: BudgetAnalysis }) {
  const money = useMoney();
  if (analysis.totals.income === 0) {
    return (
      <section className="card">
        <div className="card__head">
          <h2>50/30/20 check</h2>
        </div>
        <p className="muted small">Add income for this period to compare against the 50/30/20 rule.</p>
      </section>
    );
  }
  return (
    <section className="card" aria-labelledby="rule-h">
      <div className="card__head">
        <h2 id="rule-h">50/30/20 check</h2>
        <span className="muted xs">share of income</span>
      </div>
      <div className="stack" style={{ gap: 14 }}>
        {analysis.rule.map((r) => {
          const pct = Math.round(r.pct * 100);
          const ok = r.group === 'savings' ? r.pct >= r.target : r.pct <= r.target;
          return (
            <div key={r.group}>
              <div className="row row--between small" style={{ marginBottom: 6 }}>
                <span>
                  <strong>{GROUP_LABEL[r.group]}</strong>{' '}
                  <span className="muted">· target {Math.round(r.target * 100)}%</span>
                </span>
                <span className="num" style={{ color: ok ? 'var(--income)' : 'var(--expense)', fontWeight: 600 }}>
                  {pct}% · {money(r.amount, { compact: true })}
                </span>
              </div>
              <div className="bar" aria-hidden="true">
                <div
                  className="bar__fill"
                  style={
                    {
                      width: `${Math.min(100, pct)}%`,
                      '--bar': ok ? 'var(--income)' : 'var(--expense)',
                    } as CSSProperties
                  }
                />
                <div className="bar__target" style={{ left: `${r.target * 100}%` }} />
              </div>
            </div>
          );
        })}
        <p className="small muted">
          Suggested savings target:{' '}
          <strong style={{ color: 'var(--text)' }}>{formatPercent(analysis.suggestedSavingsPct)}</strong> ≈{' '}
          {money(analysis.suggestedSavingsAmount)}/month
          {analysis.recurringMonthly > 0 && <> · Recurring: {formatPercent(analysis.recurringPctOfIncome)} of income</>}
        </p>
      </div>
    </section>
  );
}

function UpcomingCard({ today, categories }: { today: string; categories: Category[] }) {
  const { recurring } = useAppData();
  const money = useMoney();
  const list = upcoming(recurring, today, 30);
  return (
    <section className="card card--flush" aria-labelledby="upcoming-h">
      <div className="card__head">
        <h2 id="upcoming-h">Upcoming recurring</h2>
        <Link to="/recurring" className="link-btn">
          Manage
        </Link>
      </div>
      {list.length === 0 ? (
        <EmptyState icon="repeat" title="Nothing due in the next 30 days">
          Add rent, subscriptions and bills under Recurring.
        </EmptyState>
      ) : (
        <ul className="list" style={{ marginTop: 8 }}>
          {list.map(({ rule, date }) => {
            const cat = categories.find((c) => c.id === rule.categoryId);
            const days = daysBetween(today, date);
            return (
              <li key={rule.id} className="list-item">
                <span className="dot" style={{ '--dot': cat?.color } as CSSProperties} />
                <span className="list-item__main">
                  <span className="list-item__title" style={{ display: 'block' }}>
                    {rule.name}
                  </span>
                  <span className="list-item__sub" style={{ display: 'block' }}>
                    {formatDate(date, today)} · {formatInDays(days)}
                  </span>
                </span>
                <span className="amount">{money(rule.amount)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
