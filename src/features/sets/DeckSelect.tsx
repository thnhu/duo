import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import fieldStyles from '../../ui/field.module.css';
import type { Lang, WordSet } from '../../db/types';
import { GENERAL_DECK_NAME, listWordSets, readAddSet, writeAddSet } from '../../wordsets';

interface DeckSelectProps {
  id: string;
  lang: Lang;
  // '' = General (no deck).
  value: string;
  onChange: (setId: string) => void;
  // False when the screen shows a deck that already exists (editing): then the
  // remembered "last used" deck is neither applied nor overwritten.
  remember?: boolean;
  label?: string;
}

// "Deck của concept": General by default, or one of the decks; the choice is
// remembered per language on this device. Without decks it only shows a hint.
export function DeckSelect({ id, lang, value, onChange, remember = true, label = 'Deck của concept' }: DeckSelectProps) {
  const [sets, setSets] = useState<WordSet[]>([]);

  useEffect(() => {
    let current = true;
    void listWordSets(lang).then((list) => {
      if (!current) return;
      setSets(list);
      if (!remember) return;
      const remembered = readAddSet(lang);
      onChange(list.some((s) => s.id === remembered) ? remembered : '');
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  if (sets.length === 0) {
    return (
      <p className={fieldStyles.hint}>
        Deck: {GENERAL_DECK_NAME}. Muốn gom theo mục đích (IT, phim…)? <Link to="/sets">Tạo deck</Link>.
      </p>
    );
  }

  return (
    <div>
      <label className={fieldStyles.label} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={fieldStyles.input}
        value={value}
        onChange={(e) => {
          if (remember) writeAddSet(lang, e.target.value);
          onChange(e.target.value);
        }}
      >
        <option value="">{GENERAL_DECK_NAME} (mặc định)</option>
        {sets.map((set) => (
          <option key={set.id} value={set.id}>
            {set.name}
          </option>
        ))}
      </select>
    </div>
  );
}
