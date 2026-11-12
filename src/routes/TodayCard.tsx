import { ArrowDownLeft, ArrowUpRight, CalendarCheck, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { buildReport } from '../../shared/report';
import { FitAmount } from '@/components/FitAmount';
import { EntryRow } from '@/components/EntryRow';
import { RowsSkeleton } from '@/components/Feedback';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuickAdd } from '@/context/quickAdd';
import { longFigures, useMoney } from '@/lib/format';
import { useAppData, useSavings, useTransactions, useWhish } from '@/lib/queries';
import { cn } from '@/lib/utils';

const SHOWN = 6;

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 font-semibold', tone)}>
        <FitAmount text={value} max="1.125rem" min="0.75rem" />
      </dd>
    </div>
  );
}

/** What happened today: totals and every entry, across spending, income, savings and Whish. */
export function TodayCard({ today, className }: { today: string; className?: string }) {
  const { categories } = useAppData();
  const money = useMoney();
  const { openNew } = useQuickAdd();
  const tx = useTransactions({ from: today, to: today });
  const savings = useSavings();
  const whish = useWhish();

  const report = useMemo(() => {
    if (!tx.data || !savings.data || !whish.data) return null;
    return buildReport({
      from: today,
      to: today,
      today,
      transactions: tx.data,
      savings: savings.data.items,
      transfers: whish.data.transfers,
      categories,
    });
  }, [tx.data, savings.data, whish.data, today, categories]);

  const reportLink = `/reports?range=custom&from=${today}&to=${today}`;
  const count = report?.entries.length ?? 0;

  return (
    <Card className={cn('gap-0 pb-0', className)} aria-labelledby="today-title">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-fg"
            aria-hidden="true"
          >
            <CalendarCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <CardTitle id="today-title" className="text-base">
              Today
            </CardTitle>
            <CardDescription>
              {report ? `${count} ${count === 1 ? 'entry' : 'entries'} so far` : 'Loading…'}
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to={reportLink}>
              Full Report <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>

      {report && (
        <dl
          className={cn(
            'grid gap-3 border-t px-6 py-4',
            longFigures([money(report.expenses), money(report.income), money(report.savings.net, { signed: true })])
              ? 'grid-cols-1'
              : 'grid-cols-3',
          )}
        >
          <Figure label="Spent" value={money(report.expenses)} />
          <Figure label="Earned" value={money(report.income)} tone={report.income > 0 ? 'text-income' : undefined} />
          <Figure
            label="Saved"
            value={money(report.savings.net, { signed: report.savings.net !== 0 })}
            tone={report.savings.net > 0 ? 'text-income' : undefined}
          />
        </dl>
      )}

      <div className="divide-y border-t">
        {!report ? (
          <RowsSkeleton rows={2} />
        ) : count === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">Nothing logged today yet.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="press" onClick={() => openNew('income')}>
                <ArrowDownLeft className="text-income" aria-hidden="true" /> Income
              </Button>
              <Button variant="outline" size="sm" className="press" onClick={() => openNew('expense')}>
                <ArrowUpRight className="text-expense" aria-hidden="true" /> Expense
              </Button>
            </div>
          </div>
        ) : (
          <>
            {report.entries.slice(0, SHOWN).map((e) => (
              <EntryRow key={`${e.kind}-${e.id}`} entry={e} categories={categories} today={today} showDate={false} />
            ))}
            {count > SHOWN && (
              <Link
                to={reportLink}
                className="flex min-h-12 items-center justify-center text-sm font-medium text-muted-foreground outline-none hover:bg-accent/60 hover:text-foreground focus-visible:bg-accent"
              >
                See all {count} entries from today
              </Link>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
