import { ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { useId, useRef, useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { isValidIsoDate } from '../../shared/dates';
import type { Account, Category, Settings, Transaction, TransactionType } from '../../shared/schema';
import { AccountSwitch, RecipientField } from './AccountFields';
import { CategoryPicker } from './CategoryPicker';
import { ConversionHint, CurrencySwitch } from './MoneyField';
import { SheetFooter } from './ResponsiveSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/context/confirm';
import { useMoneyField, type MoneyFieldState } from '@/hooks/use-money-field';
import { readAmountInput } from '@/lib/amount-input';
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning';
import { currencySymbol, useMoney } from '@/lib/format';
import { useAppData, useDeleteTransaction, useSaveTransaction } from '@/lib/queries';
import { localToday } from '@/lib/today';
import { cn } from '@/lib/utils';
import { Segmented } from './Segmented';

interface Props {
  initialType: TransactionType;
  /** Where a new transaction moves money through (default: cash). */
  initialAccount?: Account;
  /** A Whish send: asks who the money goes to. */
  send?: boolean;
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

export function TransactionForm({ initialType, initialAccount, send, editing, onDone }: Props) {
  const { categories, settings } = useAppData();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const confirm = useConfirm();
  const money = useMoney();
  const ids = {
    amount: useId(),
    date: useId(),
    note: useId(),
    to: useId(),
    amountError: useId(),
    amountHint: useId(),
  };

  const [initial] = useState(() => startValues(editing, initialType, initialAccount));
  const [type, setType] = useState<TransactionType>(initial.type);
  const amount = useMoneyField(editing?.amount);
  const [account, setAccount] = useState<Account>(initial.account);
  const [to, setTo] = useState(initial.to);
  const [date, setDate] = useState(initial.date);
  const [note, setNote] = useState(initial.note);
  const [errors, setErrors] = useState<Errors>({});

  const active = (t: TransactionType) => categories[t].filter((c) => !c.archived || c.id === editing?.categoryId);
  const [categoryByType, setCategoryByType] = useState<Record<TransactionType, string>>(() => ({
    expense: startCategory('expense', active('expense'), settings, editing),
    income: startCategory('income', active('income'), settings, editing),
  }));
  const categoryId = categoryByType[type];
  useUnsavedWarning(!editing && (amount.value !== '' || note.trim() !== '' || to.trim() !== ''));
  // Whish expenses ask who the money went to when opened as a send or already naming someone.
  const showTo = account === 'whish' && type === 'expense' && (send === true || initial.to !== '' || to !== '');

  // The Enter key that opened the sheet can land in the amount field as an implicit submit.
  // Only accept submits after the user has interacted with the form.
  const armed = useRef(false);
  const arm = () => {
    armed.current = true;
  };

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!armed.current) return;
    const cents = amount.stored();
    const next = validate(cents, categoryId, date, type);
    setErrors(next);
    if (cents === null || Object.keys(next).length > 0) {
      focusFirstError(next, ids, type);
      return;
    }
    try {
      await save.mutateAsync({
        original: editing,
        input: { type, amount: cents, categoryId, date, ...accountFields({ note, account, type, to }) },
      });
      announceSaved({ editing: Boolean(editing), sentTo: send ? to.trim() : '', type, cents, money, settings });
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
        hintId={ids.amountHint}
        field={amount}
        error={errors.amount}
        focusOnOpen={!editing}
        onInput={(v) => {
          arm();
          amount.setValue(v);
        }}
        onKeyDown={arm}
      />

      <AccountSwitch type={type} value={account} onChange={setAccount} />

      {showTo && <RecipientField id={ids.to} value={to} onChange={setTo} />}

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
          {submitLabel(Boolean(editing), type)}
        </Button>
      </SheetFooter>
    </form>
  );
}

function submitLabel(editing: boolean, type: TransactionType) {
  if (editing) return 'Save Changes';
  return type === 'income' ? 'Add Income' : 'Add Expense';
}

/** Form values to start from: the transaction being edited, else a fresh one. */
function startValues(editing: Transaction | undefined, type: TransactionType, account: Account | undefined) {
  return {
    type: editing?.type ?? type,
    account: editing?.account ?? account ?? 'cash',
    to: editing?.to ?? '',
    date: editing?.date ?? localToday(),
    note: editing?.note ?? '',
  };
}

/** Optional fields as the API wants them: empty → omitted, recipient only on Whish expenses. */
function accountFields(v: { note: string; account: Account; type: TransactionType; to: string }) {
  const whish = v.account === 'whish';
  return {
    note: v.note.trim() || undefined,
    account: whish ? ('whish' as const) : undefined,
    to: whish && v.type === 'expense' ? v.to.trim() || undefined : undefined,
  };
}

/** The last-used category for a new transaction (else the first), or the edited one's own. */
function startCategory(
  type: TransactionType,
  list: Category[],
  settings: Settings,
  editing: Transaction | undefined,
): string {
  if (editing?.type === type) return editing.categoryId;
  const last = type === 'income' ? settings.lastIncomeCategoryId : settings.lastExpenseCategoryId;
  return list.find((c) => c.id === last)?.id ?? list.at(0)?.id ?? '';
}

/** Success toast: a new income shows how it was split across the budget rule. */
function announceSaved(v: {
  editing: boolean;
  sentTo: string;
  type: TransactionType;
  cents: number;
  money: (cents: number) => string;
  settings: Settings;
}) {
  if (!v.editing && v.type === 'income' && v.settings.autoSplit) {
    const r = v.settings.budgetRule;
    const part = (pct: number) => v.money(Math.round((v.cents * pct) / 100));
    toast.success('Income added and split', {
      description: `${part(r.needs)} needs · ${part(r.wants)} wants · ${part(r.savings)} savings`,
    });
    return;
  }
  if (v.editing) toast.success('Transaction updated');
  else if (v.sentTo) toast.success(`Sent ${v.money(v.cents)} to ${v.sentTo}`);
  else toast.success(v.type === 'income' ? 'Income added' : 'Expense added');
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

export function TypeSwitch({ value, onChange }: { value: TransactionType; onChange: (t: TransactionType) => void }) {
  return (
    <Segmented
      fill
      aria-label="Transaction type"
      value={value}
      onValueChange={onChange}
      items={TYPES.map(({ value: v, label, icon: Icon }) => ({
        value: v,
        label: (
          <span className={cn('flex items-center gap-1.5', v === 'income' ? 'text-income' : 'text-expense')}>
            <Icon className="size-4" aria-hidden="true" />
            <span className="text-foreground">{label}</span>
          </span>
        ),
      }))}
    />
  );
}

interface AmountFieldProps {
  id: string;
  errorId: string;
  hintId: string;
  field: MoneyFieldState;
  error?: string;
  focusOnOpen: boolean;
  onInput: (value: string) => void;
  onKeyDown: () => void;
}

function AmountField({ id, errorId, hintId, field, error, focusOnOpen, onInput, onKeyDown }: AmountFieldProps) {
  const { value, currency } = field;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>Amount</Label>
        <CurrencySwitch value={currency} onChange={field.setCurrency} />
      </div>
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
          inputMode={currency === 'LBP' ? 'numeric' : 'decimal'}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={currency === 'LBP' ? '0' : '0.00'}
          // Quick add's whole point is "open, type, save": focus the amount when the sheet opens.
          data-autofocus={focusOnOpen ? true : undefined}
          value={value}
          maxLength={20}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          onKeyDown={onKeyDown}
          onChange={(e) => onInput(readAmountInput(e.target, value, currency))}
          className="tabular w-full min-w-0 bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
        />
      </div>
      {error && (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <ConversionHint id={hintId} value={value} currency={currency} />
    </div>
  );
}
