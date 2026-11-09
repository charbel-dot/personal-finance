import { monthlyEquivalent } from './recurring';
import type { BudgetGroup, BudgetRule, CategoriesDoc, Category, Recurring, Transaction } from './schema';

export type Targets = Record<BudgetGroup, number>;
export const RULE_TARGETS: Targets = { needs: 0.5, wants: 0.3, savings: 0.2 };

/** Whole-percent rule from settings → fractions. */
export function toTargets(rule: BudgetRule | undefined): Targets {
  return rule ? { needs: rule.needs / 100, wants: rule.wants / 100, savings: rule.savings / 100 } : RULE_TARGETS;
}
const AVG_DAYS_PER_MONTH = 30.44;

export interface Slice {
  id: string;
  name: string;
  color: string;
  value: number;
  share: number;
}

export interface Totals {
  income: number;
  expenses: number;
  net: number;
  /** (income - consumption spending) / income, where transfers into savings categories count as saved. */
  savingsRate: number;
}

export interface RuleBucket {
  group: BudgetGroup;
  amount: number;
  /** Share of income (0..∞). */
  pct: number;
  target: number;
}

export type Severity = 'high' | 'medium' | 'low' | 'positive';

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Larger = more important within the same severity. */
  weight: number;
}

export interface BudgetAnalysis {
  totals: Totals;
  expensesByCategory: Slice[];
  incomeBySource: Slice[];
  rule: RuleBucket[];
  suggestedSavingsPct: number;
  suggestedSavingsAmount: number;
  recurringMonthly: number;
  recurringPctOfIncome: number;
  insights: Insight[];
  tips: Insight[];
}

export interface AnalysisInput {
  current: Transaction[];
  previous: Transaction[];
  categories: CategoriesDoc;
  recurring: Recurring[];
  /** Length of the analysed period in days, used to normalise income to a month. */
  periodDays: number;
  /** Formats cents for human-readable messages. */
  format: (cents: number) => string;
  /** The user's budget rule (defaults to 50/30/20). */
  rule?: BudgetRule;
}

const sum = (items: Transaction[]) => items.reduce((acc, t) => acc + t.amount, 0);

function slices(items: Transaction[], categories: Category[], fallbackName: string): Slice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const t of items) totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount);
  const total = sum(items);
  return [...totals.entries()]
    .map(([id, value]) => {
      const cat = byId.get(id);
      return {
        id,
        name: cat?.name ?? fallbackName,
        color: cat?.color ?? '#94a3b8',
        value,
        share: total > 0 ? value / total : 0,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export function groupOf(categoryId: string, categories: CategoriesDoc): BudgetGroup {
  return categories.expense.find((c) => c.id === categoryId)?.group ?? 'wants';
}

export function computeTotals(items: Transaction[], categories: CategoriesDoc): Totals {
  const income = sum(items.filter((t) => t.type === 'income'));
  const expenseItems = items.filter((t) => t.type === 'expense');
  const expenses = sum(expenseItems);
  const savedViaCategories = sum(expenseItems.filter((t) => groupOf(t.categoryId, categories) === 'savings'));
  const saved = income - expenses + savedViaCategories;
  return { income, expenses, net: income - expenses, savingsRate: income > 0 ? saved / income : 0 };
}

const roundTo5 = (ratio: number, mode: 'up' | 'down') =>
  (mode === 'up' ? Math.ceil(ratio * 20 - 1e-9) : Math.floor(ratio * 20 + 1e-9)) / 20;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Savings target derived from how much income is already committed to needs:
 * - needs ≤ 50% → classic 20%, or a 5% stretch above an already-good rate (max 40%)
 * - needs > 50% → whatever is left after needs and a lean 25% for wants, never below 5%
 */
export function suggestSavingsPct(needsPct: number, currentSavingsRate: number, t: Targets = RULE_TARGETS): number {
  const lean = Math.max(0.1, 1 - t.needs - t.savings - 0.05); // a lean wants allowance when needs run high
  if (needsPct <= t.needs) {
    if (currentSavingsRate >= t.savings)
      return clamp(roundTo5(currentSavingsRate + 0.05, 'down'), t.savings, Math.max(0.4, t.savings));
    return t.savings;
  }
  return clamp(roundTo5(1 - needsPct - lean, 'down'), 0.05, t.savings);
}

export function analyzeBudget(input: AnalysisInput): BudgetAnalysis {
  const { current, previous, categories, recurring, periodDays, format } = input;
  const t = toTargets(input.rule);
  const totals = computeTotals(current, categories);
  const expenses = current.filter((t) => t.type === 'expense');
  const incomes = current.filter((t) => t.type === 'income');

  const groupAmount = (group: BudgetGroup) => sum(expenses.filter((t) => groupOf(t.categoryId, categories) === group));
  const needs = groupAmount('needs');
  const wants = groupAmount('wants');
  const savedAmount = Math.max(0, Math.round(totals.savingsRate * totals.income));
  const pct = (n: number) => (totals.income > 0 ? n / totals.income : 0);

  const rule: RuleBucket[] = [
    { group: 'needs', amount: needs, pct: pct(needs), target: t.needs },
    { group: 'wants', amount: wants, pct: pct(wants), target: t.wants },
    { group: 'savings', amount: savedAmount, pct: pct(savedAmount), target: t.savings },
  ];

  const suggestedSavingsPct = suggestSavingsPct(pct(needs), totals.savingsRate, t);
  // A calendar month (28–31 days) is already monthly; other ranges are normalised to an average month.
  const isMonth = periodDays >= 28 && periodDays <= 31;
  const monthlyIncome = isMonth
    ? totals.income
    : periodDays > 0
      ? (totals.income * AVG_DAYS_PER_MONTH) / periodDays
      : 0;
  const suggestedSavingsAmount = Math.round(monthlyIncome * suggestedSavingsPct);

  const recurringMonthly = recurring
    .filter((r) => !r.paused && r.type === 'expense')
    .reduce((acc, r) => acc + monthlyEquivalent(r.amount, r.frequency), 0);
  const recurringPctOfIncome = monthlyIncome > 0 ? recurringMonthly / monthlyIncome : 0;

  const expensesByCategory = slices(expenses, categories.expense, 'Uncategorized');
  const incomeBySource = slices(incomes, categories.income, 'Other');

  const insights: Insight[] = [];
  const hasIncome = totals.income > 0;

  if (!hasIncome && totals.expenses > 0) {
    insights.push({
      id: 'no-income',
      severity: 'medium',
      title: 'No income logged for this period',
      detail: 'Add your income so savings and the 50/30/20 split can be calculated.',
      weight: 1,
    });
  }

  if (hasIncome && totals.expenses > totals.income) {
    insights.push({
      id: 'overspending',
      severity: 'high',
      title: `Spending exceeds income by ${format(totals.expenses - totals.income)}`,
      detail: 'Pause a non-essential recurring cost or set a weekly cap on your largest “wants” category.',
      // Always the most important message when it applies.
      weight: 10 + (totals.expenses - totals.income) / totals.income,
    });
  }

  if (hasIncome && pct(needs) > t.needs) {
    insights.push({
      id: 'needs-high',
      severity: pct(needs) > 0.65 ? 'high' : 'medium',
      title: `Needs take ${Math.round(pct(needs) * 100)}% of income (target ${Math.round(t.needs * 100)}%)`,
      detail: 'Fixed costs are the biggest lever long-term: review housing, insurance and utility plans.',
      weight: pct(needs) - t.needs,
    });
  }

  if (hasIncome && pct(wants) > t.wants) {
    const over = wants - Math.round(totals.income * t.wants);
    insights.push({
      id: 'wants-high',
      severity: 'medium',
      title: `Wants are ${Math.round(pct(wants) * 100)}% of income (target ${Math.round(t.wants * 100)}%)`,
      detail: `Trimming ${format(over)} from wants this period gets you back to ${Math.round(t.wants * 100)}%.`,
      weight: pct(wants) - t.wants,
    });
  }

  if (hasIncome && totals.savingsRate < suggestedSavingsPct) {
    const gap = Math.round(totals.income * suggestedSavingsPct) - savedAmount;
    insights.push({
      id: 'savings-gap',
      severity: totals.savingsRate < 0.05 ? 'high' : 'low',
      title: `Aim to save ${Math.round(suggestedSavingsPct * 100)}% — about ${format(suggestedSavingsAmount)}/month`,
      detail: `You're saving ${Math.round(Math.max(0, totals.savingsRate) * 100)}% now. Move ${format(gap)} to savings right after payday so it's not spent.`,
      weight: suggestedSavingsPct - totals.savingsRate,
    });
  } else if (hasIncome && totals.savingsRate >= t.savings) {
    insights.push({
      id: 'savings-good',
      severity: 'positive',
      title: `You're saving ${Math.round(totals.savingsRate * 100)}% of income`,
      detail: `Nice. Stretch goal: ${Math.round(suggestedSavingsPct * 100)}% (${format(suggestedSavingsAmount)}/month).`,
      weight: totals.savingsRate,
    });
  }

  // Disproportionate categories: one bucket dominating spending (excluding savings transfers).
  for (const slice of expensesByCategory) {
    const group = groupOf(slice.id, categories);
    if (group === 'savings') continue;
    const threshold = group === 'needs' ? 0.45 : 0.25;
    if (slice.share >= threshold && expenses.length >= 3) {
      insights.push({
        id: `share-${slice.id}`,
        severity: group === 'wants' ? 'medium' : 'low',
        title: `${slice.name} is ${Math.round(slice.share * 100)}% of your spending`,
        detail:
          group === 'wants'
            ? `Setting a ${format(Math.round(slice.value * 0.8))} cap next period would free up ${format(Math.round(slice.value * 0.2))}.`
            : 'Worth checking whether this cost can be renegotiated or shared.',
        weight: slice.share - threshold,
      });
    }
  }

  // Period-over-period increases per category.
  const prevExpenses = previous.filter((t) => t.type === 'expense');
  const prevByCat = new Map<string, number>();
  for (const t of prevExpenses) prevByCat.set(t.categoryId, (prevByCat.get(t.categoryId) ?? 0) + t.amount);
  const minDelta = hasIncome ? Math.max(1000, Math.round(totals.income * 0.02)) : 2000;
  const increases = expensesByCategory
    .filter((s) => groupOf(s.id, categories) !== 'savings')
    .map((s) => ({ slice: s, prev: prevByCat.get(s.id) ?? 0 }))
    .filter(({ slice, prev }) => prev > 0 && slice.value >= prev * 1.25 && slice.value - prev >= minDelta)
    .sort((a, b) => b.slice.value - b.prev - (a.slice.value - a.prev));
  for (const { slice, prev } of increases.slice(0, 2)) {
    insights.push({
      id: `mom-${slice.id}`,
      severity: 'medium',
      title: `${slice.name} up ${Math.round((slice.value / prev - 1) * 100)}% vs. previous period`,
      detail: `${format(slice.value)} vs ${format(prev)}. Check for one-offs or a new habit creeping in.`,
      weight: (slice.value - prev) / Math.max(1, totals.income || slice.value),
    });
  }

  if (monthlyIncome > 0 && recurringPctOfIncome > 0.15) {
    insights.push({
      id: 'recurring-share',
      severity: recurringPctOfIncome > 0.35 ? 'high' : recurringPctOfIncome > 0.25 ? 'medium' : 'low',
      title: `Recurring costs are ${Math.round(recurringPctOfIncome * 100)}% of monthly income`,
      detail: `${format(recurringMonthly)}/month is committed before you spend anything. Audit subscriptions you haven't used in 30 days.`,
      weight: recurringPctOfIncome,
    });
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2, positive: 3 };
  insights.sort((a, b) => order[a.severity] - order[b.severity] || b.weight - a.weight);

  return {
    totals,
    expensesByCategory,
    incomeBySource,
    rule,
    suggestedSavingsPct,
    suggestedSavingsAmount,
    recurringMonthly,
    recurringPctOfIncome,
    insights,
    tips: insights.slice(0, 3),
  };
}
