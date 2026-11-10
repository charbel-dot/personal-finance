import { Archive, ArchiveRestore, Check, ChevronRight, ListFilter, Loader2, Plus } from 'lucide-react';
import { useId, useMemo, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { CATEGORY_COLORS } from '../../shared/defaults';
import { endOfMonth, startOfMonth } from '../../shared/dates';
import type { BudgetGroup, CategoriesDoc, Category, TransactionType } from '../../shared/schema';
import { Page, PageHeader } from '@/components/Layout';
import { Segmented } from '@/components/Segmented';
import { ResponsiveSheet, SheetFooter } from '@/components/ResponsiveSheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/context/confirm';
import { useMoney } from '@/lib/format';
import { useAppData, useSaveCategories, useTransactions } from '@/lib/queries';
import { localToday } from '@/lib/today';
import { cn } from '@/lib/utils';

const GROUPS: { value: BudgetGroup; label: string; hint: string }[] = [
  { value: 'needs', label: 'Needs', hint: 'Rent, groceries, bills: the 50%' },
  { value: 'wants', label: 'Wants', hint: 'Eating out, shopping, fun: the 30%' },
  { value: 'savings', label: 'Savings', hint: 'Money you put aside: the 20%' },
];

interface Stat {
  total: number;
  count: number;
}

/** Black or white, whichever reads better on a #rrggbb swatch (WCAG relative luminance). */
function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 0.18 ? 'text-black' : 'text-white';
}

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

export default function Categories() {
  const { categories } = useAppData();
  const [params, setParams] = useSearchParams();
  const tab: TransactionType = params.get('tab') === 'income' ? 'income' : 'expense';
  const [sheet, setSheet] = useState<{ open: boolean; category?: Category; nonce: number }>({ open: false, nonce: 0 });
  const openSheet = (category?: Category) => setSheet({ open: true, category, nonce: Date.now() });

  const today = localToday();
  const tx = useTransactions({ from: startOfMonth(today), to: endOfMonth(today) });
  const stats = useMemo(() => {
    const map = new Map<string, Stat>();
    for (const t of tx.data ?? []) {
      const s = map.get(t.categoryId) ?? { total: 0, count: 0 };
      map.set(t.categoryId, { total: s.total + t.amount, count: s.count + 1 });
    }
    return map;
  }, [tx.data]);

  const active = categories[tab].filter((c) => !c.archived);
  const archived = categories[tab].filter((c) => c.archived);

  return (
    <Page>
      <PageHeader
        title="Categories"
        subtitle="How your spending and income are grouped."
        actions={
          <Button className="press" onClick={() => openSheet()}>
            <Plus aria-hidden="true" /> {tab === 'expense' ? 'New Category' : 'New Source'}
          </Button>
        }
      />

      <Segmented
        fill
        className="mb-4 sm:max-w-sm"
        aria-label="Category type"
        value={tab}
        onValueChange={(v) => setParams(v === 'income' ? { tab: 'income' } : {}, { replace: true })}
        items={[
          {
            value: 'expense',
            label: `Expenses · ${categories.expense.filter((c) => !c.archived).length}`,
          },
          {
            value: 'income',
            label: `Income · ${categories.income.filter((c) => !c.archived).length}`,
          },
        ]}
      />

      <div className="stagger space-y-4">
        {tab === 'expense' ? (
          GROUPS.map((g) => (
            <CategoryList
              key={g.value}
              title={g.label}
              hint={g.hint}
              items={active.filter((c) => (c.group ?? 'wants') === g.value)}
              stats={stats}
              loading={tx.isPending}
              onOpen={openSheet}
            />
          ))
        ) : (
          <CategoryList title="Income Sources" items={active} stats={stats} loading={tx.isPending} onOpen={openSheet} />
        )}
        {archived.length > 0 && <ArchivedList items={archived} type={tab} />}
      </div>

      <ResponsiveSheet
        open={sheet.open}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        title={
          sheet.category
            ? `Edit ${tab === 'expense' ? 'Category' : 'Income Source'}`
            : tab === 'expense'
              ? 'New Category'
              : 'New Income Source'
        }
      >
        <CategoryForm
          key={sheet.nonce}
          type={tab}
          category={sheet.category}
          doc={categories}
          onDone={() => setSheet((s) => ({ ...s, open: false }))}
        />
      </ResponsiveSheet>
    </Page>
  );
}

function CategoryList({
  title,
  hint,
  items,
  stats,
  loading,
  onOpen,
}: {
  title: string;
  hint?: string;
  items: Category[];
  stats: Map<string, Stat>;
  loading: boolean;
  onOpen: (c: Category) => void;
}) {
  const money = useMoney();
  const total = items.reduce((a, c) => a + (stats.get(c.id)?.total ?? 0), 0);
  return (
    <Card className="gap-0 overflow-clip py-0">
      <div className="flex items-baseline justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className="tabular shrink-0 text-sm text-muted-foreground">
          {loading ? <Skeleton className="h-4 w-16" /> : `${money(total)} this month`}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ul className="divide-y">
          {items.map((c) => {
            const s = stats.get(c.id);
            const share = total > 0 ? (s?.total ?? 0) / total : 0;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c)}
                  className="group flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent"
                  aria-label={`Edit ${c.name}`}
                >
                  <span
                    className="size-3 shrink-0 rounded-full bg-(--dot) ring-4 ring-(--dot)/15"
                    style={{ '--dot': c.color } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span
                      className="mt-1.5 block h-1 max-w-48 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <span
                        className="grow-x block h-full rounded-full bg-(--dot)"
                        style={{ width: `${share * 100}%`, '--dot': c.color } as CSSProperties}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular block font-semibold">{money(s?.total ?? 0)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s?.count ?? 0} {s?.count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ArchivedList({ items, type }: { items: Category[]; type: TransactionType }) {
  const { categories } = useAppData();
  const save = useSaveCategories();
  async function restore(c: Category) {
    try {
      await save.mutateAsync({
        ...categories,
        [type]: categories[type].map((x) => (x.id === c.id ? { ...x, archived: false } : x)),
      });
      toast.success(`${c.name} restored`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t restore. Check your connection and try again.');
    }
  }
  return (
    <Card className="gap-0 overflow-clip py-0">
      <div className="border-b px-5 py-3.5">
        <h2 className="font-semibold">Archived</h2>
        <p className="text-xs text-muted-foreground">Hidden from quick add. Past entries keep their label.</p>
      </div>
      <ul className="divide-y">
        {items.map((c) => (
          <li key={c.id} className="flex min-h-14 items-center gap-3 px-5 py-2">
            <span
              className="size-3 shrink-0 rounded-full bg-(--dot) opacity-50"
              style={{ '--dot': c.color } as CSSProperties}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.name}</span>
            <Button variant="ghost" size="sm" onClick={() => void restore(c)} disabled={save.isPending}>
              <ArchiveRestore aria-hidden="true" /> Restore
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CategoryForm({
  type,
  category,
  doc,
  onDone,
}: {
  type: TransactionType;
  category?: Category;
  doc: CategoriesDoc;
  onDone: () => void;
}) {
  const save = useSaveCategories();
  const confirm = useConfirm();
  const ids = { name: useId(), color: useId(), group: useId() };
  const activeCount = doc[type].filter((c) => !c.archived).length;
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState<string>(category?.color ?? CATEGORY_COLORS[activeCount % CATEGORY_COLORS.length]);
  const [group, setGroup] = useState<BudgetGroup>(category?.group ?? 'wants');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give it a name');
      document.getElementById(ids.name)?.focus();
      return;
    }
    const clash = doc[type].some(
      (c) => c.id !== category?.id && !c.archived && c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (clash) {
      setError('You already have one with this name. Pick a different name.');
      document.getElementById(ids.name)?.focus();
      return;
    }
    const taken = new Set([...doc.expense, ...doc.income].map((c) => c.id));
    const item: Category = {
      id: category?.id ?? slug(trimmed, taken),
      name: trimmed.slice(0, 40),
      color,
      ...(type === 'expense' ? { group } : {}),
    };
    const list = category ? doc[type].map((c) => (c.id === category.id ? item : c)) : [...doc[type], item];
    try {
      await save.mutateAsync({ ...doc, [type]: list });
      toast.success(category ? `${item.name} updated` : `${item.name} added`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save. Check your connection and try again.');
    }
  }

  async function onArchive() {
    if (!category) return;
    const ok = await confirm({
      title: `Archive “${category.name}”?`,
      message: 'It disappears from quick add. Past entries keep their label, and you can restore it any time.',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    try {
      // Leaving it out of the list archives it server-side.
      await save.mutateAsync({ ...doc, [type]: doc[type].filter((c) => c.id !== category.id) });
      toast.success(`${category.name} archived`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t archive. Check your connection and try again.');
    }
  }

  return (
    <form className="space-y-5 pt-1" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="space-y-2">
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          value={name}
          maxLength={40}
          placeholder={type === 'expense' ? 'e.g. Pets…' : 'e.g. Rental income…'}
          name="name"
          autoComplete="off"
          data-autofocus={category ? undefined : true}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          className="h-11"
        />
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <label
              key={c}
              className="grid size-9 place-items-center rounded-full bg-(--c) ring-offset-2 ring-offset-background transition-transform hover:scale-110 has-[:checked]:ring-2 has-[:checked]:ring-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              style={{ '--c': c } as CSSProperties}
            >
              <input
                type="radio"
                name="colour"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
                className="sr-only"
                aria-label={c}
              />
              {color === c && <Check className={cn('size-4', inkOn(c))} aria-hidden="true" />}
            </label>
          ))}
          <label
            className="relative grid size-9 place-items-center rounded-full border border-dashed text-xs text-muted-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            title="Custom colour"
          >
            <span aria-hidden="true">+</span>
            <input
              id={ids.color}
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="absolute inset-0 opacity-0"
              aria-label="Custom colour"
            />
          </label>
        </div>
      </fieldset>

      {type === 'expense' && (
        <div className="space-y-2">
          <Label id={ids.group}>Budget group</Label>
          <Segmented
            fill
            aria-label="Budget group"
            value={group}
            onValueChange={setGroup}
            items={GROUPS.map((g) => ({ value: g.value, label: g.label }))}
          />
          <p className="text-xs text-muted-foreground">{GROUPS.find((g) => g.value === group)?.hint}</p>
        </div>
      )}

      {category && (
        <Button asChild variant="outline" className="w-full">
          <Link to={`/history?range=all&category=${encodeURIComponent(category.id)}`}>
            <ListFilter aria-hidden="true" /> View {type === 'income' ? 'Income' : 'Transactions'}
          </Link>
        </Button>
      )}
      <SheetFooter>
        {category && (
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => void onArchive()}
            disabled={save.isPending || activeCount <= 1}
            title={activeCount <= 1 ? 'Keep at least one' : undefined}
          >
            <Archive aria-hidden="true" /> Archive
          </Button>
        )}
        <Button type="submit" className={cn('press h-11 flex-1 text-base')} disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {category ? 'Save Changes' : type === 'expense' ? 'Add Category' : 'Add Source'}
        </Button>
      </SheetFooter>
    </form>
  );
}
