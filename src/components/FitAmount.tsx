import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Lets a long amount break after its group separators ("LBP 89,500,<wbr>000") instead of mid-digit. */
function breakable(text: string): ReactNode {
  // \s also matches the no-break and narrow no-break spaces Intl puts in amounts.
  const parts = text.split(/(?<=[,.\s'])/);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && <wbr />}
    </span>
  ));
}

/**
 * An amount that always fits its box: the font shrinks with the text's length (so billions of LBP
 * still sit on one line), down to `min`, and only then wraps, at a group separator. Never
 * truncated, never overflowing. `text` is the final formatted amount (sizing and screen readers);
 * `shown`, when given, is what is drawn instead, e.g. a count-up animation on its way to `text`.
 */
export function FitAmount({
  text,
  shown,
  max,
  min = '0.875rem',
  className,
}: {
  text: string;
  shown?: string;
  /** Largest size, e.g. '3rem' for a hero figure. */
  max: string;
  min?: string;
  className?: string;
}) {
  const animated = shown !== undefined && shown !== text;
  return (
    <span className="fit-box">
      <span
        className={cn('fit-amount tabular', className)}
        style={{ '--chars': Math.max(4, text.length), '--fit-max': max, '--fit-min': min } as CSSProperties}
      >
        {animated ? (
          <>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">{breakable(shown)}</span>
          </>
        ) : (
          breakable(text)
        )}
      </span>
    </span>
  );
}
