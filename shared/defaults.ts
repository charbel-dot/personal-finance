import { DEFAULT_USD_RATE } from './money';
import { DEFAULT_BUDGET_RULE, type CategoriesDoc, type Settings } from './schema';

export const DEFAULT_CATEGORIES: CategoriesDoc = {
  expense: [
    { id: 'housing', name: 'Housing', color: '#3b82f6', group: 'needs' },
    { id: 'groceries', name: 'Groceries', color: '#22c55e', group: 'needs' },
    { id: 'transport', name: 'Transport', color: '#0ea5e9', group: 'needs' },
    { id: 'utilities', name: 'Utilities', color: '#14b8a6', group: 'needs' },
    { id: 'health', name: 'Health', color: '#ef4444', group: 'needs' },
    { id: 'dining', name: 'Dining out', color: '#f97316', group: 'wants' },
    { id: 'shopping', name: 'Shopping', color: '#ec4899', group: 'wants' },
    { id: 'entertainment', name: 'Entertainment', color: '#f43f5e', group: 'wants' },
    { id: 'subscriptions', name: 'Subscriptions', color: '#eab308', group: 'wants' },
    { id: 'savings', name: 'Savings & investing', color: '#10b981', group: 'savings' },
    { id: 'other-expense', name: 'Other', color: '#64748b', group: 'wants' },
  ],
  income: [
    { id: 'salary', name: 'Salary', color: '#10b981' },
    { id: 'client', name: 'Client', color: '#3b82f6' },
    { id: 'freelance', name: 'Freelance', color: '#06b6d4' },
    { id: 'other-income', name: 'Other', color: '#64748b' },
  ],
};

export const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  displayCurrency: 'USD',
  usdRate: DEFAULT_USD_RATE,
  timezone: 'UTC',
  openingBalance: 0,
  budgetRule: DEFAULT_BUDGET_RULE,
  autoSplit: true,
  tourDone: false,
};

export const CATEGORY_COLORS = [
  '#22c55e',
  '#0ea5e9',
  '#14b8a6',
  '#ef4444',
  '#f97316',
  '#ec4899',
  '#eab308',
  '#10b981',
  '#3b82f6',
  '#f43f5e',
  '#06b6d4',
  '#64748b',
] as const;
