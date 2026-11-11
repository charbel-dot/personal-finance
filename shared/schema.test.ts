import { describe, expect, it } from 'vitest';
import { recurringInput, settings, settingsPatch } from './schema';

describe('settings schema', () => {
  it('fills defaults for settings saved before the budget rule existed', () => {
    const parsed = settings.parse({ currency: 'USD', timezone: 'UTC', openingBalance: 0 });
    expect(parsed.budgetRule).toEqual({ needs: 50, wants: 30, savings: 20 });
    expect(parsed.autoSplit).toBe(true);
  });

  it('never injects defaults into a partial update', () => {
    expect(settingsPatch.parse({ displayCurrency: 'LBP' })).toEqual({ displayCurrency: 'LBP' });
  });

  it('requires the rule to add up to 100%', () => {
    expect(settingsPatch.safeParse({ budgetRule: { needs: 60, wants: 30, savings: 20 } }).success).toBe(false);
    expect(settingsPatch.safeParse({ budgetRule: { needs: 60, wants: 20, savings: 20 } }).success).toBe(true);
    expect(settingsPatch.safeParse({ budgetRule: { needs: 50.5, wants: 29.5, savings: 20 } }).success).toBe(false);
  });
});

describe('recurring schema', () => {
  it('treats rules without a type as expenses', () => {
    const parsed = recurringInput.parse({
      name: 'Rent',
      amount: 100,
      categoryId: 'housing',
      frequency: 'monthly',
      startDate: '2026-11-01',
    });
    expect(parsed.type).toBe('expense');
  });
});
