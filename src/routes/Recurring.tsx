import { CalendarClock, Loader2, MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useId, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { isValidIsoDate } from '../../shared/dates';
import { centsToInput, parseAmount } from '../../shared/money';
import { monthlyEquivalent, nextDueDate } from '../../shared/recurring';
import type { Frequency, Recurring as Rule, RecurringInput } from '../../shared/schema';
import { CategoryPicker } from '@/components/CategoryPicker';
import { EmptyState } from '@/components/Feedback';
import { Page, PageHeader } from '@/components/Layout';
import { ResponsiveSheet, SheetFooter } from '@/components/ResponsiveSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirm } from '@/context/confirm';
import { currencySymbol, formatDate, useMoney } from '@/lib/format';
import { useAppData, useDeleteRecurring, useSaveRecurring } from '@/lib/queries';
import { localToday } from '@/lib/today';
import { cn } from '@/lib/utils';

const FREQ_LABEL: Record<Frequency, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

function toInput(rule: Rule, patch: Partial<RecurringInput> = {}): RecurringInput {
  return {
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
  const [sheet, setSheet] = useState<{ open: boolean; rule?: Rule; nonce: number }>({ open: false, nonce: 0 });
  const openSheet = (rule?: Rule) => setSheet({ open: true, rule, nonce: Date.now() });

  const active = recurring.filter((r) => !r.paused);
  const monthly = active.reduce((acc, r) => acc + monthlyEquivalent(r.amount, r.frequency), 0);
  const sorted = [...recurring].sort(
    (a, b) => Number(a.paused) - Number(b.paused) || nextDueDate(a, today).localeCompare(nextDueDate(b, today)),
  );
  const next = active.length ? sorted[0] : undefined;

  return (
    <Page>
      <PageHeader
        title="Recurring"
        subtitle="Bills and subscriptions that log themselves when due."
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
              <p className="text-sm text-muted-foreground">Committed each month</p>
              <p className="tabular mt-1 text-3xl font-bold tracking-tight">{money(monthly)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="tabular mt-1 text-3xl font-bold tracking-tight">
                {active.length}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {recurring.length - active.length} paused
                </span>
              </p>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <p className="text-sm text-muted-foreground">Next due</p>
              <p className="mt-1 truncate text-lg font-semibold">
                {next ? `${next.name} · ${formatDate(nextDueDate(next, today), today)}` : '—'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-clip py-0">
          {sorted.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="No Recurring Expenses Yet"
              action={<Button onClick={() => openSheet()}>Add Your First</Button>}
            >
              Rent, subscriptions and bills are added to your history automatically on each due date.
            </EmptyState>
          ) : (
            <ul className="divide-y" aria-label="Recurring expenses">
              {sorted.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  color={categories.expense.find((c) => c.id === rule.categoryId)?.color}
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
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        title={sheet.rule ? 'Edit Recurring Expense' : 'New Recurring Expense'}
      >
        <RecurringForm key={sheet.nonce} rule={sheet.rule} onDone={() => setSheet((s) => ({ ...s, open: false }))} />
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
      toast.success('Recurring expense deleted');
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
      <span className="tabular shrink-0 font-semibold">{money(rule.amount)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-10" aria-label={`Actions for ${rule.name}`}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void togglePause()}>
            {rule.paused ? <Play /> : <Pause />} {rule.paused ? 'Resume' : 'Pause'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void onDelete()}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function RecurringForm({ rule, onDone }: { rule?: Rule; onDone: () => void }) {
  const { categories, settings } = useAppData();
  const save = useSaveRecurring();
  const ids = { name: useId(), amount: useId(), freq: useId(), start: useId(), note: useId() };
  const expenseCats = categories.expense.filter((c) => !c.archived || c.id === rule?.categoryId);

  const [name, setName] = useState(rule?.name ?? '');
  const [amount, setAmount] = useState(rule ? centsToInput(rule.amount) : '');
  const [categoryId, setCategoryId] = useState(
    rule?.categoryId ?? expenseCats.find((c) => c.id === 'subscriptions')?.id ?? expenseCats.at(0)?.id ?? '',
  );
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(rule?.startDate ?? localToday());
  const [note, setNote] = useState(rule?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = parseAmount(amount);
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Give it a name';
    if (cents === null) next.amount = 'Enter an amount greater than zero';
    if (!categoryId) next.categoryId = 'Pick a category';
    if (!isValidIsoDate(startDate)) next.startDate = 'Pick a valid date';
    setErrors(next);
    if (Object.keys(next).length > 0 || cents === null) {
      const first = next.name ? ids.name : next.amount ? ids.amount : next.startDate ? ids.start : null;
      if (first) document.getElementById(first)?.focus();
      else document.querySelector<HTMLInputElement>('input[name="recurring-category"]')?.focus();
      return;
    }
    try {
      await save.mutateAsync({
        id: rule?.id,
        input: {
          name: name.trim(),
          amount: cents,
          categoryId,
          frequency,
          startDate,
          note: note.trim() || undefined,
          paused: rule?.paused ?? false,
        },
      });
      toast.success(rule ? 'Recurring expense updated' : 'Recurring expense added');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save. Check your connection and try again.');
    }
  }

  return (
    <form className="space-y-5 pt-1" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="space-y-2">
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          value={name}
          maxLength={60}
          placeholder="e.g. Rent, Netflix…"
          name="name"
          autoComplete="off"
          data-autofocus={rule ? undefined : true}
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => setName(e.target.value)}
          className="h-11"
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={ids.amount}>Amount ({currencySymbol(settings.currency)})</Label>
          <Input
            id={ids.amount}
            className="tabular h-11"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            maxLength={16}
            aria-invalid={Boolean(errors.amount)}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          />
          {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.freq}>Repeats</Label>
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
        </div>
      </div>
      <CategoryPicker
        name="recurring-category"
        legend="Category"
        categories={expenseCats}
        value={categoryId}
        onChange={setCategoryId}
        error={errors.categoryId}
      />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-2">
          <Label htmlFor={ids.start}>Start date</Label>
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
          {errors.startDate && <p className="text-sm text-destructive">{errors.startDate}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.note}>
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={ids.note}
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Added automatically on each due date. Dates before this month aren’t back-filled.
      </p>
      <SheetFooter>
        <Button type="submit" className="press h-11 flex-1 text-base" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {rule ? 'Save Changes' : 'Add Recurring Expense'}
        </Button>
      </SheetFooter>
    </form>
  );
}
