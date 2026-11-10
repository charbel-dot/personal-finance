import { ArrowDownLeft, ArrowUpRight, Loader2, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { endOfMonth, isValidIsoDate, startOfMonth } from '../../shared/dates';
import { centsToInput, parseAmount } from '../../shared/money';
import { savingsBalance, summarizeSavings } from '../../shared/savings';
import type { Category, SavingsEntry, SavingsKind } from '../../shared/schema';
import { CategoryPicker } from '@/components/CategoryPicker';
import { EmptyState, ErrorMessage, RowsSkeleton } from '@/components/Feedback';
import { Page, PageHeader } from '@/components/Layout';
import { ResponsiveSheet, SheetFooter } from '@/components/ResponsiveSheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/context/confirm';
import { formatPercent } from '../../shared/money';
import { currencySymbol, formatDate, useMoney } from '@/lib/format';
import { useAppData, useDeleteSavings, useSavings, useSaveSavings, useTransactions } from '@/lib/queries';
import { localToday } from '@/lib/today';
import { cn } from '@/lib/utils';

type SheetState = { open: boolean; entry?: SavingsEntry; sourceId?: string; kind?: SavingsKind; nonce: number };

export default function Savings() {
  const { categories, settings } = useAppData();
  const money = useMoney();
  const today = localToday();
  const savings = useSavings();
  const month = useMemo(() => ({ from: startOfMonth(today), to: endOfMonth(today) }), [today]);
  const monthTx = useTransactions(month);
  const [sheet, setSheet] = useState<SheetState>({ open: false, nonce: 0 });
  const openSheet = (patch: Omit<SheetState, 'open' | 'nonce'> = {}) =>
    setSheet({ open: true, nonce: Date.now(), ...patch });

  const entries = useMemo(() => savings.data ?? [], [savings.data]);
  const all = useMemo(() => summarizeSavings(entries), [entries]);
  const thisMonth = useMemo(() => summarizeSavings(entries, month.from, month.to), [entries, month]);
  const sourceById = useMemo(() => new Map(categories.income.map((c) => [c.id, c])), [categories.income]);

  // Every active source is listed so you can add to it directly; archived ones only while they hold money.
  const sourceRows = useMemo(() => {
    const net = new Map(all.bySource.map((s) => [s.sourceId, s.net]));
    return categories.income
      .filter((c) => !c.archived || net.has(c.id))
      .map((c) => ({ source: c, net: net.get(c.id) ?? 0 }))
      .sort((a, b) => b.net - a.net);
  }, [all.bySource, categories.income]);

  const monthIncome = (monthTx.data ?? []).filter((t) => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const target = Math.round((monthIncome * settings.budgetRule.savings) / 100);
  const progress = target > 0 ? Math.min(1, Math.max(0, thisMonth.total / target)) : 0;

  return (
    <Page>
      <PageHeader
        title="Savings"
        subtitle="Money you put aside, tracked by the income source it came from."
        actions={
          <Button className="press" onClick={() => openSheet()} disabled={!savings.data}>
            <Plus aria-hidden="true" /> Add Savings
          </Button>
        }
      />

      {savings.isError ? (
        <Card>
          <ErrorMessage error={savings.error} onRetry={() => void savings.refetch()} />
        </Card>
      ) : (
        <div className="stagger space-y-4">
          <Card className="py-5">
            <CardContent className="grid grid-cols-2 gap-5 lg:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Total saved</p>
                {savings.isPending ? (
                  <Skeleton className="mt-2 h-8 w-32" />
                ) : (
                  <p className="tabular mt-1 text-2xl font-bold tracking-tight text-income sm:text-3xl">
                    {money(all.total)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This month</p>
                {savings.isPending ? (
                  <Skeleton className="mt-2 h-8 w-24" />
                ) : (
                  <p className="tabular mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                    {money(thisMonth.total, { signed: true })}
                  </p>
                )}
              </div>
              <div className="col-span-2 lg:col-span-1">
                <p className="text-sm text-muted-foreground">
                  Monthly target · {settings.budgetRule.savings}% of income
                </p>
                {target > 0 ? (
                  <>
                    <p className="tabular mt-1 text-lg font-semibold">
                      {money(Math.max(0, thisMonth.total))} <span className="text-muted-foreground">of</span>{' '}
                      {money(target)}
                    </p>
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label="Savings target progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress * 100)}
                    >
                      <div
                        className="h-full rounded-full bg-income transition-[width] duration-500 motion-reduce:transition-none"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {monthTx.isPending ? '…' : 'Log income this month to get a target.'}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

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
                      onAdd={() => openSheet({ sourceId: source.id, kind: 'deposit' })}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section aria-labelledby="savings-history" className="space-y-2">
            <h2 id="savings-history" className="text-sm font-medium text-muted-foreground">
              History
            </h2>
            <Card className="gap-0 overflow-clip py-0">
              {savings.isPending ? (
                <RowsSkeleton />
              ) : entries.length === 0 ? (
                <EmptyState
                  icon={PiggyBank}
                  title="No Savings Yet"
                  action={<Button onClick={() => openSheet()}>Add Your First</Button>}
                >
                  Log what you set aside from each income source, and watch the total grow.
                </EmptyState>
              ) : (
                <ul className="divide-y" aria-label="Savings entries">
                  {entries.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      source={sourceById.get(e.sourceId)}
                      today={today}
                      onEdit={() => openSheet({ entry: e })}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      )}

      <ResponsiveSheet
        open={sheet.open}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        title={sheet.entry ? 'Edit Savings' : 'Add Savings'}
      >
        <SavingsForm
          key={sheet.nonce}
          entry={sheet.entry}
          initialSourceId={sheet.sourceId}
          initialKind={sheet.kind}
          available={savingsBalance(entries)}
          onDone={() => setSheet((s) => ({ ...s, open: false }))}
        />
      </ResponsiveSheet>
    </Page>
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

function SourceRow({ source, net, share, onAdd }: { source: Category; net: number; share: number; onAdd: () => void }) {
  const money = useMoney();
  return (
    <li className="flex min-h-16 items-center gap-3 pr-2 pl-5">
      <Dot color={source.color} />
      <div className="min-w-0 flex-1 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate font-medium">{source.name}</span>
          <span className={cn('tabular shrink-0 font-semibold', net === 0 && 'text-muted-foreground')}>
            {money(net)}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className="h-full rounded-full bg-(--dot)"
              style={{ '--dot': source.color, width: `${share * 100}%` } as CSSProperties}
            />
          </div>
          <span className="tabular w-10 text-right text-xs text-muted-foreground">{formatPercent(share)}</span>
        </div>
      </div>
      {!source.archived && (
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
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
  today,
  onEdit,
}: {
  entry: SavingsEntry;
  source?: Category;
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
          <span className="block truncate font-medium">{name}</span>
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
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Savings type">
      {KINDS.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'press flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors outline-none',
            'focus-visible:ring-[3px] focus-visible:ring-ring/50',
            value === v && 'bg-background text-foreground shadow-sm dark:bg-accent',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

function SavingsForm({
  entry,
  initialSourceId,
  initialKind,
  available,
  onDone,
}: {
  entry?: SavingsEntry;
  initialSourceId?: string;
  initialKind?: SavingsKind;
  available: number;
  onDone: () => void;
}) {
  const { categories, settings } = useAppData();
  const money = useMoney();
  const save = useSaveSavings();
  const remove = useDeleteSavings();
  const confirm = useConfirm();
  const ids = { amount: useId(), date: useId(), note: useId() };
  const sources = categories.income.filter((c) => !c.archived || c.id === entry?.sourceId);

  const [kind, setKind] = useState<SavingsKind>(entry?.kind ?? initialKind ?? 'deposit');
  const [amount, setAmount] = useState(entry ? centsToInput(entry.amount) : '');
  const [sourceId, setSourceId] = useState(
    entry?.sourceId ??
      initialSourceId ??
      (sources.find((c) => c.id === settings.lastIncomeCategoryId) ?? sources.at(0))?.id ??
      '',
  );
  const [date, setDate] = useState(entry?.date ?? localToday());
  const [note, setNote] = useState(entry?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // What could be withdrawn if this entry were saved as a withdrawal (the entry itself excluded).
  const availableExcludingSelf = available - (entry ? (entry.kind === 'deposit' ? entry.amount : -entry.amount) : 0);

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = parseAmount(amount);
    const next: Record<string, string> = {};
    if (cents === null) next.amount = 'Enter an amount greater than zero';
    else if (kind === 'withdrawal' && cents > availableExcludingSelf)
      next.amount = `You only have ${money(Math.max(0, availableExcludingSelf))} saved`;
    if (!sourceId) next.sourceId = 'Pick a source';
    if (!isValidIsoDate(date)) next.date = 'Pick a valid date';
    setErrors(next);
    if (cents === null || Object.keys(next).length > 0) {
      if (next.amount) document.getElementById(ids.amount)?.focus();
      else if (next.date) document.getElementById(ids.date)?.focus();
      return;
    }
    try {
      await save.mutateAsync({
        id: entry?.id,
        input: { kind, amount: cents, sourceId, date, note: note.trim() || undefined },
      });
      const source = sources.find((c) => c.id === sourceId)?.name ?? 'savings';
      toast.success(
        entry
          ? 'Savings updated'
          : kind === 'deposit'
            ? `Saved ${money(cents)} from ${source}`
            : `Withdrew ${money(cents)}`,
      );
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save. Check your connection and try again.');
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
      toast.error(err instanceof Error ? err.message : 'Couldn’t delete. Check your connection and try again.');
    }
  }

  return (
    <form className="space-y-5 pt-1" onSubmit={(e) => void onSubmit(e)} noValidate>
      <KindSwitch value={kind} onChange={setKind} />
      <Field id={ids.amount} label={`Amount (${currencySymbol(settings.currency)})`} error={errors.amount}>
        <Input
          id={ids.amount}
          className="tabular h-11 text-lg"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amount}
          maxLength={16}
          data-autofocus={entry ? undefined : true}
          aria-invalid={Boolean(errors.amount)}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
        />
        {kind === 'withdrawal' && !errors.amount && (
          <p className="text-xs text-muted-foreground">Available: {money(Math.max(0, availableExcludingSelf))}</p>
        )}
      </Field>
      <CategoryPicker
        name="savings-source"
        legend="Source"
        categories={sources}
        value={sourceId}
        onChange={setSourceId}
        error={errors.sourceId}
      />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Field id={ids.date} label="Date" error={errors.date}>
          <Input
            id={ids.date}
            type="date"
            name="date"
            autoComplete="off"
            value={date}
            aria-invalid={Boolean(errors.date)}
            onChange={(e) => setDate(e.target.value)}
            className="h-11"
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
            className="h-11"
          />
        </Field>
      </div>
      <SheetFooter>
        {entry && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-destructive hover:text-destructive"
            onClick={() => void onDelete()}
            disabled={remove.isPending}
          >
            {remove.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
            Delete
          </Button>
        )}
        <Button type="submit" className="press h-11 flex-1 text-base" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {entry ? 'Save Changes' : kind === 'deposit' ? 'Add to Savings' : 'Withdraw'}
        </Button>
      </SheetFooter>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
