import { ChevronRight, LogOut, Monitor, Moon, PlayCircle, Sun } from 'lucide-react';
import { Link } from 'react-router';
import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CURRENCIES, MAX_USD_RATE, convertCents, parseAmountIn, type Currency } from '../../shared/money';
import { MoneyInput } from '@/components/MoneyField';
import { BudgetRuleCard } from '@/components/BudgetRuleCard';
import { Page, PageHeader } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/Segmented';
import { useMoneyField } from '@/hooks/use-money-field';
import { useSignOut } from '@/hooks/use-sign-out';
import { formatRate, useCurrency } from '@/lib/format';
import { useAppData, usePatchSettings } from '@/lib/queries';
import { useTheme, type ThemePref } from '@/lib/theme';

const rateFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** Lebanese pounds are always written as the plain code "LBP". */
const CURRENCY_LABEL: Record<Currency, string> = { USD: 'USD · $', LBP: 'LBP' };

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
  const { ledger, display, rate } = useCurrency();
  const opening = useMoneyField(settings.openingBalance);
  const [rateText, setRateText] = useState(() => rateFmt.format(rate));
  const ids = { rate: useId(), opening: useId(), openingHint: useId() };
  const second: Currency = display === 'USD' ? 'LBP' : 'USD';

  async function update(p: Parameters<typeof patch.mutateAsync>[0], message: string) {
    try {
      await patch.mutateAsync(p);
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save. Check your connection and try again.');
    }
  }

  function saveRate() {
    const next = Number(rateText.replace(/[^\d]/g, ''));
    if (!Number.isInteger(next) || next < 1 || next > MAX_USD_RATE) {
      toast.error('Enter how many Lebanese pounds one US dollar buys, like 89,500');
      setRateText(rateFmt.format(rate));
      return;
    }
    setRateText(rateFmt.format(next));
    if (next !== rate) void update({ usdRate: next }, `Rate set to ${formatRate(next)}`);
  }

  function saveOpening() {
    if (!opening.dirty) return;
    const negative = opening.value.trim().startsWith('-');
    const digits = opening.value.replace(/-/g, '').trim();
    let cents = 0;
    if (digits && !/^[0.,]+$/.test(digits)) {
      const typed = parseAmountIn(digits, opening.currency);
      if (typed === null) {
        toast.error('Enter a valid opening balance, like 1250.00');
        return;
      }
      cents = convertCents(typed, opening.currency, ledger, rate) * (negative ? -1 : 1);
    }
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
              <Segmented
                fill
                aria-label="Appearance"
                value={theme}
                onValueChange={setTheme}
                items={THEMES.map(({ value, label, icon: Icon }) => ({
                  value,
                  label: (
                    <span className="flex items-center gap-1.5">
                      <Icon className="size-4" aria-hidden="true" /> {label}
                    </span>
                  ),
                }))}
              />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Currencies</CardTitle>
            <CardDescription>
              Type any amount in USD or LBP. Totals show in your main currency, converted at your rate.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <Row label="Main currency" hint={`Your second currency, ${second}, is shown under key totals.`}>
              <Segmented
                fill
                aria-label="Main currency"
                value={display}
                onValueChange={(v) => void update({ displayCurrency: v }, `Main currency set to ${v}`)}
                items={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABEL[c] }))}
              />
            </Row>
            <Row
              label="Exchange rate"
              hint="Lebanese pounds for one US dollar. Update it when the rate moves."
              htmlFor={ids.rate}
            >
              <div className="flex h-10 items-center gap-2 rounded-md border px-3 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
                <span className="shrink-0 text-sm text-muted-foreground">1 USD =</span>
                <input
                  id={ids.rate}
                  name="usdRate"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={rateText}
                  onChange={(e) => setRateText(e.target.value.replace(/[^\d,.\s]/g, ''))}
                  onBlur={saveRate}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className="tabular h-full w-full min-w-0 bg-transparent text-right text-base outline-none md:text-sm"
                />
                <span className="shrink-0 text-sm text-muted-foreground">LBP</span>
              </div>
            </Row>
            <Row label="Opening balance" hint="Money you had before you started tracking." htmlFor={ids.opening}>
              <MoneyInput
                id={ids.opening}
                hintId={ids.openingHint}
                name="openingBalance"
                field={opening}
                allowNegative
                onBlur={saveOpening}
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
            <CardTitle className="text-base">Walkthrough</CardTitle>
            <CardDescription>A one-minute tour of the main screens and how to add a transaction.</CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link to="/?tour">
                  <PlayCircle aria-hidden="true" /> Replay Tour
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
