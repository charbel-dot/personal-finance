import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIsDesktop } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Centred dialog on desktop, bottom sheet on phones. Both: fixed header, scrolling body, and forms
 * put their actions in <SheetFooter>, pinned to the bottom of the body so Save is always reachable.
 */
export function ResponsiveSheet(props: Props) {
  const desktop = useIsDesktop();
  return desktop ? <DesktopDialog {...props} /> : <PhoneSheet {...props} />;
}

function DesktopDialog({ open, onClose, title, description, children }: Props) {
  const body = useRef<HTMLDivElement>(null);
  // Desktop only: jump straight to the field marked `data-autofocus` (e.g. the amount).
  const onOpenAutoFocus = (e: Event) => {
    const target = body.current?.querySelector<HTMLElement>('[data-autofocus]');
    if (!target) return;
    e.preventDefault();
    target.focus();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[min(90dvh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        onOpenAutoFocus={onOpenAutoFocus}
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className={description ? undefined : 'sr-only'}>{description ?? title}</DialogDescription>
        </DialogHeader>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 [--sheet-px:--spacing(6)]">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface VisibleArea {
  /** Top of the visible area, in the coordinates `position: fixed` uses. */
  top: number;
  height: number;
  /** The on-screen keyboard is covering part of the screen. */
  keyboard: boolean;
}

/**
 * The part of the screen the user can actually see, above any on-screen keyboard.
 *
 * iOS never shrinks the layout viewport for the keyboard: it shrinks the *visual* viewport and
 * scrolls it within the layout one. Anchoring the sheet to the visual viewport's top and height
 * (rather than computing a `bottom` from `innerHeight`, which iOS reports inconsistently while the
 * keyboard animates) keeps the sheet sitting exactly on the keyboard with no gap and no jump.
 * Android (`interactive-widget=resizes-content`) resizes the layout viewport, so this stays a no-op.
 */
function useVisibleArea(active: boolean): VisibleArea | null {
  const [area, setArea] = useState<VisibleArea | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const full = document.documentElement.clientHeight;
        const next = {
          top: Math.max(0, Math.round(vv.offsetTop)),
          height: Math.round(vv.height),
          keyboard: full - vv.height > 120,
        };
        setArea((prev) =>
          prev?.top === next.top && prev.height === next.height && prev.keyboard === next.keyboard ? prev : next,
        );
      });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
      setArea(null);
    };
  }, [active]);
  return area;
}

/** Keep the focused field in view inside the sheet's own scroll area once the keyboard settles. */
function useRevealFocusedField(body: RefObject<HTMLDivElement | null>, area: VisibleArea | null) {
  const height = area?.height;
  useEffect(() => {
    const el = document.activeElement;
    if (!body.current || !(el instanceof HTMLElement) || !body.current.contains(el)) return;
    el.scrollIntoView({ block: 'nearest' });
  }, [body, height]);
}

function PhoneSheet({ open, onClose, title, description, children }: Props) {
  const area = useVisibleArea(open);
  const body = useRef<HTMLDivElement>(null);
  useRevealFocusedField(body, area);
  // The frame covers exactly the visible area; the sheet hugs its bottom edge.
  // While the keyboard is up the home indicator is hidden, so the footer drops its safe-area padding.
  const frame: CSSProperties & { '--sheet-safe-bottom'?: string } = {
    ...(area ? { top: area.top, height: area.height } : { top: 0, bottom: 0 }),
    '--sheet-safe-bottom': area?.keyboard ? '0px' : undefined,
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <div className="pointer-events-none fixed inset-x-0 z-50 flex flex-col justify-end" style={frame}>
          <DialogPrimitive.Content
            // No auto-focus into a field on phones: the keyboard would pop up mid-animation.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
            }}
            className={cn(
              'pointer-events-auto flex max-h-[min(94%,92dvh)] flex-col glass-panel-strong rounded-t-[28px] border-t outline-none',
              'data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:slide-out-to-bottom',
              'data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:ease-out-expo data-[state=open]:slide-in-from-bottom',
            )}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted" aria-hidden="true" />
            <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-2 pb-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className={description ? 'text-sm text-muted-foreground' : 'sr-only'}>
                  {description ?? title}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                aria-label="Close"
                className="-mt-1 -mr-1 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
            <div
              ref={body}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [--sheet-px:--spacing(4)]"
            >
              {children}
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Action bar pinned to the bottom of the sheet's scroll area (always reachable, never overlaps fields). */
export function SheetFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-(--sheet-px) mt-6 flex gap-2 border-t bg-[var(--glass-solid)] px-(--sheet-px) pt-4 pb-[max(--spacing(4),var(--sheet-safe-bottom,env(safe-area-inset-bottom)))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
