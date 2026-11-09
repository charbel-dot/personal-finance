import type { ReactNode } from 'react';

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  label: string;
  center?: ReactNode;
}

/** Lightweight SVG donut (no chart library). Values must be ≥ 0. */
export function Donut({ slices, size = 132, thickness = 16, label, center }: DonutProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const gap = slices.length > 1 ? 2 : 0;

  const visible = slices.filter((s) => s.value > 0);
  const lengths = visible.map((s) => (total > 0 ? (s.value / total) * circumference : 0));
  const arcs = visible.map((s, i) => ({
    ...s,
    dash: Math.max(0, lengths[i] - gap),
    offset: lengths.slice(0, i).reduce((a, b) => a + b, 0),
  }));

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {arcs.map((a) => (
            <circle
              key={a.id}
              className="donut__arc"
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${circumference}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="butt"
            />
          ))}
        </g>
      </svg>
      {center && <div className="donut__center">{center}</div>}
    </div>
  );
}
