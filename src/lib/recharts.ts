/** recharts is ~110 KB gzipped: load it on demand, once, and share the promise (read it with React's `use`). */
export type Recharts = typeof import('recharts');

let pending: Promise<Recharts> | null = null;

export function loadRecharts(): Promise<Recharts> {
  pending ??= import('recharts');
  return pending;
}
