import { Menu } from 'glisse';
import { CalendarClock, Loader2, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useId, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { isValidIsoDate } from '../../shared/dates';
import { MoneyInput } from '@/components/MoneyField';
import { useMoneyField } from '@/hooks/use-money-field';
import { monthlyEquivalent, nextDueDate } from '../../shared/recurring';
import type { Category, Frequency, Recurring as Rule, RecurringInput, TransactionType } from '../../shared/schema';
import { CategoryPicker } from '@/components/CategoryPicker';
import { EmptyState } from '@/components/Feedback';
import { Page, PageHeader } from '@/components/Layout';
import { ResponsiveSheet, SheetFooter } from '@/components/ResponsiveSheet';
import { TypeSwitch } from '@/components/TransactionForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirm } from '@/context/confirm';
import { formatDate, useMoney } from '@/lib/format';
import { useAppData, useDeleteRecurring, useSaveRecurring } from '@/lib/queries';
import { localToday } from '@/lib/today';
import { cn } from '@/lib/utils';

const FREQ_LABEL: Record<Frequency, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

function toInput(rule: Rule, patch: Partial<RecurringInput> = {}): RecurringInput {
  return {
    type: rule.type,
    name: rule.name,
    amount: rule.amount,
    categoryId: rule.categoryId,
    frequency: rule.frequency,
    startDate: rule.startDate,
    note: rule.note,
    paused: rule.paused,
    ...patch,
  };
}

export default function Recurring() {
  const { recurring, categories } = useAppData();
  const money = useMoney();
  const today = localToday();
  // `?edit=<id>` (from the dashboard's Upcoming list) opens that rule straight away.
  const [params, setParams] = useSearchParams();
  const editId = params.get('edit');
  const [sheet, setSheet] = useState<{ open: boolean; rule?: Rule; nonce: number }>(() => {
    const rule = editId ? recurring.find((r) => r.id === editId) : undefined;
    return rule ? { open: true, rule, nonce: 1 } : { open: false, nonce: 0 };
  });
  const openSheet = (rule?: Rule) => setSheet({ open: true, rule, nonce: Date.now() });
  const closeSheet = () => {
    setSheet((s) => ({ ...s, open: false }));
    if (editId) setParams({}, { replace: true });
  };

  const active = recurring.filter((r) => !r.paused);
  const perMonth = (type: TransactionType) =>
    active.filter((r) => r.type === type).reduce((acc, r) => acc + monthlyEquivalent(r.amount, r.frequency), 0);
  const bills = perMonth('expense');
  const income = perMonth('income');
  const sorted = [...recurring].sort(
    (a, b) => Number(a.paused) - Number(b.paused) || nextDueDate(a, today).localeCompare(nextDueDate(b, today)),
  );
  const next = active.length ? sorted[0] : undefined;

  return (
    <Page>
      <PageHeader
        title="Recurring"
        subtitle="Bills, subscriptions and income that log themselves when due."
        actions={
          <Button className="press" onClick={() => openSheet()}>
            <Plus aria-hidden="true" /> New Recurring
          </Button>
        }
      />

      <div className="stagger space-y-4">
        <Card className="py-5">
          <CardContent className="grid grid-cols-2 gap-5 lg:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Bills each month</p>
              <p className="tabular mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{money(bills)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Income each month</p>
              <p className="tabular mt-1 text-2xl font-bold tracking-tight text-income sm:text-3xl">{money(income)}</p>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <p className="text-sm text-muted-foreground">Next due</p>
              <p className="mt-1 truncate text-lg font-semibold">
                {next ? (
                  <button
                    type="button"
                    onClick={() => openSheet(next)}
                    className="-mx-1 max-w-full truncate rounded-md px-1 text-left outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {next.name} · {formatDate(nextDueDate(next, today), today)}
                  </button>
                ) : (
                  '—'
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {active.length} active · {recurring.length - active.length} paused
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          {sorted.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="Nothing Recurring Yet"
              action={<Button onClick={() => openSheet()}>Add Your First</Button>}
            >
              Add your salary, rent and subscriptions once. They’re logged automatically on every due date.
            </EmptyState>
          ) : (
            <ul className="divide-y" aria-label="Recurring items">
              {sorted.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  color={categories[rule.type].find((c) => c.id === rule.categoryId)?.color}
                  today={today}
                  onEdit={() => openSheet(rule)}
                />
              ))}
            </ul>
          )}
        </Card>
        <p className="text-xs text-muted-foreground">Weekly and yearly costs are converted to a monthly figure.</p>
      </div>

      <ResponsiveSheet
        open={sheet.open}
        onClose={closeSheet}
        title={
          sheet.rule
            ? sheet.rule.type === 'income'
              ? 'Edit Recurring Income'
              : 'Edit Recurring Expense'
            : 'New Recurring'
        }
      >
        <RecurringForm key={sheet.nonce} rule={sheet.rule} onDone={closeSheet} />
      </ResponsiveSheet>
    </Page>
  );
}

function RuleRow({ rule, color, today, onEdit }: { rule: Rule; color?: string; today: string; onEdit: () => void }) {
  const money = useMoney();
  const save = useSaveRecurring();
  const remove = useDeleteRecurring();
  const confirm = useConfirm();

  async function togglePause() {
    try {
      await save.mutateAsync({ id: rule.id, input: toInput(rule, { paused: !rule.paused }) });
      toast.success(rule.paused ? `${rule.name} resumed` : `${rule.name} paused`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t update. Check your connection and try again.');
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Delete “${rule.name}”?`,
      message: 'No more entries will be created. Entries already in your history stay.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(rule.id);
      toast.success(`${rule.name} deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t delete. Check your connection and try again.');
    }
  }

  return (
    <li className={cn('flex min-h-18 items-center gap-3 pr-2 pl-5', rule.paused && 'opacity-60')}>
      <span
        className="size-2.5 shrink-0 rounded-full bg-(--dot) ring-4 ring-(--dot)/15"
        style={{ '--dot': color ?? 'var(--muted-foreground)' } as CSSProperties}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 rounded-md py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={`Edit ${rule.name}`}
      >
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{rule.name}</span>
          {rule.paused && <Badge variant="secondary">Paused</Badge>}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
          {FREQ_LABEL[rule.frequency]}
          {!rule.paused && ` · next ${formatDate(nextDueDate(rule, today), today)}`}
        </span>
      </button>
      <span className={cn('tabular shrink-0 font-semibold', rule.type === 'income' && 'text-income')}>
        {rule.type === 'income' ? '+' : ''}
        {money(rule.amount)}
      </span>
      {save.isPending || remove.isPending ? (
        <span className="grid size-10 place-items-center" aria-label="Saving">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </span>
      ) : (
        <Menu
          aria-label={`Actions for ${rule.name}`}
          items={[
            { label: 'Edit', icon: <Pencil />, onSelect: onEdit },
            {
              label: rule.paused ? 'Resume' : 'Pause',
              icon: rule.paused ? <Play /> : <Pause />,
              onSelect: () => void togglePause(),
            },
            'separator',
            { label: 'Delete', icon: <Trash2 />, destructive: true, onSelect: () => void onDelete() },
          ]}
        />
      )}
    </li>
  );
}

function initialCategory(rule: Rule | undefined, type: TransactionType, list: Category[], preferred: string) {
  if (rule?.type === type) return rule.categoryId;
  return (list.find((c) => c.id === preferred) ?? list.at(0))?.id ?? '';
}

function validateRule(v: {
  name: string;
  cents: number | null;
  categoryId: string;
  startDate: string;
  type: TransactionType;
}): Record<string, string> {
  const next: Record<string, string> = {};
  if (!v.name.trim()) next.name = 'Give it a name';
  if (v.cents === null) next.amount = 'Enter an amount greater than zero';
  if (!v.categoryId) next.categoryId = v.type === 'income' ? 'Pick a source' : 'Pick a category';
  if (!isValidIsoDate(v.startDate)) next.startDate = 'Pick a valid date';
  return next;
}

/** Move focus to the first field that needs fixing. */
function focusFirstError(errors: Record<string, string>, ids: { name: string; amount: string; start: string }) {
  const first = errors.name ? ids.name : errors.amount ? ids.amount : errors.startDate ? ids.start : null;
  if (first) document.getElementById(first)?.focus();
  else document.querySelector<HTMLInputElement>('input[name="recurring-category"]')?.focus();
}

function RecurringForm({ rule, onDone }: { rule?: Rule; onDone: () => void }) {
  const { categories } = useAppData();
  const save = useSaveRecurring();
  const ids = { name: useId(), amount: useId(), amountHint: useId(), freq: useId(), start: useId(), note: useId() };
  const [type, setType] = useState<TransactionType>(rule?.type ?? 'expense');
  const cats = (t: TransactionType) => categories[t].filter((c) => !c.archived || c.id === rule?.categoryId);

  const [name, setName] = useState(rule?.name ?? '');
  const amount = useMoneyField(rule?.amount);
  const [categoryByType, setCategoryByType] = useState<Record<TransactionType, string>>(() => ({
    expense: initialCategory(rule, 'expense', cats('expense'), 'subscriptions'),
    income: initialCategory(rule, 'income', cats('income'), 'salary'),
  }));
  const categoryId = categoryByType[type];
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(rule?.startDate ?? localToday());
  const [note, setNote] = useState(rule?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = amount.stored();
    const next = validateRule({ name, cents, categoryId, startDate, type });
    setErrors(next);
    if (cents === null || Object.keys(next).length > 0) {
      focusFirstError(next, ids);
      return;
    }
    try {
      await save.mutateAsync({
        id: rule?.id,
        input: {
          type,
          name: name.trim(),
          amount: cents,
          categoryId,
          frequency,
          startDate,
          note: note.trim() || undefined,
          paused: rule?.paused ?? false,
        },
      });
      toast.success(rule ? `${name.trim()} updated` : `${name.trim()} added. It logs itself on every due date.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save. Check your connection and try again.');
    }
  }

  const copy = COPY[type];
  return (
    <form className="space-y-5 pt-1" onSubmit={(e) => void onSubmit(e)} noValidate>
      <TypeSwitch value={type} onChange={setType} />
      <Field id={ids.name} label="Name" error={errors.name}>
        <Input
          id={ids.name}
          value={name}
          maxLength={60}
          placeholder={copy.placeholder}
          name="name"
          autoComplete="off"
          data-autofocus={rule ? undefined : true}
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => setName(e.target.value)}
          className="h-11"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:items-start">
        <Field id={ids.amount} label="Amount" error={errors.amount}>
          <MoneyInput id={ids.amount} hintId={ids.amountHint} name="amount" field={amount} error={errors.amount} />
        </Field>
        <Field id={ids.freq} label="Repeats">
          <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
            <SelectTrigger id={ids.freq} className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <CategoryPicker
        name="recurring-category"
        legend={copy.legend}
        categories={cats(type)}
        value={categoryId}
        onChange={(id) => setCategoryByType((prev) => ({ ...prev, [type]: id }))}
        error={errors.categoryId}
      />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Field id={ids.start} label="Start date" error={errors.startDate}>
          <Input
            id={ids.start}
            type="date"
            name="startDate"
            autoComplete="off"
            value={startDate}
            aria-invalid={Boolean(errors.startDate)}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11"
          />
        </Field>
        <Field id={ids.note} label="Note (optional)">
          <Input
            id={ids.note}
            name="note"
            autoComplete="off"
            placeholder="e.g. Paid by card…"
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11"
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Added automatically on each due date. Dates before this month aren’t back-filled.
      </p>
      <SheetFooter>
        <Button type="submit" className="press h-11 flex-1 text-base" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {rule ? 'Save Changes' : copy.submit}
        </Button>
      </SheetFooter>
    </form>
  );
}

const COPY: Record<TransactionType, { placeholder: string; legend: string; submit: string }> = {
  expense: { placeholder: 'e.g. Rent, Netflix…', legend: 'Category', submit: 'Add Recurring Expense' },
  income: { placeholder: 'e.g. Salary, Rent from flat…', legend: 'Source', submit: 'Add Recurring Income' },
};

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
