import { Fragment } from 'react';
import styles from './HighlightedText.module.css';

interface HighlightedTextProps {
  text: string;
  // [start, end) ranges, sorted and non-overlapping.
  ranges: Array<[number, number]>;
}

export function HighlightedText({ text, ranges }: HighlightedTextProps) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(<Fragment key={`t${i}`}>{text.slice(cursor, start)}</Fragment>);
    parts.push(
      <mark key={`m${i}`} className={styles.mark}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  return <>{parts}</>;
}
