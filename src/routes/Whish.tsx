import { ArrowDownLeft, ArrowDownToLine, ArrowUpFromLine, Inbox, Loader2, Send, ShoppingBag } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { isValidIsoDate } from '../../shared/dates';
import type { Transaction, WhishKind, WhishTransfer } from '../../shared/schema';
import { signedTransfer } from '../../shared/whish';
import { FitAmount } from '@/components/FitAmount';
import { EmptyState, ErrorMessage, RowsSkeleton } from '@/components/Feedback';
import { Page, PageHeader } from '@/components/Layout';
import { MoneyInput } from '@/components/MoneyField';
import { ResponsiveSheet, SheetFooter } from '@/components/ResponsiveSheet';
import { Segmented } from '@/components/Segmented';
import { TransactionRow } from '@/components/TransactionRow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/context/confirm';
import { useQuickAdd } from '@/context/quickAdd';
import { useMoneyField } from '@/hooks/use-money-field';
import { formatDate, useMoney, useSecondMoney } from '@/lib/format';
import { useAppData, useDeleteWhish, useSaveWhish, useWhish } from '@/lib/queries';
import { localToday } from '@/lib/today';
import { cn, errorMessage } from '@/lib/utils';

const LOGO = '/whish-logo.png';

type Activity =
  | { kind: 'transfer'; date: string; at: string; item: WhishTransfer }
  | { kind: 'tx'; date: string; at: string; item: Transaction };

interface SheetState {
  open: boolean;
  nonce: number;
  kind: WhishKind;
  editing?: WhishTransfer;
}

export default function Whish() {
  const whish = useWhish();
  const money = useMoney();
  const second = useSecondMoney();
  const { openNew } = useQuickAdd();
  const [sheet, setSheet] = useState<SheetState>({ open: false, nonce: 0, kind: 'deposit' });
  const openTransfer = (kind: WhishKind, editing?: WhishTransfer) =>
    setSheet({ open: true, nonce: Date.now(), kind, editing });
  const close = () => setSheet((s) => ({ ...s, open: false }));

  const balance = whish.data?.balance ?? 0;
  const actions = [
    { label: 'Top Up', icon: ArrowDownToLine, onClick: () => openTransfer('deposit') },
    { label: 'Send', icon: Send, onClick: () => openNew('expense', { account: 'whish', send: true }) },
    { label: 'Pay', icon: ShoppingBag, onClick: () => openNew('expense', { account: 'whish' }) },
    { label: 'Withdraw', icon: ArrowUpFromLine, onClick: () => openTransfer('withdrawal') },
  ];

  return (
    <Page>
      <PageHeader title="Whish Money" subtitle="Your Whish wallet: top it up from cash, then send, pay or cash out." />
      <div className="stagger mx-auto grid max-w-3xl gap-4 lg:mx-0">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-3">
              <img src={LOGO} alt="Whish Money" width={44} height={44} className="size-11 rounded-xl shadow-sm" />
              <div className="min-w-0">
                <CardTitle className="text-base">Whish Balance</CardTitle>
                <CardDescription>Money in your Whish account</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div aria-live="polite">
              {whish.data ? (
                <>
                  <div className={cn('font-bold tracking-tight', balance < 0 && 'text-destructive')}>
                    <FitAmount text={money(balance)} max="3rem" min="1.25rem" />
                  </div>
                  <p className="tabular mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    ≈ {second(balance)}
                  </p>
                  {balance < 0 && (
                    <p className="mt-3 text-sm text-destructive" role="status">
                      A recurring Whish payment ran without enough money in the wallet. Top up to cover it.
                    </p>
                  )}
                </>
              ) : whish.isError ? null : (
                <Skeleton className="h-12 w-56" />
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {actions.map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="press flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border bg-muted/40 px-1 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-whish text-white">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  {label}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="-mt-2 text-muted-foreground"
              onClick={() => openNew('income', { account: 'whish' })}
            >
              <ArrowDownLeft className="text-income" aria-hidden="true" /> Record money received into Whish
            </Button>
          </CardContent>
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Activity</CardTitle>
            <CardDescription>Top-ups, withdrawals and everything paid or received with Whish.</CardDescription>
          </CardHeader>
          <div className="divide-y border-t">
            {whish.isError ? (
              <ErrorMessage error={whish.error} onRetry={() => void whish.refetch()} />
            ) : !whish.data ? (
              <RowsSkeleton rows={4} />
            ) : (
              <ActivityList
                transfers={whish.data.transfers}
                transactions={whish.data.transactions}
                onEdit={openTransfer}
              />
            )}
          </div>
        </Card>
      </div>

      <ResponsiveSheet
        open={sheet.open}
        onClose={close}
        title={
          sheet.editing ? 'Edit Whish Transfer' : sheet.kind === 'deposit' ? 'Top Up Whish' : 'Withdraw From Whish'
        }
      >
        <TransferForm
          key={sheet.nonce}
          initialKind={sheet.kind}
          editing={sheet.editing}
          balance={balance}
          onDone={close}
        />
      </ResponsiveSheet>
    </Page>
  );
}

function ActivityList({
  transfers,
  transactions,
  onEdit,
}: {
  transfers: WhishTransfer[];
  transactions: Transaction[];
  onEdit: (kind: WhishKind, editing: WhishTransfer) => void;
}) {
  const { categories } = useAppData();
  const money = useMoney();
  const second = useSecondMoney();
  const today = localToday();
  const byId = new Map([...categories.expense, ...categories.income].map((c) => [c.id, c]));
  const items: Activity[] = [
    ...transfers.map((item) => ({ kind: 'transfer' as const, date: item.date, at: item.createdAt, item })),
    ...transactions.map((item) => ({ kind: 'tx' as const, date: item.date, at: item.createdAt, item })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));

  if (items.length === 0) {
    return (
      <EmptyState icon={Inbox} title="No Whish Activity Yet">
        Top up your wallet, then send or pay with Whish to see it here.
      </EmptyState>
    );
  }
  return items.map((a) => {
    if (a.kind === 'tx') {
      return (
        <TransactionRow key={a.item.id} transaction={a.item} category={byId.get(a.item.categoryId)} today={today} />
      );
    }
    const e = a.item;
    const deposit = e.kind === 'deposit';
    const label = deposit ? 'Top up from cash' : 'Withdrawn to cash';
    const signed = signedTransfer(e);
    return (
      <button
        key={e.id}
        type="button"
        onClick={() => onEdit(e.kind, e)}
        aria-label={`${label} ${money(e.amount)}${e.note ? `, ${e.note}` : ''}, ${formatDate(e.date, today)}. Edit`}
        className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent"
      >
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full',
            deposit ? 'bg-income/15 text-income' : 'bg-muted text-muted-foreground',
          )}
          aria-hidden="true"
        >
          {deposit ? <ArrowDownToLine className="size-4" /> : <ArrowUpFromLine className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{e.note ?? label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[e.note ? label : null, formatDate(e.date, today)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="row-amount flex flex-col items-end" aria-hidden="true">
          <span className={cn('tabular font-semibold', deposit && 'text-income')}>
            {signed > 0 ? '+' : '−'}
            {money(e.amount)}
          </span>
          <span className="tabular text-xs text-muted-foreground">{second(e.amount)}</span>
        </span>
      </button>
    );
  });
}

const KINDS = [
  { value: 'deposit', label: 'Top Up' },
  { value: 'withdrawal', label: 'Withdraw' },
] as const;

function TransferForm({
  initialKind,
  editing,
  balance,
  onDone,
}: {
  initialKind: WhishKind;
  editing?: WhishTransfer;
  balance: number;
  onDone: () => void;
}) {
  const money = useMoney();
  const save = useSaveWhish();
  const remove = useDeleteWhish();
  const confirm = useConfirm();
  const ids = { amount: useId(), amountHint: useId(), date: useId(), note: useId() };
  const [kind, setKind] = useState<WhishKind>(editing?.kind ?? initialKind);
  const amount = useMoneyField(editing?.amount);
  const [date, setDate] = useState(editing?.date ?? localToday());
  const [note, setNote] = useState(editing?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  // What can be withdrawn: the balance, plus this transfer's own effect when editing it.
  const available = balance - (editing ? signedTransfer(editing) : 0);

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = amount.stored();
    const next: Record<string, string> = {};
    if (cents === null) next.amount = 'Enter an amount greater than zero';
    else if (kind === 'withdrawal' && cents > available) {
      next.amount = `You only have ${money(Math.max(0, available))} in Whish`;
    }
    if (!isValidIsoDate(date)) next.date = 'Pick a valid date';
    setErrors(next);
    if (cents === null || Object.keys(next).length > 0) {
      document.getElementById(next.amount ? ids.amount : ids.date)?.focus();
      return;
    }
    try {
      await save.mutateAsync({ id: editing?.id, input: { kind, amount: cents, date, note: note.trim() || undefined } });
      toast.success(
        editing
          ? 'Whish transfer updated'
          : kind === 'deposit'
            ? `Added ${money(cents)} to Whish`
            : `Withdrew ${money(cents)} from Whish`,
      );
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t save. Check your connection and try again.'));
    }
  }

  async function onDelete() {
    if (!editing) return;
    const ok = await confirm({
      title: 'Delete This Transfer?',
      message: 'Your Whish balance will be updated. This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(editing.id);
      toast.success('Transfer deleted');
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t delete. Check your connection and try again.'));
    }
  }

  return (
    <form className="space-y-5 pt-1" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Segmented fill aria-label="Transfer type" value={kind} onValueChange={setKind} items={[...KINDS]} />
      <div className="space-y-2">
        <Label htmlFor={ids.amount}>Amount</Label>
        <MoneyInput id={ids.amount} hintId={ids.amountHint} name="amount" field={amount} error={errors.amount} />
        {errors.amount ? (
          <p id={`${ids.amount}-error`} className="text-sm text-destructive" role="alert">
            {errors.amount}
          </p>
        ) : (
          kind === 'withdrawal' && (
            <p className="text-sm text-muted-foreground">{money(Math.max(0, available))} available in Whish</p>
          )
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
        <div className="space-y-2">
          <Label htmlFor={ids.date}>Date</Label>
          <Input
            id={ids.date}
            type="date"
            name="date"
            autoComplete="off"
            value={date}
            aria-invalid={Boolean(errors.date)}
            onChange={(e) => setDate(e.target.value)}
            className="h-11"
          />
          {errors.date && <p className="text-sm text-destructive">{errors.date}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.note}>
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={ids.note}
            name="note"
            maxLength={280}
            autoComplete="off"
            placeholder={kind === 'deposit' ? 'e.g. Agent in Hamra…' : 'e.g. Branch cash-out…'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11"
          />
        </div>
      </div>
      <SheetFooter>
        {editing && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-destructive hover:text-destructive"
            onClick={() => void onDelete()}
            disabled={remove.isPending}
          >
            Delete
          </Button>
        )}
        <Button type="submit" className="press h-11 flex-1 text-base" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {editing ? 'Save Changes' : kind === 'deposit' ? 'Top Up' : 'Withdraw'}
        </Button>
      </SheetFooter>
    </form>
  );
}
