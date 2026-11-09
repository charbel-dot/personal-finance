import { ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { isValidIsoDate } from '../../shared/dates';
import { centsToInput, parseAmount } from '../../shared/money';
import type { Transaction, TransactionType } from '../../shared/schema';
import { CategoryPicker } from './CategoryPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/context/confirm';
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

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = parseAmount(amount);
    const next: Errors = {};
    if (cents === null) next.amount = 'Enter an amount greater than zero';
    if (!categoryId) next.categoryId = type === 'income' ? 'Pick a source' : 'Pick a category';
    if (!isValidIsoDate(date)) next.date = 'Pick a valid date';
    setErrors(next);
    if (Object.keys(next).length > 0 || cents === null) return;
    try {
      await save.mutateAsync({
        original: editing,
        input: { type, amount: cents, categoryId, date, note: note.trim() || undefined },
      });
      toast.success(editing ? 'Transaction updated' : type === 'income' ? 'Income added' : 'Expense added');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
  }

  async function onDelete() {
    if (!editing) return;
    const ok = await confirm({
      title: 'Delete this transaction?',
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
      toast.error(err instanceof Error ? err.message : 'Could not delete');
    }
  }

  return (
    <form className="space-y-5" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Transaction type">
        {TYPES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={type === value}
            onClick={() => setType(value)}
            className={cn(
              'press flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors outline-none',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50',
              type === value && 'bg-background text-foreground shadow-sm dark:bg-accent',
              type === value && (value === 'income' ? 'text-income' : 'text-expense'),
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.amount}>Amount</Label>
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3 transition-shadow',
            'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
            errors.amount && 'border-destructive',
          )}
        >
          <span className="text-2xl font-semibold text-muted-foreground" aria-hidden="true">
            {currencySymbol(settings.currency)}
          </span>
          <input
            id={ids.amount}
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="0.00"
            data-autofocus={editing ? undefined : true}
            value={amount}
            maxLength={16}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? ids.amountError : undefined}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            className="tabular w-full min-w-0 bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        {errors.amount && (
          <p id={ids.amountError} className="text-sm text-destructive" role="alert">
            {errors.amount}
          </p>
        )}
      </div>

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
            placeholder={type === 'income' ? 'e.g. November invoice' : 'e.g. Lunch with Sam'}
            onChange={(e) => setNote(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="sticky bottom-0 -mx-1 flex gap-2 bg-background px-1 pt-3 pb-1">
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
        <Button type="submit" className="press h-11 flex-1 text-base" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {editing ? 'Save changes' : `Add ${type}`}
        </Button>
      </div>
    </form>
  );
}
