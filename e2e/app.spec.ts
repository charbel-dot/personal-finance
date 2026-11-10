import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USER } from '../playwright.config';

async function login(page: Page, password = E2E_PASSWORD) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username').fill(E2E_USER);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test.describe('auth', () => {
  test('rejects a wrong password', async ({ page }) => {
    await login(page, 'definitely-wrong');
    await expect(page.getByRole('alert')).toContainText('Incorrect username or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signs in, protects routes and signs out', async ({ page, context }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening|night), E2e$/ })).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === '__Host-money_session');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
    // "Remember me" is on by default → persistent 30-day cookie.
    expect(cookie?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 3600);

    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/history');
    await expect(page).toHaveURL(/\/login$/);
    const api = await page.request.get('/api/transactions');
    expect(api.status()).toBe(401);
  });
});

test('adds an expense and an income via quick add', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening|night), E2e$/ })).toBeVisible();

  // Expense: FAB → amount → (default category) → save.
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  const dialog = page.getByRole('dialog', { name: 'New Transaction' });
  await expect(dialog).toBeVisible();
  const amount = dialog.getByLabel('Amount');
  // Phones: no auto-focus (the keyboard would jump up mid-animation); the user taps the field.
  await expect(amount).not.toBeFocused();
  await amount.click();
  await expect(amount).toHaveAttribute('inputmode', 'decimal');

  // Validation
  await dialog.getByRole('button', { name: 'Add Expense' }).click();
  await expect(dialog.getByText('Enter an amount greater than zero')).toBeVisible();

  await amount.fill('42.50');
  await dialog.getByText('Dining out').click();
  await dialog.getByLabel(/Note/).fill('Team lunch');
  await dialog.getByRole('button', { name: 'Add Expense' }).click();
  await expect(page.getByText('Expense added')).toBeVisible();
  await expect(dialog).toBeHidden();

  // Income
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  await dialog.getByRole('button', { name: 'Income' }).click();
  await dialog.getByLabel('Amount').fill('3000');
  await dialog.getByRole('button', { name: 'Add Income' }).click();
  await expect(page.getByText('Income added')).toBeVisible();

  // Shows up in the dashboard and history.
  await expect(page.getByRole('button', { name: /Team lunch/ }).first()).toBeVisible();
  await page.getByRole('link', { name: 'History' }).click();
  await page.getByLabel('Search transactions').fill('lunch');
  await expect(page.getByText('1 transaction', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dining out, expense \$42\.50, Team lunch/ })).toBeVisible();

  // The last-used category is remembered for the next expense.
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  await expect(dialog.getByRole('radio', { name: 'Dining out' })).toBeChecked();
});

test('recurring: create, pause, resume and delete', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Recurring' }).click();
  await page.getByRole('button', { name: 'New Recurring' }).click();
  const sheet = page.getByRole('dialog', { name: 'New Recurring' });
  await sheet.getByRole('button', { name: 'Add Recurring Expense' }).click();
  await expect(sheet.getByText('Give it a name')).toBeVisible();
  await sheet.getByLabel('Name').fill('Gym');
  await sheet.getByLabel(/Amount/).fill('39.90');
  await sheet.getByRole('button', { name: 'Add Recurring Expense' }).click();
  await expect(page.getByText(/Gym added/)).toBeVisible();

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
  await expect(page.getByText('Gym deleted')).toBeVisible();
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

  await page.getByRole('link', { name: 'Categories' }).click();
  await page.getByRole('button', { name: 'New Category' }).click();
  const sheet = page.getByRole('dialog', { name: 'New Category' });
  await sheet.getByRole('button', { name: 'Add Category' }).click();
  await expect(sheet.getByText('Give it a name')).toBeVisible();
  await sheet.getByLabel('Name').fill('Pets');
  await sheet.getByRole('button', { name: 'Add Category' }).click();
  await expect(page.getByText('Pets added')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Pets' })).toBeVisible();

  // The new category and currency show up in quick add.
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  const dialog = page.getByRole('dialog', { name: 'New Transaction' });
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
  await page.getByRole('button', { name: 'Clear Filters' }).click();
  await expect(page.getByLabel('Search transactions')).toHaveValue('');
});

test('account shows the user and exports data', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Account' }).click();
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await expect(page.getByText(E2E_USER, { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^money-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('recurring income and a custom budget rule', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Recurring' }).click();
  await page.getByRole('button', { name: 'New Recurring' }).click();
  const sheet = page.getByRole('dialog', { name: 'New Recurring' });
  await sheet.getByRole('button', { name: 'Income' }).click();
  await sheet.getByLabel('Name').fill('Salary');
  await sheet.getByLabel(/Amount/).fill('3000');
  await sheet.getByRole('button', { name: 'Add Recurring Income' }).click();
  await expect(page.getByText(/Salary added/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Salary' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Needs').fill('60');
  await expect(page.getByText(/Total 110%/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Rule' })).toBeDisabled();
  await page.getByLabel('Wants').fill('20');
  await expect(page.getByText('Total 100%')).toBeVisible();
  await page.getByRole('button', { name: 'Save Rule' }).click();
  await expect(page.getByText('Budget rule set to 60/20/20')).toBeVisible();

  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: /Budget Split 60\/20\/20/ })).toBeVisible();
});

test('savings: add by source, guard withdrawals, edit and delete', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Savings' }).click();
  await expect(page.getByRole('heading', { name: 'Savings', level: 1 })).toBeVisible();

  // Add straight from a source row: the source is preselected.
  await page.getByRole('button', { name: 'Add savings from Freelance' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add Savings' });
  await expect(sheet.getByRole('radio', { name: 'Freelance' })).toBeChecked();
  await sheet.getByLabel(/Amount/).fill('250');
  await sheet.getByRole('button', { name: 'Add to Savings' }).click();
  await expect(page.getByText(/Saved .*250.* from Freelance/)).toBeVisible();

  // Withdrawals can't exceed what's saved.
  await page.getByRole('button', { name: 'Add Savings', exact: true }).click();
  await sheet.getByRole('button', { name: 'Withdraw' }).first().click();
  await sheet.getByLabel(/Amount/).fill('1000000');
  await sheet.getByRole('button', { name: 'Withdraw' }).last().click();
  await expect(sheet.getByText(/You only have/)).toBeVisible();
  await sheet.getByLabel(/Amount/).fill('50');
  await sheet.getByRole('button', { name: 'Withdraw' }).last().click();
  await expect(page.getByText(/Withdrew/)).toBeVisible();

  const withdrawal = page.getByRole('button', { name: /^Edit withdrawal of .*50/ }).first();
  await withdrawal.click();
  const edit = page.getByRole('dialog', { name: 'Edit Savings' });
  await edit.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Entry deleted')).toBeVisible();
});
