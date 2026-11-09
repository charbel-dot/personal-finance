import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useQuickAdd } from '../context/quickAdd';
import { ErrorBoundary } from './ErrorBoundary';
import { Skeleton } from './Feedback';
import { Icon, type IconName } from './Icon';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/history', label: 'History', icon: 'list' },
  { to: '/recurring', label: 'Recurring', icon: 'repeat' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function PageFallback() {
  return (
    <div className="main stack" aria-busy="true" aria-label="Loading page">
      <Skeleton height={28} width="40%" />
      <Skeleton height={160} style={{ borderRadius: 20 }} />
      <Skeleton height={220} style={{ borderRadius: 20 }} />
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const { openNew } = useQuickAdd();

  // Keyboard shortcut: "n" opens quick add (ignored while typing or when a dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable], dialog[open]')) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      openNew('expense');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openNew]);

  const link = (item: (typeof NAV)[number]) => (
    <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav__link">
      <Icon name={item.icon} size={22} />
      {item.label}
    </NavLink>
  );

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <main id="main">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <nav className="nav" aria-label="Main">
        <div className="nav__inner">
          <div className="nav__brand" aria-hidden="true">
            <span className="tile">
              <Icon name="logo" size={18} />
            </span>
            MONEY
          </div>
          {NAV.slice(0, 2).map(link)}
          <div className="nav__fab-slot">
            <button
              type="button"
              className="fab"
              onClick={() => openNew('expense')}
              aria-label="Add transaction"
              aria-keyshortcuts="n"
            >
              <Icon name="plus" size={24} />
              <span className="fab__label">New transaction</span>
            </button>
          </div>
          {NAV.slice(2).map(link)}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <header className="topbar">
      <h1 className="topbar__title">{title}</h1>
      {actions}
    </header>
  );
}
