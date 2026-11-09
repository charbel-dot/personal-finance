import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from '../context/confirm';
import { Sheet } from './Sheet';

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext value={confirm}>
      {children}
      <Sheet open={options !== null} onClose={() => settle(false)} title={options?.title ?? ''} size="dialog">
        <div className="stack">
          <p className="muted">{options?.message}</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--secondary" onClick={() => settle(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={options?.danger ? 'btn btn--danger' : 'btn btn--primary'}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </div>
      </Sheet>
    </ConfirmContext>
  );
}
