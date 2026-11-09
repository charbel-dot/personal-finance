import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { keys, useMe } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function Login() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const ids = { user: useId(), pass: useId(), error: useId(), remember: useId(), caps: useId() };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (me.data?.authenticated) return <Navigate to={from} replace />;

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.login({ username: username.trim(), password, remember });
      await qc.invalidateQueries({ queryKey: keys.me });
      void navigate(from.startsWith('/') && !from.startsWith('//') ? from : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
      setPassword('');
    } finally {
      setPending(false);
    }
  }

  const trackCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'));

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Showcase />

      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm animate-in duration-500 fade-in slide-in-from-bottom-3">
          <div className="mb-8 lg:hidden" aria-hidden="true">
            <div className="flex items-center gap-3">
              <Logo />
              <span className="text-lg font-bold tracking-wide">MONEY</span>
            </div>
            <div className="mt-6 rounded-2xl border bg-card p-4 shadow-sm [animation:float_6s_ease-in-out_infinite]">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">This month</span>
                <span className="text-xs font-medium text-income">+12%</span>
              </div>
              <Sparkline className="mt-2 h-12" />
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-muted-foreground">Sign in to see where your money went.</p>

          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => void onSubmit(e)}
            noValidate
            aria-describedby={error ? ids.error : undefined}
          >
            {error && (
              <div
                id={ids.error}
                role="alert"
                className="animate-in rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive fade-in"
              >
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={ids.user}>Username</Label>
              <Input
                id={ids.user}
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.pass}>Password</Label>
              <div className="relative">
                <Input
                  id={ids.pass}
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={trackCaps}
                  onKeyDown={trackCaps}
                  aria-describedby={capsLock ? ids.caps : undefined}
                  className="h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {capsLock && (
                <p id={ids.caps} className="text-xs text-warning">
                  Caps Lock is on.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <Checkbox id={ids.remember} checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
              <Label htmlFor={ids.remember} className="font-normal">
                Keep me signed in for 30 days
              </Label>
            </div>
            <Button type="submit" className="press h-11 w-full text-base" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="size-3.5 shrink-0" aria-hidden="true" />
            Private to you. Sessions are encrypted and sign-in attempts are rate limited.
          </p>
        </div>
      </div>
    </main>
  );
}

/** Desktop-only left panel: a live-feeling preview of the product, drawn in code. */
function Showcase() {
  const bars = [
    { name: 'Housing', pct: 72, color: 'var(--chart-3)' },
    { name: 'Groceries', pct: 46, color: 'var(--chart-1)' },
    { name: 'Dining out', pct: 28, color: 'var(--chart-2)' },
  ];
  return (
    <section
      aria-hidden="true"
      className="relative hidden overflow-hidden border-r bg-card lg:flex lg:flex-col lg:justify-between lg:p-12"
    >
      <div className="flex items-center gap-3">
        <Logo />
        <span className="text-lg font-bold tracking-wide">MONEY</span>
      </div>

      <div className="mx-auto w-full max-w-md">
        <p className="text-4xl leading-tight font-semibold tracking-tight text-balance">
          Every dollar in, every dollar out — in seconds.
        </p>

        <div className="mt-10 rounded-2xl border bg-background p-6 shadow-xl [animation:float_6s_ease-in-out_infinite]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Current balance</span>
            <span className="text-xs font-medium text-income">+12% vs last month</span>
          </div>
          <p className="tabular mt-1 text-3xl font-bold text-income">$4,820.50</p>
          <Sparkline className="mt-4 h-20" />
          <div className="mt-5 space-y-3">
            {bars.map((b, i) => (
              <div key={b.name} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{b.name}</span>
                  <span className="tabular">{b.pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="grow-x h-full rounded-full"
                    style={{ width: `${b.pct}%`, background: b.color, animationDelay: `${400 + i * 120}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">Your data lives in your own private Cloudflare storage.</p>
    </section>
  );
}

function Sparkline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 80"
      className={cn('w-full overflow-visible', className)}
      fill="none"
      preserveAspectRatio="none"
    >
      <path
        d="M0 64 C 30 60, 45 40, 75 44 S 120 62, 150 40 S 200 18, 225 26 S 270 10, 300 6"
        stroke="var(--income)"
        strokeWidth="2.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="[stroke-dasharray:1000] [animation:draw_1.8s_var(--ease-out-expo)_0.3s_both] [--len:1000]"
      />
      <path
        d="M0 70 C 40 68, 70 58, 110 60 S 170 52, 210 46 S 260 40, 300 36"
        stroke="var(--muted-foreground)"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeDasharray="4 5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
