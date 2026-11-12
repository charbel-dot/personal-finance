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
  /**
   * Phones: open as a full-screen page instead of a bottom sheet. For long forms that would
   * otherwise fill the screen anyway and leave a sliver of page peeking out above them.
   */
  fullScreen?: boolean;
  children: ReactNode;
}

/**
 * Centred dialog on desktop, bottom sheet (or full-screen page) on phones. Both: fixed header,
 * scrolling body, and forms put their actions in <SheetFooter>, pinned to the bottom so Save is
 * always reachable.
 */
export function ResponsiveSheet(props: Props) {
  const desktop = useIsDesktop();
  return desktop ? <DesktopDialog {...props} /> : <PhoneSheet {...props} />;
}

function DesktopDialog({ open, onClose, title, description, children }: Omit<Props, 'fullScreen'>) {
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

/** Scroll the focused field into the sheet's scroll area (scroll-padding keeps it clear of the sticky footer). */
function revealFocused(body: HTMLElement | null) {
  const el = document.activeElement;
  if (!body || !(el instanceof HTMLElement) || !body.contains(el)) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/**
 * Keep the focused field visible while typing: once the keyboard resizes the visible area, and
 * whenever focus moves to another field (the keyboard may already be up, so no resize fires).
 * Returns the `onFocus` handler for the scroll area.
 */
function useRevealFocusedField(body: RefObject<HTMLDivElement | null>, area: VisibleArea | null) {
  const height = area?.height;
  const timer = useRef(0);
  useEffect(() => {
    revealFocused(body.current);
  }, [body, height]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return () => {
    window.clearTimeout(timer.current);
    // Wait for the keyboard to finish animating before measuring.
    timer.current = window.setTimeout(() => {
      revealFocused(body.current);
    }, 320);
  };
}

function PhoneSheet({ open, onClose, title, description, fullScreen = false, children }: Props) {
  const area = useVisibleArea(open);
  const body = useRef<HTMLDivElement>(null);
  const onBodyFocus = useRevealFocusedField(body, area);
  const keyboard = area?.keyboard ?? false;
  // Fills the whole visible area: always for full-screen sheets, and for any sheet while typing.
  const full = fullScreen || keyboard;
  // The frame covers exactly the visible area; the sheet hugs its bottom edge, and while the
  // keyboard is up it fills the whole visible area so the field being typed in has maximum room.
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <div className="pointer-events-none fixed inset-x-0 z-50 flex flex-col justify-end" style={frame}>
          <DialogPrimitive.Content
            // No auto-focus into a field on phones: the keyboard would pop up mid-animation.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
            }}
            className={cn(
              'pointer-events-auto flex flex-col glass-panel-strong border-t outline-none transition-[border-radius] duration-200',
              full ? 'h-full max-h-full rounded-t-none border-t-0' : 'max-h-[min(94%,92dvh)] rounded-t-[28px]',
              'data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:slide-out-to-bottom',
              'data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:ease-out-expo data-[state=open]:slide-in-from-bottom',
            )}
          >
            {!full && <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted" aria-hidden="true" />}
            <div
              className={cn(
                'flex shrink-0 items-start justify-between gap-3 px-4 pb-3',
                full ? 'pt-[max(--spacing(3),env(safe-area-inset-top))]' : 'pt-2',
                // A full-screen page gets a header line to separate its title from the scrolling form.
                fullScreen && 'border-b',
              )}
            >
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
              onFocus={onBodyFocus}
              // Scroll padding keeps a revealed field clear of the sticky <SheetFooter>. A full-screen
              // form stretches to the bottom so its footer sits on the bottom edge, not mid-screen.
              className={cn(
                'min-h-0 flex-1 scroll-pt-4 scroll-pb-28 overflow-y-auto overscroll-contain px-4 [--sheet-px:--spacing(4)]',
                fullScreen &&
                  'pt-4 [&>form]:flex [&>form]:min-h-full [&>form]:flex-col [&>form>[data-sheet-footer]]:mt-auto',
              )}
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
      data-sheet-footer=""
      className={cn(
        'sticky bottom-0 z-10 -mx-(--sheet-px) mt-6 flex gap-2 border-t bg-[var(--glass-solid)] px-(--sheet-px) pt-4 pb-[max(--spacing(4),var(--sheet-safe-bottom,env(safe-area-inset-bottom)))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
