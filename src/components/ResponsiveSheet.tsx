import { useRef, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsDesktop } from '@/hooks/use-media-query';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Bottom drawer on phones (thumb-reachable, swipe to dismiss), centred dialog on desktop.
 * Focuses the element marked `data-autofocus` on open (e.g. the amount field).
 */
export function ResponsiveSheet({ open, onClose, title, description, children }: Props) {
  const desktop = useIsDesktop();
  const body = useRef<HTMLDivElement>(null);
  const onOpenAutoFocus = (e: Event) => {
    const target = body.current?.querySelector<HTMLElement>('[data-autofocus]');
    if (!target) return;
    e.preventDefault();
    target.focus();
  };
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg" onOpenAutoFocus={onOpenAutoFocus}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : 'sr-only'}>
              {description ?? title}
            </DialogDescription>
          </DialogHeader>
          <div ref={body}>{children}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="max-h-[94dvh]" onOpenAutoFocus={onOpenAutoFocus}>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className={description ? undefined : 'sr-only'}>{description ?? title}</DrawerDescription>
        </DrawerHeader>
        <div ref={body} className="overflow-y-auto px-4 pb-safe">
          <div className="pb-4">{children}</div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
