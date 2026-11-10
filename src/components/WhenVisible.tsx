import { useEffect, useRef, useState, type ReactNode } from 'react';

/** requestIdleCallback where available (not in Safari), otherwise the next macrotask. */
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 300 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(fn, 0);
  return () => globalThis.clearTimeout(id);
}

/**
 * Renders `children` only once the placeholder scrolls near the viewport (and the browser is idle),
 * so heavy below-the-fold content (recharts) isn't loaded, parsed and laid out during first paint.
 */
export function WhenVisible({
  children,
  fallback,
  margin = '0px',
}: {
  children: ReactNode;
  fallback: ReactNode;
  margin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (show || !el) return;
    if (typeof IntersectionObserver === 'undefined') return whenIdle(() => setShow(true));
    let cancel: (() => void) | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        cancel = whenIdle(() => setShow(true));
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancel?.();
    };
  }, [show, margin]);

  return show ? children : <div ref={ref}>{fallback}</div>;
}
