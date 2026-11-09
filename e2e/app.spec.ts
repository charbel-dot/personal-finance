import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USER } from '../playwright.config';

async function login(page: Page, password = E2E_PASSWORD) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username').fill(E2E_USER);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('auth', () => {
  test('rejects a wrong password', async ({ page }) => {
    await login(page, 'definitely-wrong');
    await expect(page.getByRole('alert')).toContainText('Incorrect username or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signs in, protects routes and signs out', async ({ page, context }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening|night)$/ })).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === '__Host-money_session');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
    // "Remember me" is on by default → persistent 30-day cookie.
    expect(cookie?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 3600);

    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/history');
    await expect(page).toHaveURL(/\/login$/);
    const api = await page.request.get('/api/transactions');
    expect(api.status()).toBe(401);
  });
});

test('adds an expense and an income via quick add', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening|night)$/ })).toBeVisible();

  // Expense: FAB → amount → (default category) → save.
  await page.getByRole('button', { name: 'Add transaction' }).click();
  const dialog = page.getByRole('dialog', { name: 'New transaction' });
  await expect(dialog).toBeVisible();
  const amount = dialog.getByLabel('Amount');
  await expect(amount).toBeFocused();
  await expect(amount).toHaveAttribute('inputmode', 'decimal');

  // Validation
  await dialog.getByRole('button', { name: 'Add expense' }).click();
  await expect(dialog.getByText('Enter an amount greater than zero')).toBeVisible();

  await amount.fill('42.50');
  await dialog.getByText('Dining out').click();
  await dialog.getByLabel(/Note/).fill('Team lunch');
  await dialog.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByText('Expense added')).toBeVisible();
  await expect(dialog).toBeHidden();

  // Income
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await dialog.getByRole('button', { name: 'Income' }).click();
  await dialog.getByLabel('Amount').fill('3000');
  await dialog.getByRole('button', { name: 'Add income' }).click();
  await expect(page.getByText('Income added')).toBeVisible();

  // Shows up in the dashboard and history.
  await expect(page.getByRole('button', { name: /Team lunch/ }).first()).toBeVisible();
  await page.getByRole('link', { name: 'History' }).click();
  await page.getByLabel('Search transactions').fill('lunch');
  await expect(page.getByText('1 transaction', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dining out, expense \$42\.50, Team lunch/ })).toBeVisible();

  // The last-used category is remembered for the next expense.
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await expect(dialog.getByRole('radio', { name: 'Dining out' })).toBeChecked();
});

test('recurring: create, pause, resume and delete', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Recurring' }).click();
  await page.getByRole('button', { name: 'New recurring' }).click();
  const sheet = page.getByRole('dialog', { name: 'New recurring expense' });
  await sheet.getByRole('button', { name: 'Add recurring expense' }).click();
  await expect(sheet.getByText('Give it a name')).toBeVisible();
  await sheet.getByLabel('Name').fill('Gym');
  await sheet.getByLabel(/Amount/).fill('39.90');
  await sheet.getByRole('button', { name: 'Add recurring expense' }).click();
  await expect(page.getByText('Recurring expense added')).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Gym' }).click();
  await page.getByRole('menuitem', { name: 'Pause' }).click();
  await expect(page.getByText('Gym paused')).toBeVisible();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Gym' }).click();
  await page.getByRole('menuitem', { name: 'Resume' }).click();
  await expect(page.getByText('Gym resumed')).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Gym' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Recurring expense deleted')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Gym' })).toHaveCount(0);
});

test('settings: theme, currency and a new category', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Settings' }).click();

  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('combobox', { name: 'Currency' }).click();
  await page.getByRole('option', { name: /^EUR/ }).click();
  await expect(page.getByText('Currency set to EUR')).toBeVisible();

  await page.getByRole('textbox', { name: 'New category name' }).fill('Pets');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Save categories' }).click();
  await expect(page.getByText('Categories saved')).toBeVisible();

  // The new category and currency show up in quick add.
  await page.getByRole('button', { name: 'Add transaction' }).click();
  const dialog = page.getByRole('dialog', { name: 'New transaction' });
  await expect(dialog.getByRole('radio', { name: 'Pets' })).toBeVisible();
  await expect(dialog.getByText('€')).toBeVisible();
});

test('dashboard custom range and history filters', async ({ page }) => {
  await login(page);
  await page.getByRole('tab', { name: 'Custom' }).click();
  await expect(page.getByLabel('From')).toBeVisible();
  await page.getByLabel('From').fill('2026-01-01');
  await expect(page.getByText('Custom range')).toBeVisible();

  await page.getByRole('link', { name: 'History' }).click();
  await page.getByRole('combobox', { name: 'Type' }).click();
  await page.getByRole('option', { name: 'Income' }).click();
  await page.getByRole('combobox', { name: 'Date range' }).click();
  await page.getByRole('option', { name: 'All time' }).click();
  await page.getByLabel('Search transactions').fill('zzz-no-match');
  await expect(page.getByText('No matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByLabel('Search transactions')).toHaveValue('');
});
