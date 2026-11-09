import { ChevronRight, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { Link } from 'react-router';
import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CURRENCIES, centsToInput } from '../../shared/money';
import { BudgetRuleCard } from '@/components/BudgetRuleCard';
import { Page, PageHeader } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useSignOut } from '@/hooks/use-sign-out';
import { currencySymbol } from '@/lib/format';
import { useAppData, usePatchSettings } from '@/lib/queries';
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
      toast.error(err instanceof Error ? err.message : 'Couldn’t save. Check your connection and try again.');
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
                name="openingBalance"
                autoComplete="off"
                placeholder="0.00"
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

        <BudgetRuleCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Categories</CardTitle>
            <CardDescription>Expense categories, budget groups and income sources.</CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link to="/categories">
                  Manage <ChevronRight aria-hidden="true" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
        </Card>

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
