import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type SyntheticEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { keys, useMe } from '../lib/queries';

export default function Login() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const ids = { user: useId(), pass: useId(), error: useId() };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (me.data?.authenticated) return <Navigate to={from} replace />;

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.login({ username: username.trim(), password, remember });
      await qc.invalidateQueries({ queryKey: keys.me });
      void navigate(from.startsWith('/') && !from.startsWith('//') ? from : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setPassword('');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth__card">
        <div className="brand" aria-hidden="true">
          <Icon name="logo" size={26} />
        </div>
        <h1>Welcome back</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          Sign in to your money tracker.
        </p>
        <form
          className="stack"
          onSubmit={(e) => void onSubmit(e)}
          noValidate
          aria-describedby={error ? ids.error : undefined}
        >
          {error && (
            <div id={ids.error} className="alert" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor={ids.user} className="field__label">
              Username
            </label>
            <input
              id={ids.user}
              className="input"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={ids.pass} className="field__label">
              Password
            </label>
            <input
              id={ids.pass}
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me for 30 days
          </label>
          <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
            {pending ? <span className="spinner" aria-label="Signing in" /> : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
