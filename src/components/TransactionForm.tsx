import { useId, useState, type SyntheticEvent } from 'react';
import { centsToInput, parseAmount } from '../../shared/money';
import { isValidIsoDate } from '../../shared/dates';
import type { Transaction, TransactionType } from '../../shared/schema';
import { currencySymbol } from '../lib/format';
import { useAppData, useDeleteTransaction, useSaveTransaction } from '../lib/queries';
import { localToday } from '../lib/today';
import { CategoryPicker } from './CategoryPicker';
import { useConfirm } from '../context/confirm';
import { useToast } from '../context/toast';

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

export function TransactionForm({ initialType, editing, onDone }: Props) {
  const { categories, settings } = useAppData();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const toast = useToast();
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
      toast.show(editing ? 'Transaction updated' : type === 'income' ? 'Income added' : 'Expense added');
      onDone();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not save', { kind: 'error' });
    }
  }

  async function onDelete() {
    if (!editing) return;
    const ok = await confirm({
      title: 'Delete transaction?',
      message: 'This permanently removes it from your history.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(editing);
      toast.show('Transaction deleted');
      onDone();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not delete', { kind: 'error' });
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="segmented segmented--type" role="group" aria-label="Transaction type">
        {(['expense', 'income'] as const).map((t) => (
          <button key={t} type="button" data-type={t} aria-pressed={type === t} onClick={() => setType(t)}>
            {t === 'expense' ? 'Expense' : 'Income'}
          </button>
        ))}
      </div>

      <div className="field">
        <label htmlFor={ids.amount} className="field__label">
          Amount
        </label>
        <div className="amount-input">
          <span className="amount-input__symbol" aria-hidden="true">
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
            // Focused as soon as the sheet opens: the fastest path is "open → type → save".
            data-autofocus={editing ? undefined : true}
            value={amount}
            maxLength={16}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? ids.amountError : undefined}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </div>
        {errors.amount && (
          <span id={ids.amountError} className="field__error" role="alert">
            {errors.amount}
          </span>
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

      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
        <div className="field">
          <label htmlFor={ids.date} className="field__label">
            Date
          </label>
          <input
            id={ids.date}
            className="input"
            type="date"
            required
            value={date}
            aria-invalid={Boolean(errors.date)}
            onChange={(e) => setDate(e.target.value)}
          />
          {errors.date && <span className="field__error">{errors.date}</span>}
        </div>
        <div className="field">
          <label htmlFor={ids.note} className="field__label">
            Note <span className="muted">(optional)</span>
          </label>
          <input
            id={ids.note}
            className="input"
            type="text"
            maxLength={280}
            value={note}
            placeholder={type === 'income' ? 'e.g. November invoice' : 'e.g. Lunch with Sam'}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 4 }}>
        {editing && (
          <button type="button" className="btn btn--ghost" onClick={() => void onDelete()} disabled={remove.isPending}>
            Delete
          </button>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={save.isPending} style={{ flex: 1 }}>
          {save.isPending ? <span className="spinner" aria-label="Saving" /> : editing ? 'Save changes' : `Add ${type}`}
        </button>
      </div>
    </form>
  );
}
