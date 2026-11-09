import { useId, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { centsToInput, parseAmount } from '../../shared/money';
import { monthlyEquivalent, nextDueDate } from '../../shared/recurring';
import { isValidIsoDate } from '../../shared/dates';
import type { Frequency, Recurring as Rule, RecurringInput } from '../../shared/schema';
import { CategoryPicker } from '../components/CategoryPicker';
import { EmptyState } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/Layout';
import { Sheet } from '../components/Sheet';
import { useConfirm } from '../context/confirm';
import { useToast } from '../context/toast';
import { currencySymbol, formatDate, useMoney } from '../lib/format';
import { useAppData, useDeleteRecurring, useSaveRecurring } from '../lib/queries';
import { localToday } from '../lib/today';

const FREQ_LABEL: Record<Frequency, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

export default function Recurring() {
  const { recurring, categories } = useAppData();
  const money = useMoney();
  const save = useSaveRecurring();
  const remove = useDeleteRecurring();
  const toast = useToast();
  const confirm = useConfirm();
  const today = localToday();
  const [editing, setEditing] = useState<{ rule?: Rule; nonce: number } | null>(null);

  const active = recurring.filter((r) => !r.paused);
  const monthly = active.reduce((acc, r) => acc + monthlyEquivalent(r.amount, r.frequency), 0);
  const sorted = [...recurring].sort(
    (a, b) => Number(a.paused) - Number(b.paused) || nextDueDate(a, today).localeCompare(nextDueDate(b, today)),
  );

  async function togglePause(rule: Rule) {
    try {
      await save.mutateAsync({ id: rule.id, input: toInput(rule, { paused: !rule.paused }) });
      toast.show(rule.paused ? `${rule.name} resumed` : `${rule.name} paused`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not update', { kind: 'error' });
    }
  }

  async function onDelete(rule: Rule) {
    const ok = await confirm({
      title: `Delete “${rule.name}”?`,
      message: 'Future entries stop being created. Entries already in your history are kept.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(rule.id);
      toast.show('Recurring expense deleted');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not delete', { kind: 'error' });
    }
  }

  return (
    <>
      <PageHeader
        title="Recurring"
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing({ nonce: Date.now() })}>
            <Icon name="plus" size={18} /> New
          </button>
        }
      />
      <div className="main stack">
        <section className="card">
          <p className="muted small">Committed every month</p>
          <p className="hero__amount num" style={{ fontSize: 'var(--text-2xl)' }}>
            {money(monthly)}
          </p>
          <p className="muted xs">
            {active.length} active · {recurring.length - active.length} paused · weekly and yearly costs normalised to a
            month
          </p>
        </section>

        <section className="card card--flush" aria-label="Recurring expenses">
          {sorted.length === 0 ? (
            <EmptyState
              icon="repeat"
              title="No recurring expenses yet"
              action={
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setEditing({ nonce: Date.now() })}
                >
                  Add one
                </button>
              }
            >
              Rent, subscriptions and bills are logged automatically when due.
            </EmptyState>
          ) : (
            <ul className="list">
              {sorted.map((rule) => {
                const cat = categories.expense.find((c) => c.id === rule.categoryId);
                return (
                  <li key={rule.id} className="list-item" style={{ opacity: rule.paused ? 0.65 : 1 }}>
                    <span className="dot dot--row" style={{ '--dot': cat?.color } as CSSProperties} />
                    <button
                      type="button"
                      className="list-item__main"
                      style={{ border: 0, background: 'none', padding: 0, textAlign: 'left' }}
                      onClick={() => setEditing({ rule, nonce: Date.now() })}
                      aria-label={`Edit ${rule.name}`}
                    >
                      <span className="list-item__title" style={{ display: 'block' }}>
                        {rule.name}
                      </span>
                      <span className="list-item__sub list-item__sub--wrap" style={{ display: 'block' }}>
                        {money(rule.amount)} · {FREQ_LABEL[rule.frequency]} ·{' '}
                        {rule.paused ? 'Paused' : `Next ${formatDate(nextDueDate(rule, today), today)}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void togglePause(rule)}
                      aria-label={rule.paused ? `Resume ${rule.name}` : `Pause ${rule.name}`}
                      disabled={save.isPending}
                    >
                      <Icon name={rule.paused ? 'play' : 'pause'} size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void onDelete(rule)}
                      aria-label={`Delete ${rule.name}`}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.rule ? 'Edit recurring expense' : 'New recurring expense'}
      >
        {editing && <RecurringForm key={editing.nonce} rule={editing.rule} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

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

function RecurringForm({ rule, onDone }: { rule?: Rule; onDone: () => void }) {
  const { categories, settings } = useAppData();
  const save = useSaveRecurring();
  const toast = useToast();
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
    if (Object.keys(next).length > 0 || cents === null) return;
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
      toast.show(rule ? 'Recurring expense updated' : 'Recurring expense added');
      onDone();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not save', { kind: 'error' });
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="field">
        <label htmlFor={ids.name} className="field__label">
          Name
        </label>
        <input
          id={ids.name}
          className="input"
          value={name}
          maxLength={60}
          placeholder="e.g. Rent, Netflix"
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => setName(e.target.value)}
        />
        {errors.name && <span className="field__error">{errors.name}</span>}
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label htmlFor={ids.amount} className="field__label">
            Amount ({currencySymbol(settings.currency)})
          </label>
          <input
            id={ids.amount}
            className="input num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            maxLength={16}
            aria-invalid={Boolean(errors.amount)}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          />
          {errors.amount && <span className="field__error">{errors.amount}</span>}
        </div>
        <div className="field">
          <label htmlFor={ids.freq} className="field__label">
            Repeats
          </label>
          <select
            id={ids.freq}
            className="select"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
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
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
        <div className="field">
          <label htmlFor={ids.start} className="field__label">
            Start date
          </label>
          <input
            id={ids.start}
            className="input"
            type="date"
            value={startDate}
            aria-invalid={Boolean(errors.startDate)}
            onChange={(e) => setStartDate(e.target.value)}
          />
          {errors.startDate && <span className="field__error">{errors.startDate}</span>}
        </div>
        <div className="field">
          <label htmlFor={ids.note} className="field__label">
            Note <span className="muted">(optional)</span>
          </label>
          <input
            id={ids.note}
            className="input"
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <p className="field__hint">
        Entries are added automatically on each due date. Past dates before this month aren&apos;t back-filled.
      </p>
      <button type="submit" className="btn btn--primary btn--block" disabled={save.isPending}>
        {save.isPending ? (
          <span className="spinner" aria-label="Saving" />
        ) : rule ? (
          'Save changes'
        ) : (
          'Add recurring expense'
        )}
      </button>
    </form>
  );
}
