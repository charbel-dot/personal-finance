import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sheet' | 'dialog';
}

/**
 * Native <dialog> as a bottom sheet (mobile) / centered modal (desktop):
 * focus trapping, Esc to close and inertness of the page come for free.
 */
export function Sheet({ open, onClose, title, children, size = 'sheet' }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() moves focus itself, so React's autoFocus would be lost: focus the marked field afterwards.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Light dismiss: a pointer press on the backdrop (the <dialog> box itself, outside its content) closes.
  // Keyboard users close with Esc (native) or the Close button.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) onClose();
    };
    dialog.addEventListener('click', onClick);
    return () => dialog.removeEventListener('click', onClick);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={size === 'dialog' ? 'sheet dialog-sm' : 'sheet'}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          {size === 'sheet' && <div className="sheet__handle" />}
          <div className="sheet__head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          <div className="sheet__body">{children}</div>
        </>
      )}
    </dialog>
  );
}
