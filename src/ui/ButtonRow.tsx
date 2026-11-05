import type { ReactNode } from 'react';
import styles from './ButtonRow.module.css';

interface ButtonRowProps {
  children: ReactNode;
  /** `fill`: các nút chia đều chiều ngang (mặc định). `start`: nút giữ cỡ tự nhiên. */
  layout?: 'fill' | 'start';
  className?: string;
}

// Hàng nút dùng chung: cùng gap, tự xuống dòng, cùng chiều cao.
export function ButtonRow({ children, layout = 'start', className }: ButtonRowProps) {
  const classes = [styles.row, layout === 'fill' ? styles.fill : '', className]
    .filter(Boolean)
    .join(' ');
  return <div className={classes}>{children}</div>;
}
