import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useConfirm } from '@/context/confirm';
import { api } from '@/lib/api';

/** Confirms, ends the session server-side, wipes cached data and returns to /login. */
export function useSignOut() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    const ok = await confirm({
      title: 'Sign Out?',
      message: 'You’ll need your password to sign back in on this device.',
      confirmLabel: 'Sign Out',
    });
    if (!ok) return;
    try {
      await api.logout();
    } finally {
      qc.clear();
      void navigate('/login', { replace: true });
    }
  };
}
