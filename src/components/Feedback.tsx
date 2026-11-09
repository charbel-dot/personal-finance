import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Skeleton({
  width = '100%',
  height = 16,
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}) {
  return <div className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="list-item">
          <Skeleton width={40} height={40} style={{ borderRadius: 14 }} />
          <div className="list-item__main stack" style={{ gap: 6 }}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="30%" height={10} />
          </div>
          <Skeleton width={64} height={14} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon = 'wallet',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={24} />
      </div>
      <p className="empty__title">{title}</p>
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorMessage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="alert"
      title="Couldn't load this"
      action={
        onRetry && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Try again
          </button>
        )
      }
    >
      {error instanceof Error ? error.message : 'Unknown error'}
    </EmptyState>
  );
}
