import { ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { useId, useRef, useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { isValidIsoDate } from '../../shared/dates';
import { centsToInput, parseAmount } from '../../shared/money';
import type { Transaction, TransactionType } from '../../shared/schema';
import { CategoryPicker } from './CategoryPicker';
import { SheetFooter } from './ResponsiveSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/context/confirm';
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning';
import { currencySymbol } from '@/lib/format';
import { useAppData, useDeleteTransaction, useSaveTransaction } from '@/lib/queries';
import { localToday } from '@/lib/today';
import { cn } from '@/lib/utils';

interface Props {
  initialType: TransactionType;
  editing?: Transaction;
  onDone: () => void;
}

interface Errors {
  amount?: string;
  categoryId?: string;
  date?: string;
}

const TYPES = [
  { value: 'expense', label: 'Expense', icon: ArrowUpRight },
  { value: 'income', label: 'Income', icon: ArrowDownLeft },
] as const;

export function TransactionForm({ initialType, editing, onDone }: Props) {
  const { categories, settings } = useAppData();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const confirm = useConfirm();
  const ids = { amount: useId(), date: useId(), note: useId(), amountError: useId() };

  const [type, setType] = useState<TransactionType>(editing?.type ?? initialType);
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amount) : '');
  const [date, setDate] = useState(editing?.date ?? localToday());
  const [note, setNote] = useState(editing?.note ?? '');
  const [errors, setErrors] = useState<Errors>({});

  const active = (t: TransactionType) => categories[t].filter((c) => !c.archived || c.id === editing?.categoryId);
  const defaultCategory = (t: TransactionType) => {
    const last = t === 'income' ? settings.lastIncomeCategoryId : settings.lastExpenseCategoryId;
    const list = active(t);
    return list.find((c) => c.id === last)?.id ?? list.at(0)?.id ?? '';
  };
  const [categoryByType, setCategoryByType] = useState<Record<TransactionType, string>>(() => ({
    expense: editing?.type === 'expense' ? editing.categoryId : defaultCategory('expense'),
    income: editing?.type === 'income' ? editing.categoryId : defaultCategory('income'),
  }));
  const categoryId = categoryByType[type];
  useUnsavedWarning(!editing && (amount !== '' || note.trim() !== ''));

  // The Enter key that opened the sheet can land in the amount field as an implicit submit.
  // Only accept submits after the user has interacted with the form.
  const armed = useRef(false);
  const arm = () => {
    armed.current = true;
  };

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!armed.current) return;
    const cents = parseAmount(amount);
    const next = validate(cents, categoryId, date, type);
    setErrors(next);
    if (cents === null || Object.keys(next).length > 0) {
      focusFirstError(next, ids, type);
      return;
    }
    try {
      await save.mutateAsync({
        original: editing,
        input: { type, amount: cents, categoryId, date, note: note.trim() || undefined },
      });
      toast.success(editing ? 'Transaction updated' : type === 'income' ? 'Income added' : 'Expense added');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save. Check your connection and try again.');
    }
  }

  async function onDelete() {
    if (!editing) return;
    const ok = await confirm({
      title: 'Delete This Transaction?',
      message: 'It will be removed from your history and totals. This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(editing);
      toast.success('Transaction deleted');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t delete. Check your connection and try again.');
    }
  }

  return (
    <form className="space-y-5 pt-1" onSubmit={(e) => void onSubmit(e)} noValidate>
      <TypeSwitch value={type} onChange={setType} />

      <AmountField
        id={ids.amount}
        errorId={ids.amountError}
        value={amount}
        error={errors.amount}
        currency={settings.currency}
        focusOnOpen={!editing}
        onInput={(v) => {
          arm();
          setAmount(v);
        }}
        onKeyDown={arm}
      />

      <CategoryPicker
        name={`category-${type}`}
        legend={type === 'income' ? 'Source' : 'Category'}
        categories={active(type)}
        value={categoryId}
        onChange={(id) => setCategoryByType((prev) => ({ ...prev, [type]: id }))}
        error={errors.categoryId}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
        <div className="space-y-2">
          <Label htmlFor={ids.date}>Date</Label>
          <Input
            id={ids.date}
            type="date"
            name="date"
            autoComplete="off"
            required
            value={date}
            aria-invalid={Boolean(errors.date)}
            onChange={(e) => setDate(e.target.value)}
            className="h-11"
          />
          {errors.date && <p className="text-sm text-destructive">{errors.date}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.note}>
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={ids.note}
            maxLength={280}
            value={note}
            placeholder={type === 'income' ? 'e.g. November invoice…' : 'e.g. Lunch with Sam…'}
            name="note"
            autoComplete="off"
            onChange={(e) => setNote(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <SheetFooter>
        {editing && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-destructive hover:text-destructive"
            onClick={() => void onDelete()}
            disabled={remove.isPending}
          >
            Delete
          </Button>
        )}
        <Button
          type="submit"
          className="press h-11 flex-1 text-base"
          disabled={save.isPending}
          onPointerDown={arm}
          onKeyDown={arm}
        >
          {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {editing ? 'Save Changes' : type === 'income' ? 'Add Income' : 'Add Expense'}
        </Button>
      </SheetFooter>
    </form>
  );
}

function validate(cents: number | null, categoryId: string, date: string, type: TransactionType): Errors {
  const next: Errors = {};
  if (cents === null) next.amount = 'Enter an amount greater than zero';
  if (!categoryId) next.categoryId = type === 'income' ? 'Pick a source' : 'Pick a category';
  if (!isValidIsoDate(date)) next.date = 'Pick a valid date';
  return next;
}

/** Move focus to the first field that needs fixing. */
function focusFirstError(errors: Errors, ids: { amount: string; date: string }, type: TransactionType) {
  if (errors.amount) document.getElementById(ids.amount)?.focus();
  else if (errors.categoryId) document.querySelector<HTMLInputElement>(`input[name="category-${type}"]`)?.focus();
  else if (errors.date) document.getElementById(ids.date)?.focus();
}

function TypeSwitch({ value, onChange }: { value: TransactionType; onChange: (t: TransactionType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Transaction type">
      {TYPES.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'press flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors outline-none',
            'focus-visible:ring-[3px] focus-visible:ring-ring/50',
            value === v && 'bg-background text-foreground shadow-sm dark:bg-accent',
            value === v && (v === 'income' ? 'text-income' : 'text-expense'),
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

interface AmountFieldProps {
  id: string;
  errorId: string;
  value: string;
  error?: string;
  currency: string;
  focusOnOpen: boolean;
  onInput: (value: string) => void;
  onKeyDown: () => void;
}

function AmountField({ id, errorId, value, error, currency, focusOnOpen, onInput, onKeyDown }: AmountFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Amount</Label>
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3 transition-shadow',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          error && 'border-destructive',
        )}
      >
        <span className="text-2xl font-semibold text-muted-foreground" aria-hidden="true">
          {currencySymbol(currency)}
        </span>
        <input
          id={id}
          name="amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="0.00"
          // Quick add's whole point is "open, type, save": focus the amount when the sheet opens.
          data-autofocus={focusOnOpen ? true : undefined}
          value={value}
          maxLength={16}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onKeyDown={onKeyDown}
          onChange={(e) => onInput(e.target.value.replace(/[^\d.,]/g, ''))}
          className="tabular w-full min-w-0 bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
        />
      </div>
      {error && (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
