import { Suspense, use, useMemo, type CSSProperties } from 'react';
import type { TooltipContentProps } from 'recharts';
import type { Slice } from '../../shared/budget';
import { parseIso } from '../../shared/dates';
import { formatPercent } from '../../shared/money';
import type { Transaction } from '../../shared/schema';
import { spendingPace } from '../../shared/series';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useMoney } from '@/lib/format';
import { loadRecharts } from '@/lib/recharts';
import { cn } from '@/lib/utils';

/* Card text renders immediately; each chart suspends until recharts has loaded on demand. */

type Range = { from: string; to: string };
const shortDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

const paceConfig = {
  current: { label: 'This period', color: 'var(--expense)' },
  previous: { label: 'Previous period', color: 'var(--muted-foreground)' },
} satisfies ChartConfig;

export function PaceCard({
  current,
  previous,
  cur,
  prev,
  today,
}: {
  current: Transaction[];
  previous: Transaction[];
  cur: Range;
  prev: Range;
  today: string;
}) {
  const money = useMoney();
  const points = useMemo(
    () => spendingPace(current, previous, cur, prev, today),
    [current, previous, cur, prev, today],
  );
  const lastActual = points.filter((p) => p.current !== null).at(-1);
  const spent = lastActual?.current ?? 0;
  const before = lastActual?.previous ?? 0;
  const diff = spent - before;
  let sentence = `${money(spent)} spent so far.`;
  if (before > 0 && diff === 0) sentence = `${money(spent)} spent, the same as this point last period.`;
  else if (before > 0) {
    sentence = `${money(spent)} spent, ${money(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'} than this point last period.`;
  }

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="text-base">Spending pace</CardTitle>
        <CardDescription>{sentence}</CardDescription>
        <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-expense" /> This period
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-muted-foreground" /> Previous period
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <Suspense fallback={<Skeleton className="h-56 w-full sm:h-64" />}>
          <PaceChart points={points} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

function PaceTooltip({ active, payload, label }: TooltipContentProps) {
  const money = useMoney();
  if (!active || payload.length === 0) return null;
  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="font-medium">{typeof label === 'string' ? shortDay.format(parseIso(label)) : ''}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{p.dataKey === 'current' ? 'This period' : 'Previous'}</span>
          <span className="tabular font-medium">{typeof p.value === 'number' ? money(p.value) : '—'}</span>
        </div>
      ))}
    </div>
  );
}

export function CategoryCard({
  title,
  empty,
  slices,
  total,
  className,
}: {
  title: string;
  empty: string;
  slices: Slice[];
  total: number;
  className?: string;
}) {
  const money = useMoney();
  const top = slices.slice(0, 5);
  const rest = slices.slice(5).reduce((a, s) => a + s.value, 0);
  const rows: Slice[] =
    rest > 0
      ? [
          ...top,
          { id: 'rest', name: 'Everything else', color: 'var(--muted-foreground)', value: rest, share: rest / total },
        ]
      : top;
  const config: ChartConfig = Object.fromEntries(rows.map((r) => [r.id, { label: r.name, color: r.color }]));
  return (
    <Card className={cn('@container', className)}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{total > 0 ? `${money(total)} in total` : empty}</CardDescription>
      </CardHeader>
      {total > 0 && (
        <CardContent className="flex flex-col items-center gap-6 @lg:flex-row">
          <Suspense fallback={<Skeleton className="size-40 shrink-0 rounded-full" />}>
            <CategoryPie rows={rows} config={config} />
          </Suspense>
          <ul className="w-full min-w-0 space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full bg-(--dot)"
                    style={{ '--dot': r.color } as CSSProperties}
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.name}</span>
                  <span className="tabular font-medium">{money(r.value)}</span>
                  <span className="tabular w-10 text-right text-xs text-muted-foreground">
                    {formatPercent(r.share)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="grow-x h-full rounded-full bg-(--dot)"
                    style={{ width: `${r.share * 100}%`, '--dot': r.color } as CSSProperties}
                  />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

function PaceChart({ points }: { points: ReturnType<typeof spendingPace> }) {
  const R = use(loadRecharts());
  const money = useMoney();
  return (
    <ChartContainer config={paceConfig} className="aspect-auto h-56 w-full sm:h-64">
      <R.AreaChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="pace-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-current)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-current)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <R.CartesianGrid vertical={false} strokeDasharray="3 3" />
        <R.XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(d: string) => shortDay.format(parseIso(d))}
        />
        <R.YAxis
          width={56}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => money(v, { compact: true })}
        />
        <R.Tooltip cursor={{ strokeDasharray: '3 3' }} content={PaceTooltip} />
        <R.Line
          dataKey="previous"
          type="monotone"
          stroke="var(--color-previous)"
          strokeOpacity={0.6}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
        <R.Area
          dataKey="current"
          type="monotone"
          stroke="var(--color-current)"
          strokeWidth={2.5}
          fill="url(#pace-fill)"
          connectNulls={false}
          animationDuration={1100}
          animationEasing="ease-out"
        />
      </R.AreaChart>
    </ChartContainer>
  );
}

function CategoryPie({ rows, config }: { rows: Slice[]; config: ChartConfig }) {
  const R = use(loadRecharts());
  return (
    <ChartContainer config={config} className="aspect-square h-40 shrink-0">
      <R.PieChart>
        <R.Pie
          data={rows.map((r) => ({ ...r, fill: r.color }))}
          dataKey="value"
          nameKey="name"
          innerRadius="68%"
          outerRadius="100%"
          paddingAngle={rows.length > 1 ? 2 : 0}
          strokeWidth={0}
          animationDuration={900}
        ></R.Pie>
      </R.PieChart>
    </ChartContainer>
  );
}
