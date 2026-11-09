import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USER } from '../playwright.config';

async function login(page: Page, password = E2E_PASSWORD) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username').fill(E2E_USER);
  await page.getByLabel('Password').fill(password);
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
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === '__Host-money_session');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
    // "Remember me" is on by default → persistent 30-day cookie.
    expect(cookie?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 3600);

    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/history');
    await expect(page).toHaveURL(/\/login$/);
    const api = await page.request.get('/api/transactions');
    expect(api.status()).toBe(401);
  });
});

test('adds an expense and an income via quick add', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

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
  await expect(page.getByText('1 transactions')).toBeVisible();
  await expect(page.getByRole('button', { name: /Dining out, expense \$42\.50, Team lunch/ })).toBeVisible();

  // The last-used category is remembered for the next expense.
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await expect(dialog.getByRole('radio', { name: 'Dining out' })).toBeChecked();
});
