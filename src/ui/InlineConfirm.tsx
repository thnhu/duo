import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import { ButtonRow } from './ButtonRow';
import styles from './InlineConfirm.module.css';

interface InlineConfirmProps {
  // What will happen, with numbers when there are any ("3 ví dụ cũng bị xóa").
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirmation for a delete, shown right where the button was: a small panel
// in the page, not a box over the whole screen. Focus starts on "Hủy" (the
// safe choice) and Escape cancels.
export function InlineConfirm({ children, confirmLabel, onConfirm, onCancel }: InlineConfirmProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  return (
    <div
      className={styles.panel}
      role="alertdialog"
      aria-label="Xác nhận xóa"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <p>{children}</p>
      <ButtonRow>
        <Button ref={cancel} variant="ghost" onClick={onCancel}>
          Hủy
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </ButtonRow>
    </div>
  );
}
