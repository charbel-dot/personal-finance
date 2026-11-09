import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { toast } from 'sonner';
import { ConfirmProvider } from './components/ConfirmProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorMessage } from './components/Feedback';
import { Layout, PageFallback } from './components/Layout';
import { Logo } from './components/Logo';
import { QuickAddProvider } from './components/QuickAddProvider';
import { Toaster } from './components/ui/sonner';
import { useBootstrap, useMe, usePatchSettings } from './lib/queries';
import { localTimeZone } from './lib/today';

const Login = lazy(() => import('./routes/Login'));
const Dashboard = lazy(() => import('./routes/Dashboard'));
const History = lazy(() => import('./routes/History'));
const Recurring = lazy(() => import('./routes/Recurring'));
const Settings = lazy(() => import('./routes/Settings'));
const NotFound = lazy(() => import('./routes/NotFound'));

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading">
      <Logo className="size-12 animate-pulse" />
    </div>
  );
}

/** Loads settings/categories/recurring (and reconciles due recurring entries) before rendering the app. */
function RequireData() {
  const bootstrap = useBootstrap();
  const { mutate } = usePatchSettings();
  const generated = bootstrap.data?.generated ?? 0;
  const savedTz = bootstrap.data?.settings.timezone;

  useEffect(() => {
    if (generated > 0) toast.success(`Added ${generated} recurring ${generated === 1 ? 'expense' : 'expenses'}`);
  }, [generated]);

  // Keep the server's notion of "today" in the user's timezone for cron generation.
  useEffect(() => {
    const tz = localTimeZone();
    if (savedTz && savedTz !== tz) mutate({ timezone: tz });
  }, [savedTz, mutate]);

  if (bootstrap.isPending) return <PageFallback />;
  if (bootstrap.isError) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <ErrorMessage error={bootstrap.error} onRetry={() => void bootstrap.refetch()} />
      </div>
    );
  }
  return (
    <QuickAddProvider>
      <Layout />
    </QuickAddProvider>
  );
}

function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Splash />;
  if (me.isError || !me.data.authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <RequireData />;
}

export function App() {
  return (
    <ErrorBoundary>
      <ConfirmProvider>
        <BrowserRouter>
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<RequireAuth />}>
                <Route index element={<Dashboard />} />
                <Route path="history" element={<History />} />
                <Route path="recurring" element={<Recurring />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ConfirmProvider>
      <Toaster position="top-center" richColors={false} closeButton />
    </ErrorBoundary>
  );
}
