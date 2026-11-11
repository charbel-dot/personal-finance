import { Eye, EyeOff, KeyRound, Loader2, Trash2, UserPlus, Users } from 'lucide-react';
import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { newPassword, newUserInput, type UserSummary } from '../../shared/schema';
import { ResponsiveSheet, SheetFooter } from './ResponsiveSheet';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/context/confirm';
import { useChangePassword, useCreateUser, useDeleteUser, useResetPassword, useUsers } from '@/lib/queries';

const added = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** Owner only: everyone who can sign in, each with their own private data. */
export function PeopleCard() {
  const users = useUsers(true);
  const remove = useDeleteUser();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<UserSummary | null>(null);

  async function onRemove(user: UserSummary) {
    const ok = await confirm({
      title: `Remove ${user.username}?`,
      message: `Their account and all of their transactions, recurring entries, savings and settings are deleted. This can’t be undone.`,
      confirmLabel: 'Remove User',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(user.id);
      toast.success(`${user.username} removed`);
    } catch (err) {
      toast.error(message(err, 'Couldn’t remove the user. Try again.'));
    }
  }

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-brand-fg" aria-hidden="true" /> People
        </CardTitle>
        <CardDescription>
          Everyone signs in with their own username and password and only ever sees their own money.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden="true" /> Add User
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {users.isPending ? (
          <Skeleton className="h-14" />
        ) : users.isError ? (
          <p className="text-sm text-destructive">{message(users.error, 'Couldn’t load users.')}</p>
        ) : users.data.length === 0 ? (
          <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
            Only you so far. Add a user to give someone their own private account.
          </p>
        ) : (
          <ul className="space-y-2">
            {users.data.map((user) => (
              <li key={user.id} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-accent font-semibold"
                  aria-hidden="true"
                >
                  {user.username.at(0)?.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" translate="no">
                    {user.username}
                  </p>
                  <p className="text-xs text-muted-foreground">Added {added.format(new Date(user.createdAt))}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label={`Reset password for ${user.username}`}
                  onClick={() => setResetting(user)}
                >
                  <KeyRound aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 text-destructive hover:text-destructive"
                  aria-label={`Remove ${user.username}`}
                  disabled={remove.isPending}
                  onClick={() => void onRemove(user)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ResponsiveSheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add User"
        description="They get their own empty account, with the walkthrough on their first sign-in."
      >
        <AddUserForm onDone={() => setAdding(false)} />
      </ResponsiveSheet>

      <ResponsiveSheet
        open={resetting !== null}
        onClose={() => setResetting(null)}
        title="Reset Password"
        description={resetting ? `Signs ${resetting.username} out everywhere. Share the new password with them.` : ''}
      >
        {resetting && <ResetForm user={resetting} onDone={() => setResetting(null)} />}
      </ResponsiveSheet>
    </Card>
  );
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const create = useCreateUser();
  const ids = { user: useId(), pass: useId(), error: useId() };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = newUserInput.safeParse({ username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details');
      return;
    }
    setError(null);
    try {
      const user = await create.mutateAsync(parsed.data);
      toast.success(`${user.username} can now sign in`);
      onDone();
    } catch (err) {
      setError(message(err, 'Couldn’t create the user. Try again.'));
    }
  }

  return (
    <form className="space-y-5 pt-1" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field id={ids.user} label="Username" hint="Letters, numbers, dots, dashes or underscores.">
        <Input
          id={ids.user}
          name="username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="e.g. sam…"
          value={username}
          aria-describedby={error ? ids.error : undefined}
          onChange={(e) => setUsername(e.target.value)}
          className="h-11"
        />
      </Field>
      <Field id={ids.pass} label="Password" hint="At least 8 characters. They can change it later.">
        <PasswordInput id={ids.pass} value={password} onChange={setPassword} />
      </Field>
      {error && (
        <p id={ids.error} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <SheetFooter>
        <Button type="submit" className="press h-11 flex-1 text-base" disabled={create.isPending}>
          {create.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Create User
        </Button>
      </SheetFooter>
    </form>
  );
}

function ResetForm({ user, onDone }: { user: UserSummary; onDone: () => void }) {
  const reset = useResetPassword();
  const id = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = newPassword.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the password');
      return;
    }
    setError(null);
    try {
      await reset.mutateAsync({ id: user.id, password: parsed.data });
      toast.success(`Password updated for ${user.username}`);
      onDone();
    } catch (err) {
      setError(message(err, 'Couldn’t update the password. Try again.'));
    }
  }

  return (
    <form className="space-y-5 pt-1" onSubmit={(e) => void onSubmit(e)} noValidate>
      <Field id={id} label="New Password" hint="At least 8 characters.">
        <PasswordInput id={id} value={password} onChange={setPassword} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <SheetFooter>
        <Button type="submit" className="press h-11 flex-1 text-base" disabled={reset.isPending}>
          {reset.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Set Password
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Member only: change your own password. Other devices are signed out; this one stays in. */
export function ChangePasswordCard() {
  const change = useChangePassword();
  const ids = { current: useId(), next: useId() };
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!current) {
      setError('Enter your current password');
      return;
    }
    const parsed = newPassword.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the new password');
      return;
    }
    setError(null);
    try {
      await change.mutateAsync({ current, next: parsed.data });
      setCurrent('');
      setNext('');
      toast.success('Password changed', { description: 'Other devices have been signed out.' });
    } catch (err) {
      setError(message(err, 'Couldn’t change the password. Try again.'));
    }
  }

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-brand-fg" aria-hidden="true" /> Change Password
        </CardTitle>
        <CardDescription>Signs you out on every other device.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => void onSubmit(e)}
          noValidate
        >
          <Field id={ids.current} label="Current Password">
            <PasswordInput id={ids.current} value={current} onChange={setCurrent} autoComplete="current-password" />
          </Field>
          <Field id={ids.next} label="New Password">
            <PasswordInput id={ids.next} value={next} onChange={setNext} />
          </Field>
          <Button type="submit" className="h-11" disabled={change.isPending}>
            {change.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Change Password
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-3">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = 'new-password',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
