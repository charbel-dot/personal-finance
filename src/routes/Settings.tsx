import { Loader2, LogOut, Monitor, Moon, Plus, Sun, Trash2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CATEGORY_COLORS } from '../../shared/defaults';
import { CURRENCIES, centsToInput } from '../../shared/money';
import type { BudgetGroup, CategoriesDoc, Category } from '../../shared/schema';
import { Page, PageHeader } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useSignOut } from '@/hooks/use-sign-out';
import { currencySymbol } from '@/lib/format';
import { useAppData, usePatchSettings, useSaveCategories } from '@/lib/queries';
import { useTheme, type ThemePref } from '@/lib/theme';

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** Label column on the left on wide screens, stacked above its control on phones. */
function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center sm:gap-6">
      <div>
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function Settings() {
  const { settings } = useAppData();
  const patch = usePatchSettings();
  const signOut = useSignOut();
  const [theme, setTheme] = useTheme();
  const [opening, setOpening] = useState(() => centsToInput(settings.openingBalance));
  const ids = { currency: useId(), opening: useId() };

  async function update(p: Parameters<typeof patch.mutateAsync>[0], message: string) {
    try {
      await patch.mutateAsync(p);
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
  }

  function saveOpening() {
    const trimmed = opening.trim().replace(',', '.') || '0';
    if (!/^-?\d+(\.\d{0,2})?$/.test(trimmed)) {
      toast.error('Enter a valid opening balance, like 1250.00');
      return;
    }
    const cents = Math.round(Number(trimmed) * 100);
    if (cents !== settings.openingBalance) void update({ openingBalance: cents }, 'Opening balance saved');
  }

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Preferences, categories and your account." />
      <div className="stagger mx-auto max-w-3xl space-y-4 lg:mx-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferences</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <Row label="Appearance" hint="Saved on this device.">
              <ToggleGroup
                type="single"
                variant="outline"
                value={theme}
                onValueChange={(v) => {
                  if (v) setTheme(v as ThemePref);
                }}
                aria-label="Appearance"
                className="w-full"
              >
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <ToggleGroupItem key={value} value={value} className="h-10 flex-1 gap-1.5">
                    <Icon aria-hidden="true" /> {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Row>
            <Row label="Currency" htmlFor={ids.currency}>
              <Select
                value={settings.currency}
                onValueChange={(v) => void update({ currency: v }, `Currency set to ${v}`)}
              >
                <SelectTrigger id={ids.currency} className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c} · {currencySymbol(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Opening balance" hint="Money you had before you started tracking." htmlFor={ids.opening}>
              <Input
                id={ids.opening}
                className="tabular h-10"
                inputMode="decimal"
                value={opening}
                onChange={(e) => setOpening(e.target.value.replace(/[^\d.,-]/g, ''))}
                onBlur={saveOpening}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </Row>
          </CardContent>
        </Card>

        <CategoryEditor />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>
              Recurring entries are generated in your timezone:{' '}
              <span className="text-foreground">{settings.timezone}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void signOut()}>
              <LogOut aria-hidden="true" /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </Page>
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

const visible = (doc: CategoriesDoc): CategoriesDoc => ({
  expense: doc.expense.filter((c) => !c.archived),
  income: doc.income.filter((c) => !c.archived),
});

function CategoryEditor() {
  const { categories } = useAppData();
  const save = useSaveCategories();
  const [tab, setTab] = useState<'expense' | 'income'>('expense');
  const [draft, setDraft] = useState<CategoriesDoc>(() => visible(categories));
  const [newName, setNewName] = useState('');

  const list = draft[tab];
  const dirty = JSON.stringify(draft) !== JSON.stringify(visible(categories));
  const invalid = [...draft.expense, ...draft.income].some((c) => !c.name.trim());

  const setItem = (id: string, patch: Partial<Category>) =>
    setDraft((d) => ({ ...d, [tab]: d[tab].map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  function add() {
    const name = newName.trim();
    if (!name) return;
    const taken = new Set(
      [...categories.expense, ...categories.income, ...draft.expense, ...draft.income].map((c) => c.id),
    );
    const item: Category = {
      id: slug(name, taken),
      name: name.slice(0, 40),
      color: CATEGORY_COLORS[list.length % CATEGORY_COLORS.length],
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
      setDraft(visible(saved));
      toast.success('Categories saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Categories {dirty && <Badge variant="secondary">Unsaved</Badge>}
        </CardTitle>
        <CardDescription>
          Need, Want and Savings drive the 50/30/20 check. Removed categories are archived so past entries keep their
          label.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'expense' | 'income')}>
          <TabsList className="grid h-10 w-full grid-cols-2">
            <TabsTrigger value="expense">Expense categories</TabsTrigger>
            <TabsTrigger value="income">Income sources</TabsTrigger>
          </TabsList>
        </Tabs>

        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <label className="relative size-10 shrink-0 cursor-pointer rounded-md border p-1.5 focus-within:ring-[3px] focus-within:ring-ring/50">
                <span className="sr-only">Colour for {c.name || 'category'}</span>
                <span className="block size-full rounded-sm" style={{ background: c.color }} aria-hidden="true" />
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) => setItem(c.id, { color: e.target.value })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <Input
                aria-label="Name"
                value={c.name}
                maxLength={40}
                aria-invalid={!c.name.trim()}
                onChange={(e) => setItem(c.id, { name: e.target.value })}
                className="h-10 min-w-0 flex-1"
              />
              {tab === 'expense' && (
                <Select value={c.group ?? 'wants'} onValueChange={(v) => setItem(c.id, { group: v as BudgetGroup })}>
                  <SelectTrigger aria-label={`Budget group for ${c.name}`} className="h-10 w-24 shrink-0 sm:w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUPS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${c.name}`}
                disabled={list.length <= 1}
                onClick={() => setDraft((d) => ({ ...d, [tab]: d[tab].filter((x) => x.id !== c.id) }))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            aria-label={tab === 'expense' ? 'New category name' : 'New income source name'}
            placeholder={tab === 'expense' ? 'New category' : 'New income source'}
            maxLength={40}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-10"
          />
          <Button type="submit" variant="outline" className="h-10" disabled={!newName.trim()}>
            <Plus aria-hidden="true" /> Add
          </Button>
        </form>

        <div className="flex justify-end gap-2 border-t pt-4">
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(visible(categories))}>
              Discard
            </Button>
          )}
          <Button disabled={!dirty || invalid || save.isPending} onClick={() => void onSave()}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Save categories
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
