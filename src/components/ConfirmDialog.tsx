import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Modal';

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Batal',
  tone = 'primary',
  onConfirm,
  onCancel,
  confirmDisabled = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'accent';
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} role="alertdialog">
      <div className="mt-2 text-[15px] text-espresso-700">{children}</div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="secondary" block onClick={onCancel} data-autofocus>
          {cancelLabel}
        </Button>
        <Button variant={tone} block onClick={onConfirm} disabled={confirmDisabled}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
