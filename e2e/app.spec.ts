import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USER } from '../playwright.config';

const welcome = (page: Page) => page.getByRole('dialog', { name: 'Welcome to Money' });

/** Pages other than the tabs and Whish open from the phone header's account menu. */
async function openFromMenu(page: Page, name: string) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name }).click();
}

async function login(page: Page, password = E2E_PASSWORD, { tour = false, username = E2E_USER } = {}) {
  // The first-run walkthrough opens once per account; tests not about it skip it whenever it shows.
  if (!tour) {
    await page.addLocatorHandler(welcome(page), async (d) => {
      await d.getByRole('button', { name: 'Skip' }).click();
    });
  }
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test('first-run walkthrough: tours the app once, then replays from Settings', async ({ page }) => {
  await login(page, E2E_PASSWORD, { tour: true });
  const tour = page.getByRole('dialog');
  await expect(tour).toHaveAccessibleName('Welcome to Money');
  await tour.getByRole('button', { name: 'Show Me Around' }).click();
  await expect(tour).toHaveAccessibleName('Your Money at a Glance');
  for (const name of ['Add in Seconds', 'Look Back, Plan Ahead', 'Make It Yours', 'You’re All Set']) {
    await tour.getByRole('button', { name: 'Next' }).click();
    await expect(tour).toHaveAccessibleName(name);
  }
  await tour.getByRole('button', { name: 'Done' }).click();
  await expect(tour).toBeHidden();

  // Finished once: stays gone after a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: /^Good / })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Replay from Settings; Escape closes it and clears the URL flag.
  await openFromMenu(page, 'Settings');
  await page.getByRole('link', { name: 'Replay Tour' }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Welcome to Money');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
});

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

    await openFromMenu(page, 'Settings');
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
  await dialog.getByRole('radio', { name: 'Income' }).click();
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
  // Paid with Whish, to someone: the rule keeps both.
  await sheet.getByRole('radio', { name: 'Whish Money' }).click();
  await sheet.getByLabel(/Sent to/).fill('Coach');
  await sheet.getByRole('button', { name: 'Add Recurring Expense' }).click();
  await expect(page.getByText(/Gym added/)).toBeVisible();
  await expect(page.getByText(/· to Coach/)).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Gym' }).click();
  await page.getByRole('menuitem', { name: 'Pause' }).click();
  await expect(page.getByText('Gym paused')).toBeVisible();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();

  // Pausing must not drop the Whish settings.
  await page.getByRole('button', { name: 'Edit Gym' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Recurring Expense' });
  await expect(edit.getByRole('radio', { name: 'Whish Money' })).toBeChecked();
  await expect(edit.getByLabel(/Sent to/)).toHaveValue('Coach');
  await page.keyboard.press('Escape');
  await expect(edit).toBeHidden();

  await page.getByRole('button', { name: 'Actions for Gym' }).click();
  await page.getByRole('menuitem', { name: 'Resume' }).click();
  await expect(page.getByText('Gym resumed')).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Gym' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Gym deleted')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Gym' })).toHaveCount(0);
});

test('settings: theme, currencies and a new category', async ({ page }) => {
  await login(page);
  await openFromMenu(page, 'Settings');

  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('radio', { name: /^LBP/ }).click();
  await expect(page.getByText('Main currency set to LBP')).toBeVisible();
  const rate = page.getByLabel('Exchange rate');
  await rate.fill('90,000');
  await rate.press('Enter');
  await expect(page.getByText('Rate set to 1 USD = 90,000 LBP')).toBeVisible();

  // Categories lives in the phone header's account menu.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Categories' }).click();
  await expect(page).toHaveURL(/\/categories$/);
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
  await expect(dialog.getByRole('button', { name: 'LBP' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('1 USD = 90,000 LBP')).toBeVisible();
  await page.keyboard.press('Escape');

  // Back to USD at the default rate for the tests that follow.
  await openFromMenu(page, 'Settings');
  await page.getByRole('radio', { name: /^USD/ }).click();
  await expect(page.getByText('Main currency set to USD')).toBeVisible();
  await rate.fill('89500');
  await rate.press('Enter');
  await expect(page.getByText('Rate set to 1 USD = 89,500 LBP')).toBeVisible();
});

test('whish money: top up, send in LBP, pay, guard the balance and withdraw', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /^Good / })).toBeVisible();
  await page.getByRole('link', { name: 'Whish Money' }).first().click();
  await expect(page.getByRole('heading', { name: 'Whish Money', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Top Up' }).click();
  const topUp = page.getByRole('dialog', { name: 'Top Up Whish' });
  await topUp.getByLabel('Amount').fill('100');
  await topUp.getByRole('button', { name: 'Top Up', exact: true }).click();
  await expect(page.getByText('Added $100.00 to Whish')).toBeVisible();

  // Send typed in LBP: converted at the rate and recorded as a Whish expense.
  await page.getByRole('button', { name: 'Send' }).click();
  const send = page.getByRole('dialog', { name: 'Send With Whish' });
  await send.getByRole('button', { name: 'LBP' }).click();
  await send.getByLabel('Amount').fill('895,000');
  await expect(send.getByText(/≈ \$10\.00/)).toBeVisible();
  await send.getByLabel(/Sent to/).fill('Sam');
  await send.getByRole('button', { name: 'Add Expense' }).click();
  await expect(page.getByText('Sent $10.00 to Sam')).toBeVisible();
  await expect(page.getByRole('button', { name: /with Whish Money, to Sam/ }).first()).toBeVisible();

  // The wallet can't go below zero.
  await page.getByRole('button', { name: 'Pay' }).click();
  const pay = page.getByRole('dialog', { name: 'Spend With Whish' });
  await pay.getByLabel('Amount').fill('1000000');
  await pay.getByRole('button', { name: 'Add Expense' }).click();
  await expect(page.getByText(/Not enough money in your Whish account/)).toBeVisible();
  await pay.getByLabel('Amount').fill('20');
  await pay.getByRole('button', { name: 'Add Expense' }).click();
  await expect(page.getByText('Expense added')).toBeVisible();

  // Withdrawing moves the money back into Current Balance.
  const balanceBefore = (await (await page.request.get('/api/balance')).json()) as { balance: number; whish: number };
  await page.getByRole('button', { name: 'Withdraw' }).click();
  const withdraw = page.getByRole('dialog', { name: 'Withdraw From Whish' });
  await withdraw.getByLabel('Amount').fill('5');
  await withdraw.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByText('Withdrew $5.00 from Whish')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Withdrawn to cash \$5\.00/ }).first()).toBeVisible();
  const balanceAfter = (await (await page.request.get('/api/balance')).json()) as { balance: number; whish: number };
  expect(balanceAfter.balance - balanceBefore.balance).toBe(500);
  expect(balanceAfter.whish - balanceBefore.whish).toBe(-500);

  // LBP is written as the plain code, never L£ (Intl puts a non-breaking space after it).
  await expect(page.getByText(/LBP\s[\d,]+/).first()).toBeVisible();
  await expect(page.getByText(/L£/)).toHaveCount(0);
});

test('dashboard custom range and history filters', async ({ page }) => {
  await login(page);
  await page.getByRole('radio', { name: 'Custom' }).click();
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
  await openFromMenu(page, 'Account');
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
  await sheet.getByRole('radio', { name: 'Income' }).click();
  await sheet.getByLabel('Name').fill('Salary');
  await sheet.getByLabel(/Amount/).fill('3000');
  await sheet.getByRole('button', { name: 'Add Recurring Income' }).click();
  await expect(page.getByText(/Salary added/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Salary' })).toBeVisible();

  await openFromMenu(page, 'Settings');
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
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Savings' }).click();
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
  await sheet.getByRole('radio', { name: 'Withdraw' }).click();
  await sheet.getByLabel(/Amount/).fill('1000000');
  await sheet.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(sheet.getByText(/You only have/)).toBeVisible();
  await sheet.getByLabel(/Amount/).fill('50');
  await sheet.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByText(/Withdrew/)).toBeVisible();

  const withdrawal = page.getByRole('button', { name: /^Edit withdrawal of .*50/ }).first();
  await withdrawal.click();
  const edit = page.getByRole('dialog', { name: 'Edit Savings' });
  await edit.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Entry deleted')).toBeVisible();
});

test('savings goals: create, add towards, track progress and delete', async ({ page }) => {
  await login(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Savings' }).click();
  await page.getByRole('button', { name: 'New Goal' }).click();
  const sheet = page.getByRole('dialog', { name: 'New Goal' });
  await sheet.getByRole('button', { name: 'Create Goal' }).click();
  await expect(sheet.getByText('Give it a name')).toBeVisible();
  await sheet.getByLabel('Name').fill('Japan');
  await sheet.getByLabel(/Target/).fill('1000');
  await sheet.getByRole('button', { name: 'Create Goal' }).click();
  await expect(page.getByText(/Japan created/)).toBeVisible();

  await page.getByRole('button', { name: 'Add to Japan' }).click();
  const add = page.getByRole('dialog', { name: 'Add Savings' });
  await add.getByLabel(/Amount/).fill('250');
  await add.getByRole('button', { name: 'Add to Savings' }).click();
  await expect(page.getByText(/towards Japan/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Japan: .*250.* of .*1,000.*Show entries/ })).toBeVisible();

  // The goal card filters the history to its entries.
  await page.getByRole('button', { name: /^Japan: .*Show entries/ }).click();
  await expect(page.getByRole('button', { name: 'Clear filter: Japan' })).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Japan' }).click();
  await page.getByRole('menuitem', { name: 'Delete Goal' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete Goal' }).click();
  await expect(page.getByText('Japan deleted')).toBeVisible();
});

test('dashboard cards link to where they belong', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Expenses: view transactions' }).click();
  await expect(page).toHaveURL(/\/history\?.*type=expense/);
  await page.getByRole('link', { name: 'Home' }).click();
  await page.getByRole('link', { name: 'Savings', exact: true }).first().click();
  await expect(page).toHaveURL(/\/savings/);
  await openFromMenu(page, 'Account');
  await page
    .getByRole('link', { name: /^Recurring/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/recurring$/);
});

async function signOut(page: Page) {
  await openFromMenu(page, 'Settings');
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test('users: the owner adds a user who only sees their own data, then removes them', async ({ page }) => {
  // Three sign-ins, each running the deliberately slow password hash.
  test.slow();
  // Owner adds "sam" from Account → People.
  await login(page);
  await openFromMenu(page, 'Account');
  await page.getByRole('button', { name: 'Add User' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add User' });
  await sheet.getByLabel('Username').fill('Sam');
  await sheet.getByLabel('Password', { exact: true }).fill('short');
  await sheet.getByRole('button', { name: 'Create User' }).click();
  await expect(sheet.getByRole('alert')).toContainText('at least 8 characters');
  await sheet.getByLabel('Password', { exact: true }).fill('sam-password-1');
  await sheet.getByRole('button', { name: 'Create User' }).click();
  await expect(page.getByText('sam can now sign in')).toBeVisible();
  await expect(page.getByText('sam', { exact: true })).toBeVisible();
  await signOut(page);

  // Sam starts empty (none of the owner's transactions), gets the walkthrough, and adds their own.
  await page.removeLocatorHandler(welcome(page));
  await login(page, 'sam-password-1', { username: 'sam', tour: true });
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Welcome to Money');
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { name: /^Good .*, Sam$/ })).toBeVisible();
  await page.getByRole('link', { name: 'History' }).click();
  await page.getByLabel('Search transactions').fill('lunch');
  await expect(page.getByRole('button', { name: /Team lunch/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  const tx = page.getByRole('dialog', { name: 'New Transaction' });
  await tx.getByLabel('Amount').fill('7.25');
  await tx.getByLabel(/Note/).fill('Sam coffee');
  await tx.getByRole('button', { name: 'Add Expense' }).click();
  await expect(page.getByText('Expense added')).toBeVisible();
  // Members manage their own password; they can't manage people.
  await openFromMenu(page, 'Account');
  await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add User' })).toHaveCount(0);
  expect((await page.request.get('/api/users')).status()).toBe(403);
  await signOut(page);

  // The owner never sees Sam's data, then removes Sam (and everything Sam stored).
  await login(page);
  await page.getByRole('link', { name: 'History' }).click();
  await page.getByLabel('Search transactions').fill('coffee');
  await expect(page.getByRole('button', { name: /Sam coffee/ })).toHaveCount(0);
  await openFromMenu(page, 'Account');
  await page.getByRole('button', { name: 'Remove sam' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove User' }).click();
  await expect(page.getByText('sam removed')).toBeVisible();
  await signOut(page);

  // Sam's account is gone: the old password no longer signs in.
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await page.getByLabel('Username').fill('sam');
  await page.getByLabel('Password', { exact: true }).fill('sam-password-1');
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toContainText('Incorrect username or password');
});

test('home shows today, and reports add up any period with custom dates', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /^Good / })).toBeVisible();

  // Today card: earlier tests logged entries today.
  const todayCard = page.locator('[aria-labelledby="today-title"]');
  await expect(todayCard.getByText(/\d+ entr(y|ies) so far/)).toBeVisible();
  await expect(todayCard.getByText('Spent', { exact: true })).toBeVisible();
  // Earlier tests log more than the card shows: six rows (newest first), then a link to the rest.
  await expect(todayCard.getByRole('link', { name: /^See all \d+ entries from today$/ })).toBeVisible();

  // Full report for today opens Reports on a custom one-day range.
  await todayCard.getByRole('link', { name: 'Full Report' }).click();
  await expect(page).toHaveURL(/\/reports\?range=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();
  // The phone header keeps only Whish; Reports and the rest are in the account menu.
  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Account menu' }).click();
  for (const item of ['Account', 'Reports', 'Categories', 'Settings']) {
    await expect(page.getByRole('menuitem', { name: item })).toBeVisible();
  }
  await expect(page.getByRole('menuitem', { name: 'Sign Out' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Spending by Category' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Dining out: / })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All Entries' })).toBeVisible();
  // The full list for today has the earliest entry too.
  await expect(page.getByRole('button', { name: /Team lunch/ }).first()).toBeVisible();

  // Custom dates: a start after the end drags the end along; nothing was logged in 2030.
  await page.getByLabel('From').fill('2030-01-01');
  await expect(page.getByLabel('To')).toHaveValue('2030-01-01');
  await expect(page.getByText('Nothing in These Dates')).toBeVisible();

  // All time: every kind of entry, filterable, and exportable.
  await page.getByRole('combobox', { name: 'Period' }).click();
  await page.getByRole('option', { name: 'All time' }).click();
  await expect(page.getByRole('heading', { name: 'Savings and Whish' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Show' }).click();
  await page.getByRole('option', { name: 'Whish Money' }).click();
  await expect(page.getByRole('link', { name: /^Whish top-up / }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Team lunch/ })).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^money-report-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
});
