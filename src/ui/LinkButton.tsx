import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { buttonClass, type ButtonVariant } from './Button';

interface LinkButtonProps {
  to: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}

// Liên kết router có đúng khuôn của Button (cùng chiều cao, viền, padding).
export function LinkButton({ to, variant = 'ghost', className, children }: LinkButtonProps) {
  return (
    <Link to={to} data-variant={variant} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}
