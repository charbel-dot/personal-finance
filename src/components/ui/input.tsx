import { Input as GlassInput } from 'glisse';
import * as React from 'react';
import { cn } from '@/lib/utils';

type Props = Omit<React.ComponentProps<'input'>, 'value' | 'defaultValue'> & {
  value?: string | number;
  defaultValue?: string | number;
  /** Optional glyph shown before the text. */
  icon?: React.ReactNode;
};

/**
 * Liquid glass text field (glisse). Keeps the native `onChange` event API used across the app and
 * works both controlled (`value`) and uncontrolled (`defaultValue`).
 */
function Input({ className, value, defaultValue, onChange, ref, ...props }: Props) {
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState(() => (defaultValue === undefined ? '' : String(defaultValue)));
  // glisse types only expose `onValueChange`, but spread props (including `onChange`) reach the
  // native <input> after its own handler, so the native event API keeps working.
  const native = {
    ...props,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!controlled) setInner(e.target.value);
      onChange?.(e);
    },
  } as unknown as React.ComponentProps<typeof GlassInput>;
  return (
    <GlassInput
      ref={ref}
      data-slot="input"
      className={cn('w-full min-w-0', className)}
      value={controlled ? String(value) : inner}
      {...native}
    />
  );
}

export { Input };
