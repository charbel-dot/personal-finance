import { useState } from 'react';
import { formatAmountInput, type Currency } from '../../shared/money';
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
  // Amount fields show thousands separators ("1,250.00", "600,000").
  const inputFor = (cents: number, c: Currency) => formatAmountInput(toInput(cents, c), c);
  const initial = original === undefined ? '' : inputFor(original, display);
  const [value, setValue] = useState(initial);

  const setCurrency = (next: Currency) => {
    if (next === currency) return;
    if (original !== undefined && value === inputFor(original, currency)) setValue(inputFor(original, next));
    // LBP has no fractions: "1,234.56" typed in USD becomes "1,234" rather than "123,456".
    else setValue(formatAmountInput(next === 'LBP' ? value.replace(/\..*$/, '') : value, next));
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
