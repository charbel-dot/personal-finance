import {
  CalendarDays,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileJson,
  KeyRound,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { parseIso } from '../../shared/dates';
import type { Transaction } from '../../shared/schema';
import { Page, PageHeader } from '@/components/Layout';
import { ChangePasswordCard, PeopleCard } from '@/components/People';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountUp } from '@/hooks/use-count-up';
import { useSignOut } from '@/hooks/use-sign-out';
import { useMoney } from '@/lib/format';
import { APP_VERSION } from '@/lib/pwa';
import { csvField, download } from '@/lib/export';
import { useAppData, useBalance, useMe, useSavings, useTransactions, useWhish } from '@/lib/queries';

const longDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeFromNow(epochSeconds: number) {
  const days = Math.round((epochSeconds * 1000 - Date.now()) / 86_400_000);
  if (Math.abs(days) >= 1) return relative.format(days, 'day');
  const hours = Math.round((epochSeconds * 1000 - Date.now()) / 3_600_000);
  return relative.format(hours, 'hour');
}

export default function Account() {
  const me = useMe();
  const signOut = useSignOut();
  const session = me.data?.authenticated ? me.data : null;
  const initial = (session?.username.at(0) ?? '?').toUpperCase();
  const isOwner = session?.role === 'owner';

  return (
    <Page>
      <PageHeader title="Account" subtitle={`Your profile, session and data · App version ${APP_VERSION}`} />
      <div className="stagger grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardContent className="flex flex-wrap items-center gap-4">
            <span
              className="grid size-14 shrink-0 place-items-center rounded-full bg-brand text-2xl font-bold text-brand-ink"
              aria-hidden="true"
            >
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xl font-semibold" translate="no">
                {session?.username ?? <Skeleton className="h-6 w-32" />}
              </div>
              <p className="text-sm text-muted-foreground">
                {session
                  ? isOwner
                    ? 'Owner · manages who can sign in'
                    : 'Member · your data is private to you'
                  : null}
              </p>
            </div>
            <Button variant="outline" onClick={() => void signOut()}>
              <LogOut aria-hidden="true" /> Sign Out
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-income" aria-hidden="true" /> This Session
            </CardTitle>
            <CardDescription>Signed in on this device.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {session ? (
              <>
                <Fact icon={<Clock className="size-4" />} label="Signed in">
                  {dateTime.format(session.issuedAt * 1000)}
                </Fact>
                <Fact icon={<CalendarDays className="size-4" />} label="Expires">
                  {session.remember
                    ? `${dateTime.format(session.expiresAt * 1000)} (${relativeFromNow(session.expiresAt)})`
                    : 'When you close the browser'}
                </Fact>
                <Fact icon={<KeyRound className="size-4" />} label="Remember me">
                  {session.remember ? 'On (30 days, renews as you use it)' : 'Off'}
                </Fact>
              </>
            ) : (
              <Skeleton className="h-20" />
            )}
          </CardContent>
        </Card>

        <DataCard />

        {isOwner && <PeopleCard />}

        {session && !isOwner && <ChangePasswordCard />}

        {isOwner && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4 text-brand-fg" aria-hidden="true" /> Change Password
              </CardTitle>
              <CardDescription>
                The password lives as a Cloudflare secret, never in the app. Changing it signs out every device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-inside list-decimal space-y-2 text-sm">
                <li>
                  In the project folder, run <Code>node scripts/hash-password.mjs</Code> and enter the new password.
                </li>
                <li>
                  Store the printed hash with{' '}
                  <Code>npx wrangler pages secret put AUTH_PASSWORD_HASH --project-name money-app</Code>
                </li>
                <li>
                  Redeploy with <Code>npm run deploy</Code>.
                </li>
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground">{label}</p>
        <p className="font-medium break-words">{children}</p>
      </div>
    </div>
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied');
  } catch {
    toast.error('Couldn’t copy. Select the text and copy it manually.');
  }
}

function Code({ children }: { children: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle">
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">{children}</code>
      <button
        type="button"
        aria-label={`Copy: ${children}`}
        onClick={() => void copy(children)}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Copy className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

function Stat({
  label,
  value,
  format,
  to,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  to: string;
}) {
  const shown = useCountUp(value);
  return (
    <Link
      to={to}
      className="group block rounded-xl bg-muted/50 p-3 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
        {label}
        <ChevronRight
          className="size-3.5 opacity-50 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
      <span className="tabular mt-1 block text-xl font-semibold">{format ? format(shown) : shown}</span>
    </Link>
  );
}

function DataCard() {
  const { categories, recurring, settings } = useAppData();
  const money = useMoney();
  const all = useTransactions(null);
  const savings = useSavings();
  const whish = useWhish();
  const balance = useBalance();
  const items = useMemo(() => all.data ?? [], [all.data]);
  const months = new Set(items.map((t) => t.date.slice(0, 7))).size;
  const first = items.at(-1)?.date;

  function exportCsv(list: Transaction[]) {
    const byId = new Map([...categories.expense, ...categories.income].map((c) => [c.id, c.name]));
    const rows = [
      ['date', 'type', 'category', `amount (${settings.currency})`, 'note', 'recurring', 'account', 'sent to'],
      ...list.map((t) => [
        t.date,
        t.type,
        byId.get(t.categoryId) ?? t.categoryId,
        (t.amount / 100).toFixed(2),
        t.note ?? '',
        t.recurringId ? 'yes' : '',
        t.account === 'whish' ? 'Whish Money' : 'Cash',
        t.to ?? '',
      ]),
    ];
    download(
      `money-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => r.map(csvField).join(',')).join('\n'),
      'text/csv',
    );
    toast.success(`Exported ${list.length} transactions`);
  }

  function exportJson(list: Transaction[]) {
    const data = {
      exportedAt: new Date().toISOString(),
      settings,
      categories,
      recurring,
      transactions: list,
      savings: savings.data ?? { items: [], goals: [] },
      whish: { transfers: whish.data?.transfers ?? [] },
    };
    download(`money-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast.success('Backup downloaded');
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Your Data</CardTitle>
        <CardDescription>
          {first ? `Tracking since ${longDate.format(parseIso(first))}.` : 'Nothing logged yet.'} Stored privately and
          visible only to you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {all.isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Transactions" to="/history?range=all" value={items.length} />
            <Stat label="Months tracked" to="/history?range=all" value={months} />
            <Stat label="Recurring" to="/recurring" value={recurring.filter((r) => !r.paused).length} />
            <Stat
              label="Categories"
              to="/categories"
              value={[...categories.expense, ...categories.income].filter((c) => !c.archived).length}
            />
            <Stat
              label="All-time income"
              to="/history?range=all&type=income"
              value={balance.data?.income ?? 0}
              format={(n) => money(n, { compact: true })}
            />
            <Stat
              label="All-time spent"
              to="/history?range=all&type=expense"
              value={balance.data?.expenses ?? 0}
              format={(n) => money(n, { compact: true })}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!all.data} onClick={() => exportCsv(items)}>
            <Download aria-hidden="true" /> Export CSV
          </Button>
          <Button
            variant="outline"
            disabled={!all.data || !savings.data || !whish.data}
            onClick={() => exportJson(items)}
          >
            <FileJson aria-hidden="true" /> Download Backup (JSON)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
