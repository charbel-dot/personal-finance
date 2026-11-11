import { CURRENCIES, convertCents, formatMoney, parseAmountIn, roundLbp, type Currency } from '../../shared/money';
import type { MoneyFieldState } from '@/hooks/use-money-field';
import { currencySymbol, formatRate, useCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Small USD | LBP switch for an amount field. */
export function CurrencySwitch({
  value,
  onChange,
  className,
}: {
  value: Currency;
  onChange: (currency: Currency) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Currency" className={cn('flex shrink-0 rounded-lg bg-muted p-0.5', className)}>
      {CURRENCIES.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn(
            'min-h-8 rounded-md px-2.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            value === c ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** "≈ L£150,000" for the typed amount in the other currency, or the rate when nothing is typed. */
export function ConversionHint({ value, currency, id }: { value: string; currency: Currency; id?: string }) {
  const { rate } = useCurrency();
  const cents = parseAmountIn(value.replace(/-/g, ''), currency);
  const other: Currency = currency === 'USD' ? 'LBP' : 'USD';
  let text = formatRate(rate);
  if (cents !== null) {
    const converted = convertCents(cents, currency, other, rate);
    text = `≈ ${formatMoney(other === 'LBP' ? roundLbp(converted) : converted, other)} · ${text}`;
  }
  return (
    <p id={id} className="tabular text-xs text-muted-foreground" aria-live="polite">
      {text}
    </p>
  );
}

interface MoneyInputProps {
  id: string;
  field: MoneyFieldState;
  name: string;
  error?: string;
  errorId?: string;
  hintId: string;
  className?: string;
  /** Accept a leading minus (opening balance). */
  allowNegative?: boolean;
  onBlur?: () => void;
}

/** Text input with the currency symbol, a USD | LBP switch and the converted amount below. */
export function MoneyInput({
  id,
  field,
  name,
  error,
  errorId,
  hintId,
  className,
  allowNegative,
  onBlur,
}: MoneyInputProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className={cn(
          'flex h-11 items-center gap-2 rounded-md border bg-transparent pr-1 pl-3 shadow-xs transition-[color,box-shadow] dark:bg-input/30',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          error && 'border-destructive',
        )}
      >
        <span className="text-sm text-muted-foreground" aria-hidden="true">
          {currencySymbol(field.currency)}
        </span>
        <input
          id={id}
          name={name}
          type="text"
          inputMode={field.currency === 'LBP' ? 'numeric' : 'decimal'}
          autoComplete="off"
          placeholder={field.currency === 'LBP' ? '0' : '0.00'}
          value={field.value}
          maxLength={20}
          aria-invalid={Boolean(error)}
          aria-describedby={[error ? errorId : undefined, hintId].filter(Boolean).join(' ')}
          onChange={(e) => field.setValue(e.target.value.replace(allowNegative ? /[^\d.,-]/g : /[^\d.,]/g, ''))}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (onBlur && e.key === 'Enter') e.currentTarget.blur();
          }}
          className="tabular h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <CurrencySwitch value={field.currency} onChange={field.setCurrency} />
      </div>
      <ConversionHint id={hintId} value={field.value} currency={field.currency} />
    </div>
  );
}
