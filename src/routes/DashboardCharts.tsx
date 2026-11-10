import { Suspense, use, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import type { TooltipContentProps } from 'recharts';
import type { Slice } from '../../shared/budget';
import { parseIso } from '../../shared/dates';
import { formatPercent } from '../../shared/money';
import type { Transaction } from '../../shared/schema';
import { spendingPace } from '../../shared/series';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useMoney } from '@/lib/format';
import { WhenVisible } from '@/components/WhenVisible';
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
  let sentence = spent === 0 && before === 0 ? 'Nothing spent yet this period.' : `${money(spent)} spent so far.`;
  if (before > 0 && diff === 0) sentence = `${money(spent)} spent, the same as this point last period.`;
  else if (before > 0) {
    sentence = `${money(spent)} spent, ${money(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'} than this point last period.`;
  }

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="text-base">Spending Pace</CardTitle>
        <CardDescription>{sentence}</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/history?range=custom&from=${cur.from}&to=${cur.to}&type=expense`}>Details</Link>
          </Button>
        </CardAction>
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
        <WhenVisible fallback={<Skeleton className="h-56 w-full sm:h-64" />}>
          <Suspense fallback={<Skeleton className="h-56 w-full sm:h-64" />}>
            <PaceChart points={points} />
          </Suspense>
        </WhenVisible>
      </CardContent>
    </Card>
  );
}

function PaceTooltip({ active, payload, label }: TooltipContentProps) {
  const money = useMoney();
  if (!active || payload.length === 0) return null;
  const value = (key: string) => {
    const v = payload.find((p) => p.dataKey === key)?.value;
    return typeof v === 'number' ? v : null;
  };
  const cur = value('current');
  const prev = value('previous');
  const diff = cur !== null && prev !== null ? cur - prev : null;
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="font-medium">{typeof label === 'string' ? shortDay.format(parseIso(label)) : ''}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-0.5 w-3 rounded bg-expense" /> This period
        </span>
        <span className="tabular font-medium">{cur === null ? 'Not yet' : money(cur)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="w-3 border-t border-dashed border-muted-foreground" /> Previous
        </span>
        <span className="tabular font-medium">{prev === null ? '—' : money(prev)}</span>
      </div>
      {diff !== null && diff !== 0 && (
        <p className={cn('border-t pt-1.5 font-medium', diff > 0 ? 'text-expense' : 'text-income')}>
          {money(Math.abs(diff))} {diff > 0 ? 'more' : 'less'} than last period
        </p>
      )}
    </div>
  );
}

export function CategoryCard({
  title,
  empty,
  slices,
  total,
  range,
  type,
  className,
}: {
  title: string;
  /** Which transactions the card's "View All" opens in History. */
  type: 'income' | 'expense';
  empty: string;
  slices: Slice[];
  total: number;
  /** Date range the card covers; legend rows link to History filtered to it. */
  range: Range;
  className?: string;
}) {
  const money = useMoney();
  const [active, setActive] = useState<string | null>(null);
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
  const focused = rows.find((r) => r.id === active);

  return (
    <Card className={cn('@container', className)}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{total > 0 ? `${money(total)} in total` : empty}</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/history?range=custom&from=${range.from}&to=${range.to}&type=${type}`}>View All</Link>
          </Button>
        </CardAction>
      </CardHeader>
      {total > 0 && (
        <CardContent className="flex flex-col items-center gap-6 @lg:flex-row">
          <div className="relative size-40 shrink-0">
            <WhenVisible fallback={<Skeleton className="size-40 rounded-full" />}>
              <Suspense fallback={<Skeleton className="size-40 rounded-full" />}>
                <CategoryPie rows={rows} config={config} active={active} onActive={setActive} />
              </Suspense>
            </WhenVisible>
            {/* Centre label: the hovered/tapped slice, otherwise the total. */}
            <div
              className="pointer-events-none absolute inset-0 grid place-items-center text-center"
              aria-live="polite"
            >
              <div className="max-w-24">
                <p className="truncate text-xs text-muted-foreground">{focused ? focused.name : 'Total'}</p>
                <p className="tabular text-sm font-bold">{money(focused ? focused.value : total, { compact: true })}</p>
                {focused && <p className="tabular text-xs text-muted-foreground">{formatPercent(focused.share)}</p>}
              </div>
            </div>
          </div>
          <ul className="w-full min-w-0 space-y-1" onMouseLeave={() => setActive(null)}>
            {rows.map((r) => {
              const dim = active !== null && active !== r.id;
              const inner = (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="size-2.5 shrink-0 rounded-full bg-(--dot)"
                      style={{ '--dot': r.color } as CSSProperties}
                    />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground group-hover:text-foreground">
                      {r.name}
                    </span>
                    <span className="tabular font-medium">{money(r.value)}</span>
                    <span className="tabular w-10 text-right text-xs text-muted-foreground">
                      {formatPercent(r.share)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="grow-x h-full rounded-full bg-(--dot)"
                      style={{ width: `${r.share * 100}%`, '--dot': r.color } as CSSProperties}
                    />
                  </div>
                </>
              );
              const rowClass = cn(
                'group block rounded-md px-2 py-1.5 transition-[background-color,opacity] outline-none',
                dim && 'opacity-45',
                active === r.id && 'bg-accent',
              );
              return (
                <li key={r.id}>
                  {r.id === 'rest' ? (
                    <div className={rowClass} onMouseEnter={() => setActive(r.id)}>
                      {inner}
                    </div>
                  ) : (
                    <Link
                      to={`/history?range=custom&from=${range.from}&to=${range.to}&category=${encodeURIComponent(r.id)}`}
                      className={cn(rowClass, 'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50')}
                      onMouseEnter={() => setActive(r.id)}
                      onFocus={() => setActive(r.id)}
                      onBlur={() => setActive(null)}
                      aria-label={`${r.name}: ${money(r.value)}, ${formatPercent(r.share)}. View transactions`}
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

function PaceChart({ points }: { points: ReturnType<typeof spendingPace> }) {
  const R = use(loadRecharts());
  const money = useMoney();
  const today = points.filter((p) => p.current !== null && p.current > 0).at(-1);
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
          tickCount={4}
          allowDecimals={false}
          // With no spending yet, keep a sensible scale instead of repeating "$0".
          domain={[0, (max: number) => (max > 0 ? max : 10_000)]}
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
          activeDot={{ r: 3.5, fill: 'var(--color-previous)', strokeWidth: 0 }}
          isAnimationActive={false}
        />
        <R.Area
          dataKey="current"
          type="monotone"
          stroke="var(--color-current)"
          strokeWidth={2.5}
          fill="url(#pace-fill)"
          connectNulls={false}
          activeDot={{ r: 5, fill: 'var(--color-current)', stroke: 'var(--card)', strokeWidth: 2 }}
          isAnimationActive={false}
          animationEasing="ease-out"
        />
        {today && (
          <R.ReferenceDot
            x={today.date}
            y={today.current ?? 0}
            r={0}
            ifOverflow="extendDomain"
            shape={(props: { cx?: number; cy?: number }) => (
              <g transform={`translate(${props.cx ?? 0} ${props.cy ?? 0})`}>
                <circle
                  r={9}
                  fill="var(--color-current)"
                  opacity={0.35}
                  className="animate-ping [animation-iteration-count:3] [transform-box:fill-box] [transform-origin:center] motion-reduce:animate-none"
                />
                <circle r={4.5} fill="var(--color-current)" stroke="var(--card)" strokeWidth={2} />
              </g>
            )}
          />
        )}
      </R.AreaChart>
    </ChartContainer>
  );
}

function CategoryPie({
  rows,
  config,
  active,
  onActive,
}: {
  rows: Slice[];
  config: ChartConfig;
  active: string | null;
  onActive: (id: string | null) => void;
}) {
  const R = use(loadRecharts());
  const data = rows.map((r) => ({
    ...r,
    // Dim the others while one slice is focused.
    fill: active === null || active === r.id ? r.color : `color-mix(in oklch, ${r.color} 30%, transparent)`,
  }));
  return (
    <ChartContainer config={config} className="aspect-square size-40" onMouseLeave={() => onActive(null)}>
      <R.PieChart>
        <R.Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="68%"
          outerRadius="96%"
          paddingAngle={rows.length > 1 ? 2 : 0}
          strokeWidth={0}
          isAnimationActive={false}
          className="cursor-pointer"
          onMouseEnter={(_: unknown, index: number) => onActive(rows[index]?.id ?? null)}
          // Tap on touch screens toggles the slice.
          onClick={(_: unknown, index: number) => {
            const id = rows[index]?.id ?? null;
            onActive(active === id ? null : id);
          }}
        />
      </R.PieChart>
    </ChartContainer>
  );
}
