import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tinted?: boolean;
}

export function Card({ tinted, className, ...props }: CardProps) {
  const classes = [styles.card, tinted && styles.tinted, className].filter(Boolean).join(' ');
  return <div className={classes} {...props} />;
}
