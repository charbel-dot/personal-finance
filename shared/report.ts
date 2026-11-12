import { daysBetween } from './dates';
import type {
  BudgetGroup,
  CategoriesDoc,
  Category,
  SavingsEntry,
  Transaction,
  TransactionType,
  WhishTransfer,
} from './schema';

/** One line of the report ledger: every kind of money movement in one list. */
export type EntryKind =
  'income' | 'expense' | 'savings-deposit' | 'savings-withdrawal' | 'whish-topup' | 'whish-withdrawal';

export interface ReportEntry {
  id: string;
  kind: EntryKind;
  date: string;
  /** Minor units, always positive; `sign` says which way it moved. */
  amount: number;
  /** +1 money in, −1 money out, 0 a move between your own pots (savings, Whish). */
  sign: 1 | -1 | 0;
  title: string;
  /** Category or source name. */
  category: string;
  color?: string;
  note?: string;
  account: 'cash' | 'whish';
  to?: string;
  recurring: boolean;
  /** Set for income and expenses, so the row can open the edit sheet. */
  transaction?: Transaction;
  createdAt: string;
}

export interface BreakdownRow {
  id: string;
  name: string;
  color?: string;
  amount: number;
  count: number;
  /** Share of the total for its type, 0–1. */
  share: number;
}

export interface MonthRow {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export interface Report {
  from: string;
  to: string;
  /** Calendar days in the range, up to today (never 0). */
  days: number;
  income: number;
  expenses: number;
  net: number;
  incomeCount: number;
  expenseCount: number;
  /** Average spend per day over `days`. */
  dailySpend: number;
  /** (income − expenses) / income, or null with no income. */
  keptRate: number | null;
  largestExpense: Transaction | null;
  largestIncome: Transaction | null;
  expenseByCategory: BreakdownRow[];
  incomeBySource: BreakdownRow[];
  byGroup: Record<BudgetGroup | 'none', number>;
  byAccount: Record<'cash' | 'whish', { income: number; expenses: number }>;
  recurringExpenses: number;
  oneOffExpenses: number;
  savings: { deposited: number; withdrawn: number; net: number; count: number };
  whish: { toppedUp: number; withdrawn: number; count: number };
  byMonth: MonthRow[];
  /** Everything in the range, newest first. */
  entries: ReportEntry[];
}

export interface ReportInput {
  from: string;
  to: string;
  today: string;
  transactions: Transaction[];
  savings: SavingsEntry[];
  transfers: WhishTransfer[];
  categories: CategoriesDoc;
}

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

function breakdown(items: Transaction[], type: TransactionType, categories: CategoriesDoc): BreakdownRow[] {
  const byId = new Map<string, Category>(categories[type].map((c) => [c.id, c]));
  const rows = new Map<string, BreakdownRow>();
  let total = 0;
  for (const t of items) {
    if (t.type !== type) continue;
    total += t.amount;
    const cat = byId.get(t.categoryId);
    const row = rows.get(t.categoryId) ?? {
      id: t.categoryId,
      name: cat?.name ?? (type === 'income' ? 'Other income' : 'Other'),
      color: cat?.color,
      amount: 0,
      count: 0,
      share: 0,
    };
    row.amount += t.amount;
    row.count += 1;
    rows.set(t.categoryId, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, share: total > 0 ? r.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

function transactionEntry(t: Transaction, categories: CategoriesDoc): ReportEntry {
  const cat = categories[t.type].find((c) => c.id === t.categoryId);
  const name = cat?.name ?? (t.type === 'income' ? 'Income' : 'Expense');
  return {
    id: t.id,
    kind: t.type,
    date: t.date,
    amount: t.amount,
    sign: t.type === 'income' ? 1 : -1,
    title: t.note ?? (t.to ? `Sent to ${t.to}` : name),
    category: name,
    color: cat?.color,
    note: t.note,
    account: t.account === 'whish' ? 'whish' : 'cash',
    to: t.to,
    recurring: Boolean(t.recurringId),
    transaction: t,
    createdAt: t.createdAt,
  };
}

function savingsEntry(e: SavingsEntry, categories: CategoriesDoc): ReportEntry {
  const source = categories.income.find((c) => c.id === e.sourceId)?.name ?? 'Savings';
  const deposit = e.kind === 'deposit';
  return {
    id: e.id,
    kind: deposit ? 'savings-deposit' : 'savings-withdrawal',
    date: e.date,
    amount: e.amount,
    sign: 0,
    title: e.note ?? (deposit ? `Saved from ${source}` : 'Taken out of savings'),
    category: source,
    note: e.note,
    account: 'cash',
    recurring: false,
    createdAt: e.createdAt,
  };
}

function transferEntry(e: WhishTransfer): ReportEntry {
  const deposit = e.kind === 'deposit';
  return {
    id: e.id,
    kind: deposit ? 'whish-topup' : 'whish-withdrawal',
    date: e.date,
    amount: e.amount,
    sign: 0,
    title: e.note ?? (deposit ? 'Topped up Whish' : 'Withdrew from Whish'),
    category: 'Whish Money',
    note: e.note,
    account: 'whish',
    recurring: false,
    createdAt: e.createdAt,
  };
}

const byNewest = (a: ReportEntry, b: ReportEntry) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/** Everything that happened between `from` and `to` (inclusive), summed every useful way. */
export function buildReport(input: ReportInput): Report {
  const { from, to, today, categories } = input;
  const txs = input.transactions.filter((t) => inRange(t.date, from, to));
  const saved = input.savings.filter((e) => inRange(e.date, from, to));
  const moved = input.transfers.filter((e) => inRange(e.date, from, to));

  const groupOf = new Map(categories.expense.map((c) => [c.id, c.group]));
  const byGroup: Report['byGroup'] = { needs: 0, wants: 0, savings: 0, none: 0 };
  const byAccount: Report['byAccount'] = { cash: { income: 0, expenses: 0 }, whish: { income: 0, expenses: 0 } };
  const months = new Map<string, MonthRow>();
  let income = 0;
  let expenses = 0;
  let incomeCount = 0;
  let recurringExpenses = 0;
  let largestExpense: Transaction | null = null;
  let largestIncome: Transaction | null = null;

  for (const t of txs) {
    const account = t.account === 'whish' ? 'whish' : 'cash';
    const month = t.date.slice(0, 7);
    const row = months.get(month) ?? { month, income: 0, expenses: 0, net: 0 };
    if (t.type === 'income') {
      income += t.amount;
      incomeCount += 1;
      byAccount[account].income += t.amount;
      row.income += t.amount;
      if (!largestIncome || t.amount > largestIncome.amount) largestIncome = t;
    } else {
      expenses += t.amount;
      byAccount[account].expenses += t.amount;
      byGroup[groupOf.get(t.categoryId) ?? 'none'] += t.amount;
      row.expenses += t.amount;
      if (t.recurringId) recurringExpenses += t.amount;
      if (!largestExpense || t.amount > largestExpense.amount) largestExpense = t;
    }
    row.net = row.income - row.expenses;
    months.set(month, row);
  }

  const deposited = saved.filter((e) => e.kind === 'deposit').reduce((a, e) => a + e.amount, 0);
  const withdrawn = saved.filter((e) => e.kind === 'withdrawal').reduce((a, e) => a + e.amount, 0);
  const toppedUp = moved.filter((e) => e.kind === 'deposit').reduce((a, e) => a + e.amount, 0);
  const whishOut = moved.filter((e) => e.kind === 'withdrawal').reduce((a, e) => a + e.amount, 0);
  const lastDay = to < today ? to : today;
  const days = Math.max(1, lastDay < from ? 1 : daysBetween(from, lastDay) + 1);

  return {
    from,
    to,
    days,
    income,
    expenses,
    net: income - expenses,
    incomeCount,
    expenseCount: txs.length - incomeCount,
    dailySpend: Math.round(expenses / days),
    keptRate: income > 0 ? (income - expenses) / income : null,
    largestExpense,
    largestIncome,
    expenseByCategory: breakdown(txs, 'expense', categories),
    incomeBySource: breakdown(txs, 'income', categories),
    byGroup,
    byAccount,
    recurringExpenses,
    oneOffExpenses: expenses - recurringExpenses,
    savings: { deposited, withdrawn, net: deposited - withdrawn, count: saved.length },
    whish: { toppedUp, withdrawn: whishOut, count: moved.length },
    byMonth: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
    entries: [
      ...txs.map((t) => transactionEntry(t, categories)),
      ...saved.map((e) => savingsEntry(e, categories)),
      ...moved.map(transferEntry),
    ].sort(byNewest),
  };
}

/** Earliest date with any data, for an "all time" report. */
export function earliestDate(input: Pick<ReportInput, 'transactions' | 'savings' | 'transfers'>): string | null {
  let first: string | null = null;
  for (const list of [input.transactions, input.savings, input.transfers]) {
    for (const item of list) if (!first || item.date < first) first = item.date;
  }
  return first;
}

export const ENTRY_LABEL: Record<EntryKind, string> = {
  income: 'Income',
  expense: 'Expense',
  'savings-deposit': 'Saved',
  'savings-withdrawal': 'From savings',
  'whish-topup': 'Whish top-up',
  'whish-withdrawal': 'Whish withdrawal',
};
