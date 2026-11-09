import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastApi, type ToastKind } from '../context/toast';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void } | undefined;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>(
    (message, options = {}) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, message, kind: options.kind ?? 'success', action: options.action }]);
      window.setTimeout(() => dismiss(id), options.kind === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast" data-kind={t.kind}>
            <span className="toast__msg">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
