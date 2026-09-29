import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import { he } from '../strings.he';

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Native <dialog> for focus trapping and Escape handling, styled as an iPhone bottom sheet.
 * `onClose` fires only for user dismissals (Escape, backdrop, ✕), never when `open` turns false,
 * so a flow can move from one sheet to the next without being reset.
 */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault(); // Escape: let the parent decide via `open`
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 text-text backdrop:bg-scrim"
    >
      <div className="pb-safe mx-auto max-w-lg rounded-t-[28px] bg-surface px-4 pt-3">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full text-muted active:bg-surface-2"
            aria-label={he.common.close}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="pb-4">{children}</div>
      </div>
    </dialog>
  );
}
