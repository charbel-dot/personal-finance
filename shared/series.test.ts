import { describe, expect, it } from 'vitest';
import type { Transaction } from './schema';
import { spendingPace } from './series';

const tx = (date: string, amount: number, type: Transaction['type'] = 'expense'): Transaction => ({
  id: `${date}-${amount}`,
  type,
  amount,
  date,
  categoryId: 'dining',
  createdAt: '',
  updatedAt: '',
});

describe('spendingPace', () => {
  const cur = { from: '2026-11-01', to: '2026-11-30' };
  const prev = { from: '2026-10-01', to: '2026-10-31' };

  it('accumulates expenses day by day and stops at today', () => {
    const points = spendingPace(
      [tx('2026-11-01', 100), tx('2026-11-03', 50), tx('2026-11-03', 999, 'income')],
      [tx('2026-10-02', 70)],
      cur,
      prev,
      '2026-11-04',
    );
    expect(points).toHaveLength(30);
    expect(points.slice(0, 4).map((p) => p.current)).toEqual([100, 100, 150, 150]);
    expect(points[4].current).toBeNull();
    expect(points.slice(0, 3).map((p) => p.previous)).toEqual([0, 70, 70]);
    expect(points[29].previous).toBe(70);
  });

  it('buckets long ranges by week', () => {
    const points = spendingPace([], [], { from: '2026-01-01', to: '2026-12-31' }, prev, '2026-12-31');
    expect(points).toHaveLength(53);
    expect(points[0].date).toBe('2026-01-07');
    expect(points[52].date).toBe('2026-12-31');
  });
});
