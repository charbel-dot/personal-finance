import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Page state kept in the query string (shareable, survives reload and Back).
 * `update` merges a patch; `null`/'' removes a key. Several updates in one event batch correctly.
 */
export function useUrlState() {
  const [params, setParams] = useSearchParams();
  const pending = useRef<URLSearchParams | null>(null);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(pending.current ?? params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      pending.current = next;
      setParams(next, { replace: true });
      queueMicrotask(() => {
        pending.current = null;
      });
    },
    [params, setParams],
  );

  return [params, update] as const;
}

export function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
