import { useEffect, useState } from 'react';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { conceptsInScope, normalizeScope, GENERAL_SCOPE_DECK, type ExportScope } from '../../backup/scope';
import { conceptRepository, lessonRepository, wordSetRepository } from '../../db/repositories';
import type { Lesson, WordSet } from '../../db/types';
import { GENERAL_DECK_NAME } from '../../wordsets';
import styles from './SettingsPage.module.css';

interface ExportScopeCardProps {
  scope: ExportScope;
  onChange: (scope: ExportScope) => void;
}

// What to export (Bản 9): a language, then a deck, then a lesson. A smaller
// scope gives a small file that is easy to read and edit. It says how many
// concepts the file will hold.
export function ExportScopeCard({ scope, onChange }: ExportScopeCardProps) {
  const [decks, setDecks] = useState<WordSet[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const s = normalizeScope(scope);

  // Decks and lessons on offer follow the language and the deck chosen.
  useEffect(() => {
    let current = true;
    void Promise.all([wordSetRepository.listActive(), lessonRepository.listActive()]).then(([allDecks, allLessons]) => {
      if (!current) return;
      setDecks(allDecks.filter((d) => d.lang === s.lang).sort((a, b) => a.name.localeCompare(b.name)));
      const deckId = s.deck === GENERAL_SCOPE_DECK ? undefined : s.deck;
      setLessons(
        s.deck
          ? allLessons
              .filter((l) => l.lang === s.lang && l.setId === deckId)
              .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
          : [],
      );
    });
    return () => {
      current = false;
    };
  }, [s.lang, s.deck]);

  // How many concepts are inside.
  useEffect(() => {
    let current = true;
    setCount(null);
    void Promise.all([conceptRepository.listActive(), wordSetRepository.listActive()]).then(([concepts, sets]) => {
      if (!current) return;
      setCount(conceptsInScope(concepts, s, new Set(sets.map((d) => d.id))).length);
    });
    return () => {
      current = false;
    };
  }, [s.lang, s.deck, s.lessonId]);

  return (
    <Card className={styles.card}>
      <h2>Phạm vi xuất</h2>
      <p className={styles.note}>
        Chọn ngôn ngữ, rồi deck, rồi bài để file nhỏ và dễ đọc. Không chọn gì thì xuất tất cả.
      </p>
      <div>
        <label className={fieldStyles.label} htmlFor="scope-lang">
          Ngôn ngữ
        </label>
        <select
          id="scope-lang"
          className={fieldStyles.input}
          value={s.lang ?? ''}
          onChange={(e) => onChange(normalizeScope({ lang: (e.target.value || undefined) as ExportScope['lang'] }))}
        >
          <option value="">Cả hai</option>
          <option value="en">Tiếng Anh</option>
          <option value="de">Tiếng Đức</option>
        </select>
      </div>
      {s.lang && (
        <div>
          <label className={fieldStyles.label} htmlFor="scope-deck">
            Deck
          </label>
          <select
            id="scope-deck"
            className={fieldStyles.input}
            value={s.deck ?? ''}
            onChange={(e) => onChange(normalizeScope({ lang: s.lang, deck: e.target.value || undefined }))}
          >
            <option value="">Tất cả deck</option>
            <option value={GENERAL_SCOPE_DECK}>{GENERAL_DECK_NAME}</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {s.deck && (
        <div>
          <label className={fieldStyles.label} htmlFor="scope-lesson">
            Bài
          </label>
          <select
            id="scope-lesson"
            className={fieldStyles.input}
            value={s.lessonId ?? ''}
            onChange={(e) => onChange(normalizeScope({ ...s, lessonId: e.target.value || undefined }))}
          >
            <option value="">Tất cả bài</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className={styles.note} role="status">
        {count === null ? 'Đang đếm…' : `${count} concept trong phạm vi này.`}
      </p>
    </Card>
  );
}
