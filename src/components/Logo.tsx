import { cn } from '@/lib/utils';

/** The Money mark: a bold M in a brand-yellow tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-grid size-9 shrink-0 place-items-center rounded-[30%] bg-brand text-brand-ink shadow-sm',
        className,
      )}
      aria-hidden="true"
    >
      <svg
        className="size-[56%]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 18V6l7 7 7-7v12" />
      </svg>
    </span>
  );
}
