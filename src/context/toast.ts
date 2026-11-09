import { createContext, use } from 'react';

export type ToastKind = 'success' | 'error';

export interface ToastApi {
  show: (message: string, options?: { kind?: ToastKind; action?: { label: string; onClick: () => void } }) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = use(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
