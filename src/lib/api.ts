import type {
  Balance,
  Bootstrap,
  CategoriesDoc,
  LoginInput,
  NewUserInput,
  PasswordChange,
  Role,
  UserSummary,
  Recurring,
  RecurringInput,
  GoalInput,
  SavingsDoc,
  SavingsEntry,
  SavingsGoal,
  SavingsInput,
  Settings,
  SettingsPatch,
  Transaction,
  TransactionInput,
} from '../../shared/schema';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers:
        body === undefined
          ? { Accept: 'application/json' }
          : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline');
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response; handled below.
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  login: (input: LoginInput) => request<{ ok: true }>('POST', '/auth/login', input),
  logout: () => request<{ ok: true }>('POST', '/auth/logout', {}),
  me: () =>
    request<
      | {
          authenticated: true;
          username: string;
          role: Role;
          remember: boolean;
          issuedAt: number;
          expiresAt: number;
        }
      | { authenticated: false }
    >('GET', '/auth/me'),
  bootstrap: () => request<Bootstrap>('GET', '/bootstrap'),
  balance: () => request<Balance>('GET', '/balance'),
  transactions: (range?: { from: string; to: string }) =>
    request<{ items: Transaction[] }>(
      'GET',
      range ? `/transactions?from=${range.from}&to=${range.to}` : '/transactions',
    ).then((r) => r.items),
  createTransaction: (input: TransactionInput) => request<Transaction>('POST', '/transactions', input),
  updateTransaction: (id: string, fromMonth: string, input: TransactionInput) =>
    request<Transaction>('PUT', `/transactions/${encodeURIComponent(id)}?month=${fromMonth}`, input),
  deleteTransaction: (id: string, month: string) =>
    request<undefined>('DELETE', `/transactions/${encodeURIComponent(id)}?month=${month}`),
  createRecurring: (input: RecurringInput) => request<Recurring>('POST', '/recurring', input),
  updateRecurring: (id: string, input: RecurringInput) =>
    request<Recurring>('PUT', `/recurring/${encodeURIComponent(id)}`, input),
  deleteRecurring: (id: string) => request<undefined>('DELETE', `/recurring/${encodeURIComponent(id)}`),
  savings: () => request<SavingsDoc>('GET', '/savings'),
  createGoal: (input: GoalInput) => request<SavingsGoal>('POST', '/savings/goals', input),
  updateGoal: (id: string, input: GoalInput) =>
    request<SavingsGoal>('PUT', `/savings/goals/${encodeURIComponent(id)}`, input),
  deleteGoal: (id: string) => request<undefined>('DELETE', `/savings/goals/${encodeURIComponent(id)}`),
  createSavings: (input: SavingsInput) => request<SavingsEntry>('POST', '/savings', input),
  updateSavings: (id: string, input: SavingsInput) =>
    request<SavingsEntry>('PUT', `/savings/${encodeURIComponent(id)}`, input),
  deleteSavings: (id: string) => request<undefined>('DELETE', `/savings/${encodeURIComponent(id)}`),
  putCategories: (doc: CategoriesDoc) => request<CategoriesDoc>('PUT', '/categories', doc),
  patchSettings: (patch: SettingsPatch) => request<Settings>('PATCH', '/settings', patch),
  changePassword: (input: PasswordChange) => request<{ ok: true }>('POST', '/auth/password', input),
  users: () => request<{ items: UserSummary[] }>('GET', '/users').then((r) => r.items),
  createUser: (input: NewUserInput) => request<UserSummary>('POST', '/users', input),
  resetPassword: (id: string, password: string) =>
    request<{ ok: true }>('PUT', `/users/${encodeURIComponent(id)}/password`, { password }),
  deleteUser: (id: string) => request<undefined>('DELETE', `/users/${encodeURIComponent(id)}`),
};
