import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CATEGORY_COLORS } from '../../shared/defaults';
import { CURRENCIES, centsToInput } from '../../shared/money';
import type { BudgetGroup, CategoriesDoc, Category } from '../../shared/schema';
import { PageHeader } from '../components/Layout';
import { Icon } from '../components/Icon';
import { useConfirm } from '../context/confirm';
import { useToast } from '../context/toast';
import { api } from '../lib/api';
import { useAppData, usePatchSettings, useSaveCategories } from '../lib/queries';
import { useTheme, type ThemePref } from '../lib/theme';

export default function Settings() {
  const { settings } = useAppData();
  const patch = usePatchSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const [opening, setOpening] = useState(() => centsToInput(settings.openingBalance));

  async function update(p: Parameters<typeof patch.mutateAsync>[0], message: string) {
    try {
      await patch.mutateAsync(p);
      toast.show(message);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not save', { kind: 'error' });
    }
  }

  function saveOpening() {
    const trimmed = opening.trim().replace(',', '.');
    const value = Number(trimmed || '0');
    if (!/^-?\d+(\.\d{0,2})?$/.test(trimmed || '0') || !Number.isFinite(value)) {
      toast.show('Enter a valid opening balance', { kind: 'error' });
      return;
    }
    const cents = Math.round(value * 100);
    if (cents !== settings.openingBalance) void update({ openingBalance: cents }, 'Opening balance saved');
  }

  async function logout() {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need your password to sign back in.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    try {
      await api.logout();
    } finally {
      qc.clear();
      void navigate('/login', { replace: true });
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="main stack">
        <section className="card stack" aria-labelledby="pref-h">
          <h2 id="pref-h">Preferences</h2>
          <div className="field">
            <span className="field__label" id="theme-label">
              Appearance
            </span>
            <div className="segmented" role="group" aria-labelledby="theme-label">
              {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
                <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="currency" className="field__label">
              Currency
            </label>
            <select
              id="currency"
              className="select"
              value={settings.currency}
              onChange={(e) => void update({ currency: e.target.value }, `Currency set to ${e.target.value}`)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="opening" className="field__label">
              Opening balance
            </label>
            <input
              id="opening"
              className="input num"
              inputMode="decimal"
              value={opening}
              onChange={(e) => setOpening(e.target.value.replace(/[^\d.,-]/g, ''))}
              onBlur={saveOpening}
            />
            <span className="field__hint">
              Money you had before you started tracking. Added to your current balance.
            </span>
          </div>
        </section>

        <CategoryEditor />

        <section className="card stack" aria-labelledby="acct-h">
          <h2 id="acct-h">Account</h2>
          <p className="small muted">
            Timezone for recurring entries: <strong>{settings.timezone}</strong>
          </p>
          <button type="button" className="btn btn--secondary" onClick={() => void logout()}>
            <Icon name="logout" size={18} /> Sign out
          </button>
        </section>
      </div>
    </>
  );
}

const GROUPS: { value: BudgetGroup; label: string }[] = [
  { value: 'needs', label: 'Need' },
  { value: 'wants', label: 'Want' },
  { value: 'savings', label: 'Savings' },
];

function slug(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'cat';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

function CategoryEditor() {
  const { categories } = useAppData();
  const save = useSaveCategories();
  const toast = useToast();
  const [tab, setTab] = useState<'expense' | 'income'>('expense');
  const [draft, setDraft] = useState<CategoriesDoc>(() => ({
    expense: categories.expense.filter((c) => !c.archived),
    income: categories.income.filter((c) => !c.archived),
  }));
  const [newName, setNewName] = useState('');

  const list = draft[tab];
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({
      expense: categories.expense.filter((c) => !c.archived),
      income: categories.income.filter((c) => !c.archived),
    });
  const invalid = [...draft.expense, ...draft.income].some((c) => !c.name.trim());

  const setItem = (id: string, patch: Partial<Category>) =>
    setDraft((d) => ({ ...d, [tab]: d[tab].map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  function add() {
    const name = newName.trim();
    if (!name) return;
    const taken = new Set(
      [...categories.expense, ...categories.income, ...draft.expense, ...draft.income].map((c) => c.id),
    );
    const color = CATEGORY_COLORS[list.length % CATEGORY_COLORS.length];
    const item: Category = {
      id: slug(name, taken),
      name: name.slice(0, 40),
      color,
      ...(tab === 'expense' ? { group: 'wants' as const } : {}),
    };
    setDraft((d) => ({ ...d, [tab]: [...d[tab], item] }));
    setNewName('');
  }

  async function onSave() {
    try {
      const saved = await save.mutateAsync({
        expense: draft.expense.map((c) => ({ ...c, name: c.name.trim() })),
        income: draft.income.map((c) => ({ ...c, name: c.name.trim() })),
      });
      setDraft({ expense: saved.expense.filter((c) => !c.archived), income: saved.income.filter((c) => !c.archived) });
      toast.show('Categories saved');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not save', { kind: 'error' });
    }
  }

  return (
    <section className="card stack" aria-labelledby="cat-h">
      <div className="row row--between">
        <h2 id="cat-h">Categories</h2>
        {dirty && <span className="badge">Unsaved</span>}
      </div>
      <div className="segmented" role="group" aria-label="Category type">
        <button type="button" aria-pressed={tab === 'expense'} onClick={() => setTab('expense')}>
          Expense categories
        </button>
        <button type="button" aria-pressed={tab === 'income'} onClick={() => setTab('income')}>
          Income sources
        </button>
      </div>
      {tab === 'expense' && (
        <p className="field__hint">
          The Need/Want/Savings tag drives the 50/30/20 analysis. Removed categories are archived so past entries keep
          their label.
        </p>
      )}
      <ul className="list stack" style={{ gap: 8 }}>
        {list.map((c) => (
          <li key={c.id} className="row" style={{ border: 0, gap: 8 }}>
            <label className="sr-only" htmlFor={`color-${c.id}`}>
              Color for {c.name}
            </label>
            <input
              id={`color-${c.id}`}
              type="color"
              className="swatch"
              value={c.color}
              onChange={(e) => setItem(c.id, { color: e.target.value })}
            />
            <label className="sr-only" htmlFor={`name-${c.id}`}>
              Name
            </label>
            <input
              id={`name-${c.id}`}
              className="input"
              value={c.name}
              maxLength={40}
              aria-invalid={!c.name.trim()}
              onChange={(e) => setItem(c.id, { name: e.target.value })}
            />
            {tab === 'expense' && (
              <>
                <label className="sr-only" htmlFor={`group-${c.id}`}>
                  Budget group for {c.name}
                </label>
                <select
                  id={`group-${c.id}`}
                  className="select"
                  style={{ width: 110 }}
                  value={c.group ?? 'wants'}
                  onChange={(e) => setItem(c.id, { group: e.target.value as BudgetGroup })}
                >
                  {GROUPS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${c.name}`}
              disabled={list.length <= 1}
              onClick={() => setDraft((d) => ({ ...d, [tab]: d[tab].filter((x) => x.id !== c.id) }))}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="new-cat" className="sr-only">
          New {tab === 'expense' ? 'category' : 'source'} name
        </label>
        <input
          id="new-cat"
          className="input"
          placeholder={tab === 'expense' ? 'New category' : 'New income source'}
          maxLength={40}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn btn--secondary" disabled={!newName.trim()}>
          Add
        </button>
      </form>
      <button
        type="button"
        className="btn btn--primary"
        disabled={!dirty || invalid || save.isPending}
        onClick={() => void onSave()}
      >
        {save.isPending ? <span className="spinner" aria-label="Saving" /> : 'Save categories'}
      </button>
    </section>
  );
}
