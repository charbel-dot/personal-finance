import { useState } from 'react';
import type { Currency } from '../../shared/money';
import { useCurrency } from '@/lib/format';

export interface MoneyFieldState {
  value: string;
  setValue: (value: string) => void;
  /** Currency the amount is being typed in. */
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  /** The typed amount in the stored (ledger) currency, or null when empty, invalid or too small. */
  stored: () => number | null;
  /** Whether the typed text differs from what the field started with. */
  dirty: boolean;
}

/**
 * State for an amount typed in USD or LBP. Starts in the display currency (pre-filled with
 * `original`, a stored amount, when editing). Switching currency keeps the typed number, except
 * for an untouched pre-filled amount, which is converted so editing never changes its value.
 */
export function useMoneyField(original?: number): MoneyFieldState {
  const { display, toInput, fromInput } = useCurrency();
  const [currency, setCurrencyState] = useState<Currency>(display);
  const initial = original === undefined ? '' : toInput(original, display);
  const [value, setValue] = useState(initial);

  const setCurrency = (next: Currency) => {
    if (next === currency) return;
    if (original !== undefined && value === toInput(original, currency)) setValue(toInput(original, next));
    setCurrencyState(next);
  };

  return {
    value,
    setValue,
    currency,
    setCurrency,
    stored: () => fromInput(value, currency, original),
    dirty: value !== initial,
  };
}
