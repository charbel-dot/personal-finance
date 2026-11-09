import * as React from 'react';
import { loadRecharts } from '@/lib/recharts';
import { cn } from '@/lib/utils';

/** Series key → label and colour. Colours become `--color-<key>` CSS variables on the container. */
export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

const INITIAL_DIMENSION = { width: 320, height: 200 } as const;

/** Responsive chart frame. Suspends until recharts has loaded (wrap in <Suspense>). */
function ChartContainer({
  className,
  children,
  config,
  style,
  ...props
}: React.ComponentProps<'div'> & { config: ChartConfig; children: React.ReactElement }) {
  const { ResponsiveContainer } = React.use(loadRecharts());
  const vars = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(config)
          .filter(([, c]) => c.color)
          .map(([key, c]) => [`--color-${key}`, c.color]),
      ) as React.CSSProperties,
    [config],
  );

  return (
    <div
      data-slot="chart"
      className={cn(
        "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden [&_.recharts-wrapper:has(:focus-visible)]:rounded-md [&_.recharts-wrapper:has(:focus-visible)]:ring-2 [&_.recharts-wrapper:has(:focus-visible)]:ring-ring/60",
        className,
      )}
      style={{ ...vars, ...style }}
      {...props}
    >
      <ResponsiveContainer initialDimension={INITIAL_DIMENSION}>{children}</ResponsiveContainer>
    </div>
  );
}

export { ChartContainer };
