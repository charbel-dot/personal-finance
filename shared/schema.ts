import { z } from 'zod';

/** ISO calendar date, e.g. 2026-11-09. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Invalid date')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'Invalid date');

/** Month key, e.g. 2026-11. */
export const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month');

export const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid id');

/** Amounts are stored as integer minor units (cents). Max 1 billion major units. */
export const amountCents = z
  .number()
  .int('Amount must be in cents')
  .positive('Amount must be greater than zero')
  .max(100_000_000_000, 'Amount is too large');

const note = z.string().trim().max(280, 'Note is too long').optional();

export const transactionType = z.enum(['income', 'expense']);
export type TransactionType = z.infer<typeof transactionType>;

export const transactionInput = z.object({
  type: transactionType,
  amount: amountCents,
  categoryId: id,
  date: isoDate,
  note,
});
export type TransactionInput = z.infer<typeof transactionInput>;

export const transaction = transactionInput.extend({
  id,
  recurringId: id.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Transaction = z.infer<typeof transaction>;

export const monthFile = z.object({
  items: z.array(transaction),
});
export type MonthFile = z.infer<typeof monthFile>;

/** 50/30/20 bucket that an expense category counts towards. */
export const budgetGroup = z.enum(['needs', 'wants', 'savings']);
export type BudgetGroup = z.infer<typeof budgetGroup>;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color');

export const category = z.object({
  id,
  name: z.string().trim().min(1, 'Name is required').max(40, 'Name is too long'),
  color: hexColor,
  /** Only meaningful for expense categories. */
  group: budgetGroup.optional(),
  archived: z.boolean().optional(),
});
export type Category = z.infer<typeof category>;

export const categoriesDoc = z
  .object({
    expense: z.array(category).max(100),
    income: z.array(category).max(100),
  })
  .refine(
    (doc) => {
      const ids = [...doc.expense, ...doc.income].map((c) => c.id);
      return new Set(ids).size === ids.length;
    },
    { message: 'Category ids must be unique' },
  );
export type CategoriesDoc = z.infer<typeof categoriesDoc>;

export const frequency = z.enum(['weekly', 'monthly', 'yearly']);
export type Frequency = z.infer<typeof frequency>;

export const recurringInput = z.object({
  /** Recurring income (e.g. salary) or a recurring expense. Older rules without it are expenses. */
  type: transactionType.default('expense'),
  name: z.string().trim().min(1, 'Name is required').max(60, 'Name is too long'),
  amount: amountCents,
  categoryId: id,
  frequency,
  startDate: isoDate,
  note,
  paused: z.boolean().default(false),
});
export type RecurringInput = z.infer<typeof recurringInput>;

export const recurring = recurringInput.extend({
  id,
  /** Last occurrence date that has been turned into a transaction (or skipped while paused). */
  lastGeneratedDate: isoDate.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Recurring = z.infer<typeof recurring>;

export const recurringDoc = z.object({ items: z.array(recurring).max(500) });
export type RecurringDoc = z.infer<typeof recurringDoc>;

/** Money put into savings (deposit) or taken back out (withdrawal). */
export const savingsKind = z.enum(['deposit', 'withdrawal']);
export type SavingsKind = z.infer<typeof savingsKind>;

export const savingsInput = z.object({
  kind: savingsKind,
  amount: amountCents,
  /** Income source the money came from (deposits) or is attributed to (withdrawals). */
  sourceId: id,
  /** Optional savings goal this money goes towards (or comes out of). */
  goalId: id.optional(),
  date: isoDate,
  note,
});
export type SavingsInput = z.infer<typeof savingsInput>;

export const savingsEntry = savingsInput.extend({
  id,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavingsEntry = z.infer<typeof savingsEntry>;

export const goalInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40, 'Name is too long'),
  target: amountCents,
  /** Optional date to reach the target by. */
  targetDate: isoDate.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color'),
});
export type GoalInput = z.infer<typeof goalInput>;

export const savingsGoal = goalInput.extend({
  id,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavingsGoal = z.infer<typeof savingsGoal>;

export const MAX_SAVINGS_ENTRIES = 5000;
export const MAX_SAVINGS_GOALS = 50;
export const savingsDoc = z.object({
  items: z.array(savingsEntry).max(MAX_SAVINGS_ENTRIES),
  /** Added in 1.2.0; older savings.json files have none. */
  goals: z.array(savingsGoal).max(MAX_SAVINGS_GOALS).default([]),
});
export type SavingsDoc = z.infer<typeof savingsDoc>;

export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'Invalid currency');

const percent = z.number().int('Use whole percentages').min(0).max(100);

/** How income is split between needs, wants and savings, in whole percent (must total 100). */
export const budgetRule = z
  .object({ needs: percent, wants: percent, savings: percent })
  .refine((r) => r.needs + r.wants + r.savings === 100, { message: 'Needs, wants and savings must add up to 100%' });
export type BudgetRule = z.infer<typeof budgetRule>;
export const DEFAULT_BUDGET_RULE: BudgetRule = { needs: 50, wants: 30, savings: 20 };

const settingsBase = z.object({
  currency: currencyCode,
  /** IANA timezone used to decide what "today" is for recurring generation. */
  timezone: z.string().min(1).max(64),
  /** Starting balance (cents, may be negative) added to the all-time balance. */
  openingBalance: z.number().int().min(-100_000_000_000).max(100_000_000_000),
  lastExpenseCategoryId: id.optional(),
  lastIncomeCategoryId: id.optional(),
  budgetRule,
  /** Split every income into the budget rule's buckets and track what is left in each. */
  autoSplit: z.boolean(),
  /** The first-run walkthrough has been finished or skipped. */
  tourDone: z.boolean(),
});

/** Stored settings. Fields added later get defaults so older settings.json files still load. */
export const settings = settingsBase.extend({
  budgetRule: budgetRule.default(DEFAULT_BUDGET_RULE),
  autoSplit: z.boolean().default(true),
  tourDone: z.boolean().default(false),
});
export type Settings = z.infer<typeof settings>;

/** Partial update: no defaults here, so omitted fields are never reset. */
export const settingsPatch = settingsBase.partial();
export type SettingsPatch = z.infer<typeof settingsPatch>;

export const loginInput = z.object({
  username: z.string().trim().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(200),
  remember: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginInput>;

/* ---------------------------------------------------------------------------- users */

export const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Usernames need at least 3 characters')
  .max(32, 'Usernames can be at most 32 characters')
  .regex(/^[a-z0-9._-]+$/, 'Use letters, numbers, dots, dashes or underscores');

export const newPassword = z
  .string()
  .min(8, 'Passwords need at least 8 characters')
  .max(200, 'Passwords can be at most 200 characters');

export const newUserInput = z.object({ username, password: newPassword });
export type NewUserInput = z.infer<typeof newUserInput>;

export const passwordReset = z.object({ password: newPassword });
export type PasswordReset = z.infer<typeof passwordReset>;

export const passwordChange = z.object({
  current: z.string().min(1, 'Enter your current password').max(200),
  next: newPassword,
});
export type PasswordChange = z.infer<typeof passwordChange>;

export type Role = 'owner' | 'member';

/** A user as the owner's People list shows it (never includes the password hash). */
export interface UserSummary {
  id: string;
  username: string;
  createdAt: string;
}

export const rangeQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((q) => q.from <= q.to, { message: '"from" must be before "to"' });

export interface Bootstrap {
  settings: Settings;
  categories: CategoriesDoc;
  recurring: Recurring[];
  generated: number;
  today: string;
}

export interface Balance {
  balance: number;
  income: number;
  expenses: number;
}
