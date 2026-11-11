import type { ComponentProps } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'destructive';

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  // Do not let a press move focus off the field being typed in: on a phone the
  // keyboard would close, the layout shift and the click be lost.
  keepFocus?: boolean;
}

export function buttonClass(variant: ButtonVariant, className?: string): string {
  return [styles.button, styles[variant], className].filter(Boolean).join(' ');
}

export function Button({ variant = 'primary', className, keepFocus, onMouseDown, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      data-variant={variant}
      className={buttonClass(variant, className)}
      onMouseDown={
        keepFocus
          ? (e) => {
              e.preventDefault();
              onMouseDown?.(e);
            }
          : onMouseDown
      }
      {...props}
    />
  );
}
