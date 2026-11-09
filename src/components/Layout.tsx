import { History, House, LogOut, Plus, Repeat, Settings, type LucideIcon } from 'lucide-react';
import { Suspense, useEffect, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from './ErrorBoundary';
import { Logo } from './Logo';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuickAdd } from '@/context/quickAdd';
import { useSignOut } from '@/hooks/use-sign-out';
import { cn } from '@/lib/utils';

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/history', label: 'History', icon: History },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/settings', label: 'Settings', icon: Settings },
];

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
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-6 pb-5 md:pt-10 md:pb-7">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10', className)}>{children}</div>;
}

export function Layout() {
  const location = useLocation();
  const { openNew } = useQuickAdd();
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
      <a
        href="#main"
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:translate-y-0"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background md:flex"
        aria-label="Sidebar"
      >
        <div className="flex h-20 items-center gap-3 border-b px-6">
          <Logo />
          <span className="text-lg font-bold tracking-wide">MONEY</span>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <Button className="press mb-3 h-11 justify-start gap-2 text-sm" onClick={() => openNew('expense')}>
            <Plus className="size-5" aria-hidden="true" />
            New transaction
            <kbd className="ml-auto rounded border border-primary-foreground/20 px-1.5 text-[11px] font-medium opacity-70">
              N
            </kbd>
          </Button>
          <nav aria-label="Main" className="flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
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
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main id="main" className="pb-28 md:pb-12">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Phone bottom bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-safe md:hidden supports-[backdrop-filter]:bg-background/90"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {NAV.slice(0, 2).map((item) => (
            <BottomLink key={item.to} {...item} />
          ))}
          <div className="grid place-items-center">
            <button
              type="button"
              onClick={() => openNew('expense')}
              aria-label="Add transaction"
              className="press -mt-7 grid size-14 place-items-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <Plus className="size-6" aria-hidden="true" />
            </button>
          </div>
          {NAV.slice(2).map((item) => (
            <BottomLink key={item.to} {...item} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function BottomLink({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors outline-none',
          'focus-visible:text-foreground',
          isActive && 'text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-accent')}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}
