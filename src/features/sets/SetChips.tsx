import type { WordSet } from '../../db/types';
import styles from './SetChips.module.css';

interface SetChipsProps {
  sets: WordSet[];
  // Selected set ids; empty = all words.
  selected: string[];
  onChange: (ids: string[]) => void;
  // Add the language to each name (when sets of both languages are listed).
  showLang?: boolean;
}

const LANG_LABEL = { en: 'Anh', de: 'Đức' } as const;

// Pick which word sets to study. "Tất cả" (nothing selected) means no
// restriction; picking sets narrows to words in at least one of them.
export function SetChips({ sets, selected, onChange, showLang }: SetChipsProps) {
  if (sets.length === 0) return null;
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const chip = (on: boolean) => [styles.chip, on ? styles.chipOn : ''].filter(Boolean).join(' ');
  return (
    <div className={styles.chips} role="group" aria-label="Chọn deck">
      <button type="button" className={chip(selected.length === 0)} aria-pressed={selected.length === 0} onClick={() => onChange([])}>
        Tất cả
      </button>
      {sets.map((set) => (
        <button
          key={set.id}
          type="button"
          className={chip(selected.includes(set.id))}
          aria-pressed={selected.includes(set.id)}
          onClick={() => toggle(set.id)}
        >
          {set.name}
          {showLang ? ` (${LANG_LABEL[set.lang]})` : ''}
        </button>
      ))}
    </div>
  );
}
