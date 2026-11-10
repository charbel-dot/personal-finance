import {
  CircleUserRound,
  History,
  House,
  LogOut,
  PiggyBank,
  Plus,
  Repeat,
  Settings,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import { Suspense, useEffect, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Button as GlassButton } from 'glisse';
import { ErrorBoundary } from './ErrorBoundary';
import { GlassTabBar } from './Segmented';
import { Logo } from './Logo';
import { Walkthrough } from './Walkthrough';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuickAdd } from '@/context/quickAdd';
import { useSignOut } from '@/hooks/use-sign-out';
import { cn } from '@/lib/utils';

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/history', label: 'History', icon: History },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/savings', label: 'Savings', icon: PiggyBank },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/account', label: 'Account', icon: CircleUserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
];
/** Phone top bar: the destinations that don't fit in the bottom bar. */
const TOP_NAV = ['/categories', '/account', '/settings'];
/** Phone bottom bar: four destinations around the add button. */
const BOTTOM_NAV = NAV.filter((n) => !TOP_NAV.includes(n.to));

export function PageFallback() {
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-4 px-4 pt-8 sm:px-6 lg:px-10"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-44 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

/** Page title row. `actions` sit to the right on wide screens and wrap below on phones. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-5 pb-4 md:pt-8 md:pb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 lg:px-10', className)}>{children}</div>;
}

export function Layout() {
  const location = useLocation();
  const { openNew } = useQuickAdd();
  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));
  const signOut = useSignOut();

  // Keyboard shortcut: "n" opens quick add (ignored while typing or when a dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      openNew('expense');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openNew]);

  return (
    <div className="min-h-dvh md:pl-64">
      <div className="app-backdrop" aria-hidden="true" />
      <a
        href="#main"
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:translate-y-0"
      >
        Skip to Content
      </a>

      {/* Desktop sidebar */}
      <aside
        className="glass-chrome fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r md:flex"
        aria-label="Sidebar"
      >
        <div className="flex h-20 items-center gap-3 border-b px-6">
          <Logo />
          <span className="text-lg font-bold tracking-wide" translate="no">
            MONEY
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <Button
            data-tour="add"
            className="press mb-3 h-11 justify-start gap-2 text-sm"
            onClick={() => openNew('expense')}
          >
            <Plus className="size-5" aria-hidden="true" />
            New Transaction
            <kbd className="ml-auto rounded border border-primary-foreground/20 px-1.5 text-[11px] font-medium opacity-70">
              N
            </kbd>
          </Button>
          <nav aria-label="Main" className="flex flex-col gap-1" data-tour="nav">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                data-tour={to === '/settings' ? 'settings' : undefined}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors outline-none',
                    'hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    isActive && 'bg-accent text-foreground',
                  )
                }
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t pt-3">
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <LogOut className="size-5" aria-hidden="true" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Phone top bar: product mark + categories, account, settings */}
      <header className="glass-chrome sticky top-0 z-30 flex min-h-14 items-center justify-between border-b px-4 pt-safe md:hidden">
        <NavLink
          to="/"
          className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Logo className="size-8" />
          <span className="font-bold tracking-wide" translate="no">
            MONEY
          </span>
        </NavLink>
        <div className="flex items-center gap-1">
          {NAV.filter((n) => TOP_NAV.includes(n.to)).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              data-tour={to === '/settings' ? 'settings' : undefined}
              className={({ isActive }) =>
                cn(
                  'grid size-10 place-items-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive && 'bg-accent text-foreground',
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
            </NavLink>
          ))}
        </div>
      </header>

      <main id="main" className="pb-32 md:pb-12">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageFallback />}>
            <div key={location.pathname} className="animate-in duration-300 fade-in slide-in-from-bottom-1">
              <Outlet />
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>

      <Walkthrough />

      {/* Phone bottom bar: liquid glass tab bar + floating add button */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-2 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.625rem))] md:hidden">
        {/* Hugs the screen edges: the home indicator only needs ~24px, not the full 34px inset. */}
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-2">
          <GlassTabBar
            data-tour="nav"
            className="flex-1"
            aria-label="Main"
            value={BOTTOM_NAV.find((n) => isActive(n.to))?.to ?? null}
            items={BOTTOM_NAV.map(({ to, label, icon: Icon }) => ({
              value: to,
              href: to,
              label,
              icon: <Icon aria-hidden="true" />,
            }))}
          />
          <GlassButton
            data-tour="add"
            variant="filled"
            onClick={() => openNew('expense')}
            aria-label="Add Transaction"
            className="size-[60px] shrink-0 rounded-full p-0 shadow-lg"
            icon={<Plus className="size-6" aria-hidden="true" />}
          />
        </div>
      </div>
    </div>
  );
}
