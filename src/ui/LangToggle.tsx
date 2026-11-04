import type { Lang } from '../db/types';
import styles from './LangToggle.module.css';

const OPTIONS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'Anh' },
  { value: 'de', label: 'Đức' },
];

interface LangToggleProps {
  value: Lang;
  onChange: (lang: Lang) => void;
}

export function LangToggle({ value, onChange }: LangToggleProps) {
  return (
    <div className={styles.toggle} role="group" aria-label="Ngôn ngữ">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={[styles.option, value === option.value && styles.optionActive]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
