import type { LessonGroup } from '../../lessons';
import styles from '../sets/SetChips.module.css';
import groupStyles from './LessonChips.module.css';

interface LessonChipsProps {
  groups: LessonGroup[];
  // Selected lesson ids; empty = no restriction.
  selected: string[];
  onChange: (ids: string[]) => void;
  // Add the language to each deck name (when decks of both languages are listed).
  showLang?: boolean;
}

const LANG_LABEL = { en: 'Anh', de: 'Đức' } as const;

// Pick which lessons to study, grouped by the deck they belong to. Nothing
// ticked = every word of the chosen decks; ticking lessons narrows to words in
// at least one of them. Same look as the deck chips.
export function LessonChips({ groups, selected, onChange, showLang }: LessonChipsProps) {
  if (groups.length === 0) return null;
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const chip = (on: boolean) => [styles.chip, on ? styles.chipOn : ''].filter(Boolean).join(' ');
  return (
    <div className={groupStyles.groups} role="group" aria-label="Chọn bài">
      <div className={styles.chips}>
        <button
          type="button"
          className={chip(selected.length === 0)}
          aria-pressed={selected.length === 0}
          onClick={() => onChange([])}
        >
          Tất cả bài
        </button>
      </div>
      {groups.map((group) => (
        <div key={group.key}>
          <p className={groupStyles.deck}>
            {group.label}
            {showLang ? ` (${LANG_LABEL[group.lang]})` : ''}
          </p>
          <div className={styles.chips}>
            {group.lessons.map((lesson) => (
              <button
                key={lesson.id}
                type="button"
                className={chip(selected.includes(lesson.id))}
                aria-pressed={selected.includes(lesson.id)}
                onClick={() => toggle(lesson.id)}
              >
                {lesson.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
