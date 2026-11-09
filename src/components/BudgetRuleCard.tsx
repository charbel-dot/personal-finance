import { Loader2, RotateCcw } from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { DEFAULT_BUDGET_RULE, type BudgetGroup, type BudgetRule } from '../../shared/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppData, usePatchSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';

const GROUPS: { key: BudgetGroup; label: string; hint: string; color: string }[] = [
  { key: 'needs', label: 'Needs', hint: 'Rent, groceries, bills', color: 'var(--chart-3)' },
  { key: 'wants', label: 'Wants', hint: 'Eating out, shopping, fun', color: 'var(--expense)' },
  { key: 'savings', label: 'Savings', hint: 'Set aside or invested', color: 'var(--income)' },
];

const PRESETS: BudgetRule[] = [
  { needs: 50, wants: 30, savings: 20 },
  { needs: 60, wants: 20, savings: 20 },
  { needs: 70, wants: 20, savings: 10 },
  { needs: 40, wants: 30, savings: 30 },
];

const label = (r: BudgetRule) => `${r.needs}/${r.wants}/${r.savings}`;
const same = (a: BudgetRule, b: BudgetRule) => a.needs === b.needs && a.wants === b.wants && a.savings === b.savings;

/** Edit the budget rule (whole percentages that must total 100) and the auto-split switch. */
export function BudgetRuleCard() {
  const { settings } = useAppData();
  const patch = usePatchSettings();
  const switchId = useId();
  const [draft, setDraft] = useState<Record<BudgetGroup, string>>(() => ({
    needs: String(settings.budgetRule.needs),
    wants: String(settings.budgetRule.wants),
    savings: String(settings.budgetRule.savings),
  }));

  const values: BudgetRule = {
    needs: Number(draft.needs) || 0,
    wants: Number(draft.wants) || 0,
    savings: Number(draft.savings) || 0,
  };
  const total = values.needs + values.wants + values.savings;
  const valid = total === 100 && Object.values(draft).every((v) => /^\d{1,3}$/.test(v));
  const dirty = !same(values, settings.budgetRule);

  const setRule = (r: BudgetRule) =>
    setDraft({ needs: String(r.needs), wants: String(r.wants), savings: String(r.savings) });

  async function save() {
    try {
      await patch.mutateAsync({ budgetRule: values });
      toast.success(`Budget rule set to ${label(values)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save. Check your connection and try again.');
    }
  }

  async function toggleAutoSplit(on: boolean) {
    try {
      await patch.mutateAsync({ autoSplit: on });
      toast.success(on ? 'Income will be split automatically' : 'Auto-split turned off');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save. Check your connection and try again.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Budget Rule</CardTitle>
        <CardDescription>How every income is divided between needs, wants and savings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div>
            <Label htmlFor={switchId} className="text-sm font-medium">
              Auto-split income
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Each income is mapped into {label(settings.budgetRule)} buckets, and the dashboard shows how much is left
              in each.
            </p>
          </div>
          <Switch
            id={switchId}
            checked={settings.autoSplit}
            disabled={patch.isPending}
            onCheckedChange={(on) => void toggleAutoSplit(on)}
          />
        </div>

        {/* Live proportion bar */}
        <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {GROUPS.map((g) => (
            <div
              key={g.key}
              className="h-full bg-(--c) transition-[width] duration-500 ease-out"
              style={
                {
                  width: `${Math.min(100, (values[g.key] / Math.max(total, 100)) * 100)}%`,
                  '--c': g.color,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.key} className="space-y-1.5">
              <Label htmlFor={`rule-${g.key}`} className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-(--c)" style={{ '--c': g.color } as CSSProperties} />
                {g.label}
              </Label>
              <div className="relative">
                <Input
                  id={`rule-${g.key}`}
                  name={`rule-${g.key}`}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={3}
                  value={draft[g.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [g.key]: e.target.value.replace(/\D/g, '') }))}
                  className="tabular h-10 pr-8"
                  aria-describedby="rule-total"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{g.hint}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Presets:</span>
          {PRESETS.map((r) => (
            <Button
              key={label(r)}
              type="button"
              variant={same(values, r) ? 'secondary' : 'outline'}
              size="sm"
              className="tabular"
              onClick={() => setRule(r)}
              aria-pressed={same(values, r)}
            >
              {label(r)}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p
            id="rule-total"
            className={cn('text-sm font-medium', total === 100 ? 'text-income' : 'text-destructive')}
            aria-live="polite"
          >
            {total === 100 ? 'Total 100%' : `Total ${total}%: adjust so it adds up to 100%`}
          </p>
          <div className="flex gap-2">
            {!same(values, DEFAULT_BUDGET_RULE) && (
              <Button type="button" variant="ghost" onClick={() => setRule(DEFAULT_BUDGET_RULE)}>
                <RotateCcw aria-hidden="true" /> Reset to 50/30/20
              </Button>
            )}
            <Button type="button" disabled={!valid || !dirty || patch.isPending} onClick={() => void save()}>
              {patch.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Save Rule
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
