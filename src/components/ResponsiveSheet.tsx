import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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

/**
 * The visible area above the on-screen keyboard. `visualViewport` shrinks when the keyboard opens
 * (iOS and Android), so the sheet is anchored to it instead of the layout viewport: it rises with
 * the keyboard rather than being covered or pushed around.
 */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState({ bottom: 0, height: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => {
      setInset({
        bottom: Math.max(0, window.innerHeight - vv.height - vv.offsetTop),
        height: vv.height,
      });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return inset;
}

function PhoneSheet({ open, onClose, title, description, children }: Props) {
  const inset = useKeyboardInset(open);
  const style: CSSProperties = {
    bottom: inset.bottom,
    maxHeight: inset.height ? Math.round(inset.height * 0.94) : undefined,
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          // No auto-focus into a field on phones: the keyboard would pop up mid-animation.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
          }}
          style={style}
          className={cn(
            'fixed inset-x-0 z-50 flex max-h-[92dvh] flex-col glass-panel-strong rounded-t-[28px] border-t outline-none',
            'transition-[bottom,max-height] duration-150 ease-out',
            'data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:slide-out-to-bottom',
            'data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:slide-in-from-bottom',
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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [--sheet-px:--spacing(4)]">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Action bar pinned to the bottom of the sheet's scroll area (always reachable, never overlaps fields). */
export function SheetFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-(--sheet-px) mt-6 flex gap-2 border-t bg-[var(--glass-panel-strong)] backdrop-blur-xl px-(--sheet-px) pt-4 pb-[max(--spacing(4),env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
