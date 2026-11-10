import { SegmentedControl, TabBar, type TabBarItem } from 'glisse';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * glisse segments have a fixed tab width (--lg-tab-width). With `fill`, the control stretches to
 * its container and the width is derived from the space available, so it fits any phone.
 */
function useFillWidth(count: number, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!enabled || !host) return;
    const fit = () => {
      const bar = host.firstElementChild as HTMLElement | null;
      if (!bar) return;
      const inset = parseFloat(getComputedStyle(bar).getPropertyValue('--lg-tab-inset')) || 0;
      const width = Math.max(0, (host.clientWidth - inset * 2) / count);
      bar.style.setProperty('--lg-tab-width', `${width}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, [count, enabled]);
  return ref;
}

export interface SegmentedProps<T extends string> {
  items: { value: T; label: ReactNode }[];
  value: T;
  onValueChange: (value: T) => void;
  'aria-label': string;
  /** Stretch to the container's width. */
  fill?: boolean;
  className?: string;
}

/** Liquid glass segmented control (role="radiogroup"). */
export function Segmented<T extends string>({
  items,
  value,
  onValueChange,
  fill,
  className,
  ...aria
}: SegmentedProps<T>) {
  const ref = useFillWidth(items.length, Boolean(fill));
  return (
    <div ref={ref} className={cn(fill ? 'w-full' : 'inline-block max-w-full', className)}>
      <SegmentedControl
        items={items}
        value={value}
        onValueChange={(v) => onValueChange(v as T)}
        aria-label={aria['aria-label']}
        style={fill ? { display: 'flex', width: '100%' } : undefined}
      />
    </div>
  );
}

/** react-router link for glisse tab bars, which hand tabs an `href`. */
function RouterLink({ href, ...props }: { href: string } & Omit<React.ComponentProps<typeof Link>, 'to'>) {
  return <Link to={href} {...props} />;
}

export interface GlassTabBarProps {
  items: TabBarItem[];
  value: string | null;
  'aria-label': string;
  className?: string;
  /** Walkthrough anchor (see Walkthrough). */
  'data-tour'?: string;
}

/** Liquid glass tab bar whose tabs are router links, sized to fill its container. */
export function GlassTabBar({ items, value, className, 'data-tour': tour, ...aria }: GlassTabBarProps) {
  const ref = useFillWidth(items.length, true);
  return (
    <div ref={ref} className={cn('min-w-0', className)} data-tour={tour}>
      <TabBar
        items={items}
        value={value}
        link={RouterLink}
        aria-label={aria['aria-label']}
        style={{ display: 'flex', width: '100%' }}
      />
    </div>
  );
}
