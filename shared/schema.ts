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

export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'Invalid currency');

export const settings = z.object({
  currency: currencyCode,
  /** IANA timezone used to decide what "today" is for recurring generation. */
  timezone: z.string().min(1).max(64),
  /** Starting balance (cents, may be negative) added to the all-time balance. */
  openingBalance: z.number().int().min(-100_000_000_000).max(100_000_000_000),
  lastExpenseCategoryId: id.optional(),
  lastIncomeCategoryId: id.optional(),
});
export type Settings = z.infer<typeof settings>;

export const settingsPatch = settings.partial();
export type SettingsPatch = z.infer<typeof settingsPatch>;

export const loginInput = z.object({
  username: z.string().trim().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(200),
  remember: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginInput>;

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
