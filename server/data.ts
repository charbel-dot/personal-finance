import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../shared/defaults';
import { addDays, monthOf, monthsInRange, startOfMonth, todayIn } from '../shared/dates';
import { generateDue } from '../shared/recurring';
import { bySavingsDateDesc, savingsBalance } from '../shared/savings';
import {
  categoriesDoc,
  monthFile,
  MAX_SAVINGS_ENTRIES,
  MAX_SAVINGS_GOALS,
  recurringDoc,
  savingsDoc,
  settings as settingsSchema,
  type Balance,
  type CategoriesDoc,
  type Recurring,
  type RecurringInput,
  type GoalInput,
  type SavingsDoc,
  type SavingsEntry,
  type SavingsGoal,
  type SavingsInput,
  type Settings,
  type SettingsPatch,
  type Transaction,
  type TransactionInput,
} from '../shared/schema';
import { randomId } from './crypto';
import { listKeys, readJson, updateJson } from './store';

export const KEYS = {
  month: (month: string) => `transactions/${month}.json`,
  recurring: 'recurring.json',
  categories: 'categories.json',
  settings: 'settings.json',
  savings: 'savings.json',
} as const;

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const emptyMonth = () => ({ items: [] as Transaction[] });
const emptyRecurring = () => ({ items: [] as Recurring[] });
const emptySavings = (): SavingsDoc => ({ items: [], goals: [] });
const nowIso = () => new Date().toISOString();
const byDateDesc = (a: Transaction, b: Transaction) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/* ----------------------------------------------------------------------------- settings */

export async function getSettings(bucket: R2Bucket): Promise<Settings> {
  return (await readJson(bucket, KEYS.settings, settingsSchema, () => ({ ...DEFAULT_SETTINGS }))).data;
}

export async function patchSettings(bucket: R2Bucket, patch: SettingsPatch): Promise<Settings> {
  const { data } = await updateJson(
    bucket,
    KEYS.settings,
    settingsSchema,
    () => ({ ...DEFAULT_SETTINGS }),
    (current) => {
      const next = { ...current, ...patch };
      return JSON.stringify(next) === JSON.stringify(current) ? undefined : { next, result: undefined };
    },
  );
  return data;
}

/* --------------------------------------------------------------------------- categories */

export async function getCategories(bucket: R2Bucket): Promise<CategoriesDoc> {
  return (await readJson(bucket, KEYS.categories, categoriesDoc, () => structuredClone(DEFAULT_CATEGORIES))).data;
}

export async function putCategories(bucket: R2Bucket, doc: CategoriesDoc): Promise<CategoriesDoc> {
  const { data } = await updateJson(
    bucket,
    KEYS.categories,
    categoriesDoc,
    () => structuredClone(DEFAULT_CATEGORIES),
    (current) => {
      // Categories are never hard-deleted (old transactions reference them); removed ones become archived.
      const keptIds = new Set([...doc.expense, ...doc.income].map((c) => c.id));
      const archive = (list: CategoriesDoc['expense']) =>
        list.filter((c) => !keptIds.has(c.id)).map((c) => ({ ...c, archived: true }));
      const next: CategoriesDoc = {
        expense: [...doc.expense, ...archive(current.expense)],
        income: [...doc.income, ...archive(current.income)],
      };
      if (next.expense.filter((c) => !c.archived).length === 0 || next.income.filter((c) => !c.archived).length === 0) {
        throw new ValidationError('Keep at least one expense category and one income source');
      }
      return { next, result: undefined };
    },
  );
  return data;
}

async function assertCategory(bucket: R2Bucket, type: 'income' | 'expense', categoryId: string) {
  const cats = await getCategories(bucket);
  if (!cats[type].some((c) => c.id === categoryId)) {
    throw new ValidationError(type === 'income' ? 'Unknown income source' : 'Unknown category');
  }
}

/* ------------------------------------------------------------------------- transactions */

export async function listTransactions(bucket: R2Bucket, from?: string, to?: string): Promise<Transaction[]> {
  let months: string[];
  if (from && to) {
    months = monthsInRange(from, to);
    if (months.length > 120) throw new ValidationError('Date range is too large (max 10 years)');
  } else {
    months = (await listKeys(bucket, 'transactions/'))
      .map((k) => /^transactions\/(\d{4}-\d{2})\.json$/.exec(k)?.[1])
      .filter((m): m is string => Boolean(m));
  }
  const files = await Promise.all(months.map((m) => readJson(bucket, KEYS.month(m), monthFile, emptyMonth)));
  return files
    .flatMap((f) => f.data.items)
    .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
    .sort(byDateDesc);
}

async function rememberCategory(bucket: R2Bucket, input: TransactionInput) {
  await patchSettings(
    bucket,
    input.type === 'income' ? { lastIncomeCategoryId: input.categoryId } : { lastExpenseCategoryId: input.categoryId },
  );
}

export async function createTransaction(bucket: R2Bucket, input: TransactionInput): Promise<Transaction> {
  await assertCategory(bucket, input.type, input.categoryId);
  const now = nowIso();
  const tx: Transaction = { ...input, id: randomId('t'), createdAt: now, updatedAt: now };
  await updateJson(bucket, KEYS.month(monthOf(tx.date)), monthFile, emptyMonth, (current) => ({
    next: { items: [...current.items, tx] },
    result: undefined,
  }));
  await rememberCategory(bucket, input);
  return tx;
}

export async function updateTransaction(
  bucket: R2Bucket,
  id: string,
  fromMonth: string,
  input: TransactionInput,
): Promise<Transaction> {
  await assertCategory(bucket, input.type, input.categoryId);
  const targetMonth = monthOf(input.date);

  if (targetMonth === fromMonth) {
    const { result } = await updateJson(bucket, KEYS.month(fromMonth), monthFile, emptyMonth, (current) => {
      const existing = current.items.find((t) => t.id === id);
      if (!existing) throw new NotFoundError('Transaction');
      const updated: Transaction = { ...existing, ...input, note: input.note, updatedAt: nowIso() };
      return { next: { items: current.items.map((t) => (t.id === id ? updated : t)) }, result: updated };
    });
    if (!result) throw new NotFoundError('Transaction');
    return result;
  }

  // Moving across months: read original, write to the new month first, then remove from the old one.
  const original = (await readJson(bucket, KEYS.month(fromMonth), monthFile, emptyMonth)).data.items.find(
    (t) => t.id === id,
  );
  if (!original) throw new NotFoundError('Transaction');
  const updated: Transaction = { ...original, ...input, note: input.note, updatedAt: nowIso() };
  await updateJson(bucket, KEYS.month(targetMonth), monthFile, emptyMonth, (current) => ({
    next: { items: [...current.items.filter((t) => t.id !== id), updated] },
    result: undefined,
  }));
  await updateJson(bucket, KEYS.month(fromMonth), monthFile, emptyMonth, (current) =>
    current.items.some((t) => t.id === id)
      ? { next: { items: current.items.filter((t) => t.id !== id) }, result: undefined }
      : undefined,
  );
  return updated;
}

export async function deleteTransaction(bucket: R2Bucket, id: string, month: string): Promise<void> {
  const { changed } = await updateJson(bucket, KEYS.month(month), monthFile, emptyMonth, (current) =>
    current.items.some((t) => t.id === id)
      ? { next: { items: current.items.filter((t) => t.id !== id) }, result: undefined }
      : undefined,
  );
  if (!changed) throw new NotFoundError('Transaction');
}

export async function getBalance(bucket: R2Bucket): Promise<Balance> {
  const [items, settings] = await Promise.all([listTransactions(bucket), getSettings(bucket)]);
  let income = 0;
  let expenses = 0;
  for (const t of items) {
    if (t.type === 'income') income += t.amount;
    else expenses += t.amount;
  }
  return { income, expenses, balance: settings.openingBalance + income - expenses };
}

/* ---------------------------------------------------------------------------- recurring */

export async function getRecurring(bucket: R2Bucket): Promise<Recurring[]> {
  return (await readJson(bucket, KEYS.recurring, recurringDoc, emptyRecurring)).data.items;
}

/**
 * Occurrences before the current month are not back-filled when a rule is created or
 * re-dated, so adding "Rent since 2019" doesn't flood the history.
 */
export function initialCursor(startDate: string, today: string): string | undefined {
  const monthStart = startOfMonth(today);
  return startDate < monthStart ? addDays(monthStart, -1) : undefined;
}

async function todayFor(bucket: R2Bucket): Promise<string> {
  return todayIn((await getSettings(bucket)).timezone);
}

export async function createRecurring(bucket: R2Bucket, input: RecurringInput): Promise<Recurring> {
  await assertCategory(bucket, input.type, input.categoryId);
  const today = await todayFor(bucket);
  const now = nowIso();
  const rule: Recurring = {
    ...input,
    id: randomId('r'),
    lastGeneratedDate: input.paused ? addDays(today, -1) : initialCursor(input.startDate, today),
    createdAt: now,
    updatedAt: now,
  };
  if (rule.lastGeneratedDate === undefined) delete rule.lastGeneratedDate;
  await updateJson(bucket, KEYS.recurring, recurringDoc, emptyRecurring, (current) => {
    if (current.items.length >= 500) throw new ValidationError('Too many recurring expenses');
    return { next: { items: [...current.items, rule] }, result: undefined };
  });
  return rule;
}

export async function updateRecurring(bucket: R2Bucket, id: string, input: RecurringInput): Promise<Recurring> {
  await assertCategory(bucket, input.type, input.categoryId);
  const today = await todayFor(bucket);
  const { result } = await updateJson(bucket, KEYS.recurring, recurringDoc, emptyRecurring, (current) => {
    const existing = current.items.find((r) => r.id === id);
    if (!existing) throw new NotFoundError('Recurring expense');
    let cursor = existing.lastGeneratedDate;
    if (input.startDate !== existing.startDate || input.frequency !== existing.frequency) {
      cursor = cursor ?? initialCursor(input.startDate, today);
    }
    if (existing.paused && !input.paused) {
      // Resuming: never back-fill the paused period, but still allow an occurrence due today.
      const yesterday = addDays(today, -1);
      cursor = cursor && cursor > yesterday ? cursor : yesterday;
    }
    const updated: Recurring = { ...existing, ...input, note: input.note, updatedAt: nowIso() };
    if (cursor) updated.lastGeneratedDate = cursor;
    else delete updated.lastGeneratedDate;
    return { next: { items: current.items.map((r) => (r.id === id ? updated : r)) }, result: updated };
  });
  if (!result) throw new NotFoundError('Recurring expense');
  return result;
}

export async function deleteRecurring(bucket: R2Bucket, id: string): Promise<void> {
  const { changed } = await updateJson(bucket, KEYS.recurring, recurringDoc, emptyRecurring, (current) =>
    current.items.some((r) => r.id === id)
      ? { next: { items: current.items.filter((r) => r.id !== id) }, result: undefined }
      : undefined,
  );
  if (!changed) throw new NotFoundError('Recurring expense');
}

/**
 * Generates every due recurring entry up to today (in the user's timezone). Idempotent:
 * transaction ids are deterministic, so a crash between steps or a concurrent cron run
 * can never create duplicates.
 */
export async function reconcileRecurring(
  bucket: R2Bucket,
  now = new Date(),
): Promise<{ generated: number; today: string; rules: Recurring[] }> {
  const [settings, rules] = await Promise.all([getSettings(bucket), getRecurring(bucket)]);
  const today = todayIn(settings.timezone, now);
  const { transactions, rules: advanced } = generateDue(rules, today, now.toISOString());
  const changedRules = advanced.filter((r, i) => r !== rules[i]);
  if (changedRules.length === 0) return { generated: 0, today, rules };

  const byMonth = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const month = monthOf(t.date);
    byMonth.set(month, [...(byMonth.get(month) ?? []), t]);
  }

  // Each month is its own object, so the writes are independent and run in parallel.
  const counts = await Promise.all(
    [...byMonth].map(async ([month, items]) => {
      const { result } = await updateJson(bucket, KEYS.month(month), monthFile, emptyMonth, (current) => {
        const existing = new Set(current.items.map((t) => t.id));
        const fresh = items.filter((t) => !existing.has(t.id));
        return fresh.length ? { next: { items: [...current.items, ...fresh] }, result: fresh.length } : undefined;
      });
      return result ?? 0;
    }),
  );
  const generated = counts.reduce((a, b) => a + b, 0);

  const cursors = new Map(changedRules.map((r) => [r.id, r.lastGeneratedDate]));
  const { data: finalDoc } = await updateJson(bucket, KEYS.recurring, recurringDoc, emptyRecurring, (current) => {
    const items = current.items.map((r) => {
      const cursor = cursors.get(r.id);
      if (!cursor || (r.lastGeneratedDate && r.lastGeneratedDate >= cursor)) return r;
      return { ...r, lastGeneratedDate: cursor };
    });
    const changed = items.some((r, i) => r !== current.items[i]);
    return changed ? { next: { items }, result: undefined } : undefined;
  });

  return { generated, today, rules: finalDoc.items };
}

/* ------------------------------------------------------------------------------ savings */

export async function listSavings(bucket: R2Bucket): Promise<SavingsDoc> {
  const { data } = await readJson(bucket, KEYS.savings, savingsDoc, emptySavings);
  return { items: [...data.items].sort(bySavingsDateDesc), goals: data.goals };
}

/** The savings balance, overall and per goal, may never go below zero. */
function assertConsistent(doc: SavingsDoc) {
  if (savingsBalance(doc.items) < 0) throw new ValidationError('You can’t withdraw more than you have saved');
  for (const goal of doc.goals) {
    if (savingsBalance(doc.items.filter((e) => e.goalId === goal.id)) < 0) {
      throw new ValidationError(`You can’t withdraw more than is saved for ${goal.name}`);
    }
  }
}

function assertGoal(doc: SavingsDoc, goalId: string | undefined) {
  if (goalId && !doc.goals.some((g) => g.id === goalId)) throw new ValidationError('Unknown savings goal');
}

export async function createSavings(bucket: R2Bucket, input: SavingsInput): Promise<SavingsEntry> {
  await assertCategory(bucket, 'income', input.sourceId);
  const now = nowIso();
  const entry: SavingsEntry = { ...input, id: randomId('s'), createdAt: now, updatedAt: now };
  if (!entry.goalId) delete entry.goalId;
  await updateJson(bucket, KEYS.savings, savingsDoc, emptySavings, (current) => {
    if (current.items.length >= MAX_SAVINGS_ENTRIES) throw new ValidationError('Too many savings entries');
    assertGoal(current, entry.goalId);
    const next = { ...current, items: [...current.items, entry] };
    assertConsistent(next);
    return { next, result: undefined };
  });
  return entry;
}

export async function updateSavings(bucket: R2Bucket, id: string, input: SavingsInput): Promise<SavingsEntry> {
  await assertCategory(bucket, 'income', input.sourceId);
  const { result } = await updateJson(bucket, KEYS.savings, savingsDoc, emptySavings, (current) => {
    const existing = current.items.find((e) => e.id === id);
    if (!existing) throw new NotFoundError('Savings entry');
    assertGoal(current, input.goalId);
    const updated: SavingsEntry = { ...existing, ...input, note: input.note, updatedAt: nowIso() };
    if (!input.goalId) delete updated.goalId;
    const next = { ...current, items: current.items.map((e) => (e.id === id ? updated : e)) };
    assertConsistent(next);
    return { next, result: updated };
  });
  if (!result) throw new NotFoundError('Savings entry');
  return result;
}

export async function deleteSavings(bucket: R2Bucket, id: string): Promise<void> {
  const { changed } = await updateJson(bucket, KEYS.savings, savingsDoc, emptySavings, (current) => {
    if (!current.items.some((e) => e.id === id)) return undefined;
    const next = { ...current, items: current.items.filter((e) => e.id !== id) };
    assertConsistent(next);
    return { next, result: undefined };
  });
  if (!changed) throw new NotFoundError('Savings entry');
}

export async function createGoal(bucket: R2Bucket, input: GoalInput): Promise<SavingsGoal> {
  const now = nowIso();
  const goal: SavingsGoal = { ...input, id: randomId('g'), createdAt: now, updatedAt: now };
  if (!goal.targetDate) delete goal.targetDate;
  await updateJson(bucket, KEYS.savings, savingsDoc, emptySavings, (current) => {
    if (current.goals.length >= MAX_SAVINGS_GOALS) throw new ValidationError('Too many savings goals');
    return { next: { ...current, goals: [...current.goals, goal] }, result: undefined };
  });
  return goal;
}

export async function updateGoal(bucket: R2Bucket, id: string, input: GoalInput): Promise<SavingsGoal> {
  const { result } = await updateJson(bucket, KEYS.savings, savingsDoc, emptySavings, (current) => {
    const existing = current.goals.find((g) => g.id === id);
    if (!existing) throw new NotFoundError('Savings goal');
    const updated: SavingsGoal = { ...existing, ...input, updatedAt: nowIso() };
    if (!input.targetDate) delete updated.targetDate;
    return { next: { ...current, goals: current.goals.map((g) => (g.id === id ? updated : g)) }, result: updated };
  });
  if (!result) throw new NotFoundError('Savings goal');
  return result;
}

/** Deletes a goal. Its entries stay in your savings, just no longer tagged with the goal. */
export async function deleteGoal(bucket: R2Bucket, id: string): Promise<void> {
  const { changed } = await updateJson(bucket, KEYS.savings, savingsDoc, emptySavings, (current) => {
    if (!current.goals.some((g) => g.id === id)) return undefined;
    const items = current.items.map((e) => {
      if (e.goalId !== id) return e;
      const untagged = { ...e };
      delete untagged.goalId;
      return untagged;
    });
    return { next: { items, goals: current.goals.filter((g) => g.id !== id) }, result: undefined };
  });
  if (!changed) throw new NotFoundError('Savings goal');
}
