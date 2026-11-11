import type { Account, TransactionType } from '../../shared/schema';
import { Segmented } from './Segmented';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The Whish Money logo at icon size. Decorative unless given a label. */
export function WhishLogo({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <img
      src="/whish-logo.png"
      alt={label ?? ''}
      width={size}
      height={size}
      className="shrink-0 rounded-[25%]"
      style={{ width: size, height: size }}
    />
  );
}

const ACCOUNT_ITEMS = [
  { value: 'cash', label: 'Cash' },
  {
    value: 'whish',
    label: (
      <span className="flex items-center gap-1.5">
        <WhishLogo />
        Whish Money
      </span>
    ),
  },
] as const;

/** "Paid with" / "Received in": Cash or Whish Money. */
export function AccountSwitch({
  type,
  value,
  onChange,
}: {
  type: TransactionType;
  value: Account;
  onChange: (account: Account) => void;
}) {
  const label = type === 'income' ? 'Received in' : 'Paid with';
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" aria-hidden="true">
        {label}
      </p>
      <Segmented fill aria-label={label} value={value} onValueChange={onChange} items={[...ACCOUNT_ITEMS]} />
    </div>
  );
}

/** Who a Whish send went to. */
export function RecipientField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        Sent to <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <Input
        id={id}
        name="to"
        maxLength={60}
        autoComplete="off"
        placeholder="Name or phone number…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11"
      />
    </div>
  );
}
