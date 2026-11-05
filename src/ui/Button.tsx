import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'destructive';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function buttonClass(variant: ButtonVariant, className?: string): string {
  return [styles.button, styles[variant], className].filter(Boolean).join(' ');
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button type="button" data-variant={variant} className={buttonClass(variant, className)} {...props} />
  );
}
