import type { CSSProperties } from 'react';
import type { Category } from '../../shared/schema';
import { cn } from '@/lib/utils';

interface Props {
  name: string;
  legend: string;
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}

/** Native radios styled as chips: arrow keys, screen-reader semantics and form behaviour for free. */
export function CategoryPicker({ name, legend, categories, value, onChange, error }: Props) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <label
            key={c.id}
            className={cn(
              'press inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm text-muted-foreground transition-colors select-none',
              'hover:bg-accent hover:text-foreground',
              'has-[:checked]:border-foreground/40 has-[:checked]:bg-accent has-[:checked]:font-medium has-[:checked]:text-foreground',
              'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={c.id}
              checked={value === c.id}
              onChange={() => onChange(c.id)}
            />
            <span
              className="size-2.5 rounded-full bg-(--dot)"
              style={{ '--dot': c.color } as CSSProperties}
              aria-hidden="true"
            />
            {c.name}
          </label>
        ))}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
