import { Menu } from 'glisse';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  Flag,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useId, useMemo, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { CATEGORY_COLORS } from '../../shared/defaults';
import { endOfMonth, isValidIsoDate, startOfMonth } from '../../shared/dates';
import { formatPercent } from '../../shared/money';
import { MoneyInput } from '@/components/MoneyField';
import { useMoneyField } from '@/hooks/use-money-field';
import { goalProgress, savingsBalance, signedAmount, summarizeSavings, type GoalProgress } from '../../shared/savings';
import type { Category, SavingsEntry, SavingsGoal, SavingsKind } from '../../shared/schema';
import { CategoryPicker } from '@/components/CategoryPicker';
import { EmptyState, ErrorMessage, RowsSkeleton } from '@/components/Feedback';
import { Page, PageHeader } from '@/components/Layout';
import { ResponsiveSheet, SheetFooter } from '@/components/ResponsiveSheet';
import { Segmented } from '@/components/Segmented';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/context/confirm';
import { useUrlState } from '@/hooks/use-url-state';
import { formatDate, useMoney } from '@/lib/format';
import {
  useAppData,
  useDeleteGoal,
  useDeleteSavings,
  useSaveGoal,
  useSavings,
  useSaveSavings,
  useTransactions,
} from '@/lib/queries';
import { localToday } from '@/lib/today';
import { cn, errorMessage } from '@/lib/utils';

type EntrySheet = {
  kind: 'entry';
  entry?: SavingsEntry;
  sourceId?: string;
  goalId?: string;
  savingsKind?: SavingsKind;
};
type GoalSheet = { kind: 'goal'; goal?: SavingsGoal };
type SheetState = { open: boolean; nonce: number; content: EntrySheet | GoalSheet };

const NO_GOAL = 'none';

export default function Savings() {
  const { categories, settings } = useAppData();
  const today = localToday();
  const savings = useSavings();
  const month = useMemo(() => ({ from: startOfMonth(today), to: endOfMonth(today) }), [today]);
  const monthTx = useTransactions(month);
  const [sheet, setSheet] = useState<SheetState>({ open: false, nonce: 0, content: { kind: 'entry' } });
  const open = (content: EntrySheet | GoalSheet) => setSheet({ open: true, nonce: Date.now(), content });
  const close = () => setSheet((s) => ({ ...s, open: false }));

  // History filters live in the URL (?source=…&goal=…), so source rows and goal cards are links.
  const [params, update] = useUrlState();
  const sourceFilter = params.get('source');
  const goalFilter = params.get('goal');

  const entries = useMemo(() => savings.data?.items ?? [], [savings.data]);
  const goals = useMemo(() => savings.data?.goals ?? [], [savings.data]);
  const all = useMemo(() => summarizeSavings(entries), [entries]);
  const thisMonth = useMemo(() => summarizeSavings(entries, month.from, month.to), [entries, month]);
  const sourceById = useMemo(() => new Map(categories.income.map((c) => [c.id, c])), [categories.income]);
  const goalById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  const progress = useMemo(() => goals.map((g) => goalProgress(g, entries, today)), [goals, entries, today]);

  // Every active source is listed so you can add to it directly; archived ones only while they hold money.
  const sourceRows = useMemo(() => {
    const net = new Map(all.bySource.map((s) => [s.sourceId, s.net]));
    return categories.income
      .filter((c) => !c.archived || net.has(c.id))
      .map((c) => ({ source: c, net: net.get(c.id) ?? 0 }))
      .sort((a, b) => b.net - a.net);
  }, [all.bySource, categories.income]);

  const shown = entries.filter(
    (e) => (!sourceFilter || e.sourceId === sourceFilter) && (!goalFilter || e.goalId === goalFilter),
  );
  const filterLabel = [
    sourceFilter && (sourceById.get(sourceFilter)?.name ?? 'Unknown source'),
    goalFilter && (goalById.get(goalFilter)?.name ?? 'Unknown goal'),
  ]
    .filter(Boolean)
    .join(' · ');

  const monthIncome = (monthTx.data ?? []).filter((t) => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const target = Math.round((monthIncome * settings.budgetRule.savings) / 100);

  function showHistory(filter: { source?: string; goal?: string }) {
    update({ source: filter.source ?? null, goal: filter.goal ?? null });
    requestAnimationFrame(() =>
      document.getElementById('savings-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  return (
    <Page>
      <PageHeader
        title="Savings"
        subtitle="Money you put aside, by income source and towards your goals."
        actions={
          <Button className="press" onClick={() => open({ kind: 'entry' })} disabled={!savings.data}>
            <Plus aria-hidden="true" /> Add Savings
          </Button>
        }
      />

      {savings.isError ? (
        <Card>
          <ErrorMessage error={savings.error} onRetry={() => void savings.refetch()} />
        </Card>
      ) : (
        <div className="stagger space-y-6">
          <SummaryCard
            loading={savings.isPending}
            incomePending={monthTx.isPending}
            total={all.total}
            monthTotal={thisMonth.total}
            target={target}
            percent={settings.budgetRule.savings}
            onShowAll={() => showHistory({})}
          />

          <GoalsSection
            loading={savings.isPending}
            disabled={!savings.data}
            progress={progress}
            today={today}
            selectedId={goalFilter}
            onNew={() => open({ kind: 'goal' })}
            onShow={(id) => showHistory({ goal: id })}
            onAdd={(id) => open({ kind: 'entry', goalId: id, savingsKind: 'deposit' })}
            onEdit={(goal) => open({ kind: 'goal', goal })}
          />

          <section aria-labelledby="by-source" className="space-y-2">
            <h2 id="by-source" className="text-sm font-medium text-muted-foreground">
              By source
            </h2>
            <Card className="gap-0 overflow-clip py-0">
              {savings.isPending ? (
                <RowsSkeleton rows={3} />
              ) : (
                <ul className="divide-y">
                  {sourceRows.map(({ source, net }) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      net={net}
                      share={all.total > 0 ? Math.max(0, net) / all.total : 0}
                      selected={sourceFilter === source.id}
                      onShow={() => showHistory({ source: source.id })}
                      onAdd={() => open({ kind: 'entry', sourceId: source.id, savingsKind: 'deposit' })}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <HistorySection
            loading={savings.isPending}
            hasEntries={entries.length > 0}
            shown={shown}
            filterLabel={filterLabel}
            sourceById={sourceById}
            goalById={goalById}
            today={today}
            onClearFilter={() => update({ source: null, goal: null })}
            onAdd={() => open({ kind: 'entry' })}
            onEdit={(entry) => open({ kind: 'entry', entry })}
          />
        </div>
      )}

      <ResponsiveSheet open={sheet.open} onClose={close} title={sheetTitle(sheet.content)}>
        {sheet.content.kind === 'goal' ? (
          <GoalForm key={sheet.nonce} goal={sheet.content.goal} onDone={close} />
        ) : (
          <SavingsForm
            key={sheet.nonce}
            entry={sheet.content.entry}
            initialSourceId={sheet.content.sourceId}
            initialGoalId={sheet.content.goalId}
            initialKind={sheet.content.savingsKind}
            entries={entries}
            goals={goals}
            onDone={close}
          />
        )}
      </ResponsiveSheet>
    </Page>
  );
}

function sheetTitle(content: EntrySheet | GoalSheet) {
  if (content.kind === 'goal') return content.goal ? 'Edit Goal' : 'New Goal';
  return content.entry ? 'Edit Savings' : 'Add Savings';
}

/** Total saved, this month, and progress towards the monthly target from the budget rule. */
function SummaryCard({
  loading,
  incomePending,
  total,
  monthTotal,
  target,
  percent,
  onShowAll,
}: {
  loading: boolean;
  incomePending: boolean;
  total: number;
  monthTotal: number;
  target: number;
  percent: number;
  onShowAll: () => void;
}) {
  const money = useMoney();
  const monthRatio = target > 0 ? Math.min(1, Math.max(0, monthTotal / target)) : 0;
  return (
    <Card className="py-5">
      <CardContent className="grid grid-cols-2 gap-5 lg:grid-cols-3">
        <button
          type="button"
          onClick={onShowAll}
          className="-m-2 rounded-xl p-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="block text-sm text-muted-foreground">Total saved</span>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-32" />
          ) : (
            <span className="tabular mt-1 block text-2xl font-bold tracking-tight text-income sm:text-3xl">
              {money(total)}
            </span>
          )}
        </button>
        <div>
          <p className="text-sm text-muted-foreground">This month</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="tabular mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {money(monthTotal, { signed: true })}
            </p>
          )}
        </div>
        <div className="col-span-2 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Monthly target · {percent}% of income</p>
          {target > 0 ? (
            <>
              <p className="tabular mt-1 text-lg font-semibold">
                {money(Math.max(0, monthTotal))} <span className="text-muted-foreground">of</span> {money(target)}
              </p>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Savings target progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(monthRatio * 100)}
              >
                <div
                  className="h-full rounded-full bg-income transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${monthRatio * 100}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {incomePending ? '…' : 'Log income this month to get a target.'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GoalsSection({
  loading,
  disabled,
  progress,
  today,
  selectedId,
  onNew,
  onShow,
  onAdd,
  onEdit,
}: {
  loading: boolean;
  disabled: boolean;
  progress: GoalProgress[];
  today: string;
  selectedId: string | null;
  onNew: () => void;
  onShow: (goalId: string) => void;
  onAdd: (goalId: string) => void;
  onEdit: (goal: SavingsGoal) => void;
}) {
  return (
    <section aria-labelledby="goals" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="goals" className="text-sm font-medium text-muted-foreground">
          Goals
        </h2>
        <Button variant="ghost" size="sm" onClick={onNew} disabled={disabled}>
          <Plus aria-hidden="true" /> New Goal
        </Button>
      </div>
      {loading ? (
        <Skeleton className="h-36 rounded-2xl" />
      ) : progress.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={Target} title="No Goals Yet" action={<Button onClick={onNew}>Create a Goal</Button>}>
            Save towards something specific, like an emergency fund or a trip, and see how much to put aside each month.
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Savings goals">
          {progress.map((p) => (
            <GoalCard
              key={p.goal.id}
              progress={p}
              today={today}
              selected={selectedId === p.goal.id}
              onShow={() => onShow(p.goal.id)}
              onAdd={() => onAdd(p.goal.id)}
              onEdit={() => onEdit(p.goal)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function HistorySection({
  loading,
  hasEntries,
  shown,
  filterLabel,
  sourceById,
  goalById,
  today,
  onClearFilter,
  onAdd,
  onEdit,
}: {
  loading: boolean;
  hasEntries: boolean;
  shown: SavingsEntry[];
  filterLabel: string;
  sourceById: Map<string, Category>;
  goalById: Map<string, SavingsGoal>;
  today: string;
  onClearFilter: () => void;
  onAdd: () => void;
  onEdit: (entry: SavingsEntry) => void;
}) {
  return (
    <section aria-labelledby="savings-history-title" className="scroll-mt-20 space-y-2" id="savings-history">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 id="savings-history-title" className="text-sm font-medium text-muted-foreground">
          History
        </h2>
        {filterLabel && (
          <Button variant="ghost" size="sm" onClick={onClearFilter} aria-label={`Clear filter: ${filterLabel}`}>
            <span className="max-w-48 truncate">{filterLabel}</span>
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <Card className="gap-0 overflow-clip py-0">
        {loading ? (
          <RowsSkeleton />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title={!hasEntries ? 'No Savings Yet' : 'Nothing Here'}
            action={<Button onClick={onAdd}>Add Savings</Button>}
          >
            {!hasEntries
              ? 'Log what you set aside from each income source, and watch the total grow.'
              : 'No entries match this filter yet.'}
          </EmptyState>
        ) : (
          <ul className="divide-y" aria-label="Savings entries">
            {shown.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                source={sourceById.get(e.sourceId)}
                goal={e.goalId ? goalById.get(e.goalId) : undefined}
                today={today}
                onEdit={() => onEdit(e)}
              />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function Dot({ color }: { color?: string }) {
  return (
    <span
      className="size-2.5 shrink-0 rounded-full bg-(--dot) ring-4 ring-(--dot)/15"
      style={{ '--dot': color ?? 'var(--muted-foreground)' } as CSSProperties}
      aria-hidden="true"
    />
  );
}

/** Circular progress, drawn with two SVG circles. */
function Ring({ ratio, color }: { ratio: number; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 52 52" className="size-14 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="26" cy="26" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        stroke={color}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
        className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
      />
    </svg>
  );
}

function GoalCard({
  progress: p,
  today,
  selected,
  onShow,
  onAdd,
  onEdit,
}: {
  progress: GoalProgress;
  today: string;
  selected: boolean;
  onShow: () => void;
  onAdd: () => void;
  onEdit: () => void;
}) {
  const money = useMoney();
  const remove = useDeleteGoal();
  const confirm = useConfirm();
  const { goal } = p;

  async function onDelete() {
    const ok = await confirm({
      title: `Delete “${goal.name}”?`,
      message: 'The money stays in your savings; its entries just won’t be tagged with this goal any more.',
      confirmLabel: 'Delete Goal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(goal.id);
      toast.success(`${goal.name} deleted`);
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t delete. Check your connection and try again.'));
    }
  }

  const status = p.reached ? (
    <span className="inline-flex items-center gap-1 text-income">
      <CircleCheck className="size-3.5" aria-hidden="true" /> Goal reached
    </span>
  ) : p.overdue ? (
    <span className="text-expense">Target date passed · {money(p.remaining)} to go</span>
  ) : p.perMonth !== undefined && goal.targetDate ? (
    <span className="inline-flex items-center gap-1">
      <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
      {money(p.perMonth)}/month to reach it by {formatDate(goal.targetDate, today)}
    </span>
  ) : (
    <span>{money(p.remaining)} to go</span>
  );

  return (
    <li>
      <Card className={cn('relative gap-3 py-4 transition-shadow', selected && 'ring-2 ring-ring/40')}>
        <CardContent className="flex items-center gap-4 px-4">
          <div className="relative grid place-items-center">
            <Ring ratio={p.ratio} color={goal.color} />
            <span className="tabular absolute text-[11px] font-semibold">{formatPercent(p.ratio)}</span>
          </div>
          <div className="min-w-0 flex-1">
            {/* Stretched link: the whole card shows this goal's entries. */}
            <button
              type="button"
              onClick={onShow}
              className="block w-full truncate text-left font-semibold outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
              aria-label={`${goal.name}: ${money(Math.max(0, p.saved))} of ${money(goal.target)}. Show entries`}
            >
              {goal.name}
            </button>
            <p className="tabular mt-0.5 text-sm">
              <span className="font-semibold">{money(Math.max(0, p.saved))}</span>
              <span className="text-muted-foreground"> of {money(goal.target)}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{status}</p>
          </div>
          <div className="relative z-10 flex shrink-0 flex-col items-center gap-1.5">
            {!p.reached && (
              <Button variant="outline" size="icon-sm" aria-label={`Add to ${goal.name}`} onClick={onAdd}>
                <Plus />
              </Button>
            )}
            <Menu
              aria-label={`Actions for ${goal.name}`}
              items={[
                { label: 'Add Savings', icon: <Plus />, onSelect: onAdd },
                { label: 'Edit Goal', icon: <Pencil />, onSelect: onEdit },
                'separator',
                { label: 'Delete Goal', icon: <Trash2 />, destructive: true, onSelect: () => void onDelete() },
              ]}
            />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function SourceRow({
  source,
  net,
  share,
  selected,
  onShow,
  onAdd,
}: {
  source: Category;
  net: number;
  share: number;
  selected: boolean;
  onShow: () => void;
  onAdd: () => void;
}) {
  const money = useMoney();
  return (
    <li className={cn('flex min-h-16 items-center gap-1 pr-2', selected && 'bg-accent/60')}>
      <button
        type="button"
        onClick={onShow}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-3 pl-5 text-left outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
        aria-label={`${source.name}: ${money(net)} saved. Show entries`}
      >
        <Dot color={source.color} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium">{source.name}</span>
            <span className={cn('tabular shrink-0 font-semibold', net === 0 && 'text-muted-foreground')}>
              {money(net)}
            </span>
          </span>
          <span className="mt-2 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-(--dot)"
                style={{ '--dot': source.color, width: `${share * 100}%` } as CSSProperties}
              />
            </span>
            <span className="tabular w-10 text-right text-xs text-muted-foreground">{formatPercent(share)}</span>
          </span>
        </span>
      </button>
      {!source.archived && (
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={`Add savings from ${source.name}`}
          onClick={onAdd}
        >
          <Plus />
        </Button>
      )}
    </li>
  );
}

function EntryRow({
  entry,
  source,
  goal,
  today,
  onEdit,
}: {
  entry: SavingsEntry;
  source?: Category;
  goal?: SavingsGoal;
  today: string;
  onEdit: () => void;
}) {
  const money = useMoney();
  const deposit = entry.kind === 'deposit';
  const name = source?.name ?? 'Unknown source';
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
        aria-label={`Edit ${deposit ? 'deposit' : 'withdrawal'} of ${money(entry.amount)} from ${name}`}
      >
        <Dot color={source?.color} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="shrink-0 truncate font-medium">{name}</span>
            {goal && (
              <span
                className="inline-flex max-w-[55%] min-w-0 items-center gap-1 truncate rounded-full bg-(--g)/12 px-2 py-0.5 text-[11px] font-medium text-(--g)"
                style={{ '--g': goal.color } as CSSProperties}
              >
                <Flag className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{goal.name}</span>
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {formatDate(entry.date, today)} · {deposit ? 'Deposit' : 'Withdrawal'}
            {entry.note && ` · ${entry.note}`}
          </span>
        </span>
        <span className={cn('tabular shrink-0 font-semibold', deposit ? 'text-income' : 'text-expense')}>
          {deposit ? '+' : '−'}
          {money(entry.amount)}
        </span>
      </button>
    </li>
  );
}

const KINDS: { value: SavingsKind; label: string; icon: typeof ArrowDownLeft }[] = [
  { value: 'deposit', label: 'Deposit', icon: ArrowDownLeft },
  { value: 'withdrawal', label: 'Withdraw', icon: ArrowUpRight },
];

function KindSwitch({ value, onChange }: { value: SavingsKind; onChange: (k: SavingsKind) => void }) {
  return (
    <Segmented
      fill
      aria-label="Savings type"
      value={value}
      onValueChange={onChange}
      items={KINDS.map(({ value: v, label, icon: Icon }) => ({
        value: v,
        label: (
          <span className="flex items-center gap-1.5">
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </span>
        ),
      }))}
    />
  );
}

function defaultSource(sources: Category[], lastUsed: string | undefined) {
  return (sources.find((c) => c.id === lastUsed) ?? sources.at(0))?.id ?? '';
}

function validateSavings(v: {
  cents: number | null;
  kind: SavingsKind;
  limit: number;
  sourceId: string;
  date: string;
  money: (cents: number) => string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (v.cents === null) errors.amount = 'Enter an amount greater than zero';
  else if (v.kind === 'withdrawal' && v.cents > v.limit) {
    errors.amount = `You only have ${v.money(Math.max(0, v.limit))} saved`;
  }
  if (!v.sourceId) errors.sourceId = 'Pick a source';
  if (!isValidIsoDate(v.date)) errors.date = 'Pick a valid date';
  return errors;
}

function savedMessage(v: { editing: boolean; kind: SavingsKind; amount: string; source?: string; goal?: string }) {
  if (v.editing) return 'Savings updated';
  if (v.kind === 'withdrawal') return `Withdrew ${v.amount}`;
  return `Saved ${v.amount} from ${v.source ?? 'savings'}${v.goal ? ` towards ${v.goal}` : ''}`;
}

/** Starting values for the savings form: the entry being edited, else the given defaults. */
function savingsDefaults(
  entry: SavingsEntry | undefined,
  fallback: { kind?: SavingsKind; sourceId: string; goalId?: string },
) {
  if (entry) {
    return {
      kind: entry.kind,
      sourceId: entry.sourceId,
      goalId: entry.goalId ?? NO_GOAL,
      date: entry.date,
      note: entry.note ?? '',
    };
  }
  return {
    kind: fallback.kind ?? 'deposit',
    sourceId: fallback.sourceId,
    goalId: fallback.goalId ?? NO_GOAL,
    date: localToday(),
    note: '',
  };
}

/** What could be withdrawn (the edited entry excluded): from the picked goal, never more than overall. */
function withdrawLimit(entries: SavingsEntry[], editingId: string | undefined, goalId: string) {
  const others = entries.filter((e) => e.id !== editingId);
  const pool = goalId === NO_GOAL ? others : others.filter((e) => e.goalId === goalId);
  const available = pool.reduce((acc, e) => acc + signedAmount(e), 0);
  return Math.min(available, savingsBalance(others));
}

function WithdrawHint({ show, available }: { show: boolean; available: string }) {
  if (!show) return null;
  return <p className="text-xs text-muted-foreground">Available: {available}</p>;
}

function GoalSelect({
  id,
  goals,
  value,
  onChange,
}: {
  id: string;
  goals: SavingsGoal[];
  value: string;
  onChange: (goalId: string) => void;
}) {
  if (goals.length === 0) return null;
  return (
    <Field id={id} label="Goal (optional)">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_GOAL}>No goal</SelectItem>
          {goals.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function savingsSubmitLabel(editing: boolean, kind: SavingsKind) {
  if (editing) return 'Save Changes';
  return kind === 'deposit' ? 'Add to Savings' : 'Withdraw';
}

function SavingsFooter({
  editing,
  kind,
  saving,
  deleting,
  onDelete,
}: {
  editing: boolean;
  kind: SavingsKind;
  saving: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <SheetFooter>
      {editing && (
        <Button
          type="button"
          variant="ghost"
          className="h-11 text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
          Delete
        </Button>
      )}
      <Button type="submit" size="lg" className="press flex-1" disabled={saving}>
        {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
        {savingsSubmitLabel(editing, kind)}
      </Button>
    </SheetFooter>
  );
}

function SavingsForm({
  entry,
  initialSourceId,
  initialGoalId,
  initialKind,
  entries,
  goals,
  onDone,
}: {
  entry?: SavingsEntry;
  initialSourceId?: string;
  initialGoalId?: string;
  initialKind?: SavingsKind;
  entries: SavingsEntry[];
  goals: SavingsGoal[];
  onDone: () => void;
}) {
  const { categories, settings } = useAppData();
  const money = useMoney();
  const save = useSaveSavings();
  const remove = useDeleteSavings();
  const confirm = useConfirm();
  const ids = { amount: useId(), amountHint: useId(), date: useId(), note: useId(), goal: useId() };
  const sources = categories.income.filter((c) => !c.archived || c.id === entry?.sourceId);

  const [initial] = useState(() =>
    savingsDefaults(entry, {
      kind: initialKind,
      sourceId: initialSourceId ?? defaultSource(sources, settings.lastIncomeCategoryId),
      goalId: initialGoalId,
    }),
  );
  const [kind, setKind] = useState<SavingsKind>(initial.kind);
  const amount = useMoneyField(entry?.amount);
  const [sourceId, setSourceId] = useState(initial.sourceId);
  const [goalId, setGoalId] = useState(initial.goalId);
  const [date, setDate] = useState(initial.date);
  const [note, setNote] = useState(initial.note);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const limit = withdrawLimit(entries, entry?.id, goalId);

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = amount.stored();
    const next = validateSavings({ cents, kind, limit, sourceId, date, money });
    setErrors(next);
    if (cents === null || Object.keys(next).length > 0) {
      if (next.amount) document.getElementById(ids.amount)?.focus();
      else if (next.date) document.getElementById(ids.date)?.focus();
      return;
    }
    try {
      await save.mutateAsync({
        id: entry?.id,
        input: {
          kind,
          amount: cents,
          sourceId,
          goalId: goalId === NO_GOAL ? undefined : goalId,
          date,
          note: note.trim() || undefined,
        },
      });
      toast.success(
        savedMessage({
          editing: Boolean(entry),
          kind,
          amount: money(cents),
          source: sources.find((c) => c.id === sourceId)?.name,
          goal: goals.find((g) => g.id === goalId)?.name,
        }),
      );
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t save. Check your connection and try again.'));
    }
  }

  async function onDelete() {
    if (!entry) return;
    const ok = await confirm({
      title: 'Delete this entry?',
      message: 'It will be removed from your savings total. This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(entry.id);
      toast.success('Entry deleted');
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t delete. Check your connection and try again.'));
    }
  }

  return (
    <form className="space-y-5 pt-1" onSubmit={(e) => void onSubmit(e)} noValidate>
      <KindSwitch value={kind} onChange={setKind} />
      <Field id={ids.amount} label="Amount" error={errors.amount}>
        <MoneyInput id={ids.amount} hintId={ids.amountHint} name="amount" field={amount} error={errors.amount} />
        <WithdrawHint show={kind === 'withdrawal' && !errors.amount} available={money(Math.max(0, limit))} />
      </Field>
      <CategoryPicker
        name="savings-source"
        legend="Source"
        categories={sources}
        value={sourceId}
        onChange={setSourceId}
        error={errors.sourceId}
      />
      <GoalSelect id={ids.goal} goals={goals} value={goalId} onChange={setGoalId} />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
        <Field id={ids.date} label="Date" error={errors.date}>
          <Input
            id={ids.date}
            type="date"
            name="date"
            autoComplete="off"
            value={date}
            aria-invalid={Boolean(errors.date)}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field id={ids.note} label="Note (optional)">
          <Input
            id={ids.note}
            name="note"
            autoComplete="off"
            placeholder="e.g. Emergency fund…"
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
      <SavingsFooter
        editing={Boolean(entry)}
        kind={kind}
        saving={save.isPending}
        deleting={remove.isPending}
        onDelete={() => void onDelete()}
      />
    </form>
  );
}

function GoalForm({ goal, onDone }: { goal?: SavingsGoal; onDone: () => void }) {
  const save = useSaveGoal();
  const ids = { name: useId(), target: useId(), targetHint: useId(), date: useId() };
  const [name, setName] = useState(goal?.name ?? '');
  const target = useMoneyField(goal?.target);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [color, setColor] = useState(goal?.color ?? CATEGORY_COLORS[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = target.stored();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Give it a name';
    if (cents === null) next.target = 'Enter a target greater than zero';
    if (targetDate && !isValidIsoDate(targetDate)) next.date = 'Pick a valid date';
    setErrors(next);
    if (cents === null || Object.keys(next).length > 0) {
      document.getElementById(next.name ? ids.name : next.target ? ids.target : ids.date)?.focus();
      return;
    }
    try {
      await save.mutateAsync({
        id: goal?.id,
        input: { name: name.trim(), target: cents, targetDate: targetDate || undefined, color },
      });
      toast.success(goal ? `${name.trim()} updated` : `${name.trim()} created. Add savings towards it.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save. Check your connection and try again.');
    }
  }

  return (
    <form className="space-y-5 pt-1" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field id={ids.name} label="Name" error={errors.name}>
        <Input
          id={ids.name}
          name="name"
          autoComplete="off"
          placeholder="e.g. Emergency fund, Japan trip…"
          maxLength={40}
          value={name}
          data-autofocus={goal ? undefined : true}
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:items-start">
        <Field id={ids.target} label="Target" error={errors.target}>
          <MoneyInput id={ids.target} hintId={ids.targetHint} name="target" field={target} error={errors.target} />
        </Field>
        <Field id={ids.date} label="By (optional)" error={errors.date}>
          <Input
            id={ids.date}
            type="date"
            name="targetDate"
            autoComplete="off"
            min={localToday()}
            value={targetDate}
            aria-invalid={Boolean(errors.date)}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c, i) => (
            <label
              key={c}
              className="grid size-10 cursor-pointer place-items-center rounded-full has-[:checked]:ring-2 has-[:checked]:ring-foreground/60 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="goal-color"
                className="sr-only"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
                aria-label={`Colour ${i + 1}`}
              />
              <span className="size-7 rounded-full bg-(--c)" style={{ '--c': c } as CSSProperties} />
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        With a date, the goal shows how much to save each month to get there.
      </p>
      <SheetFooter>
        <Button type="submit" size="lg" className="press flex-1" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {goal ? 'Save Changes' : 'Create Goal'}
        </Button>
      </SheetFooter>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
