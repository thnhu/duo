import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import fieldStyles from '../../ui/field.module.css';
import type { Lang, Lesson } from '../../db/types';
import { createLesson, listLessons } from '../../lessons';

// One deck a lesson can come from; `setId` undefined = the General deck.
export interface LessonDeck {
  setId: string | undefined;
  label: string;
}

interface LessonSelectProps {
  id: string;
  lang: Lang;
  // The deck(s) the word is in. Lessons are listed per deck (grouped when there
  // are several); a new lesson can be made here only when there is one deck.
  decks: LessonDeck[];
  // '' = no lesson.
  value: string;
  onChange: (lessonId: string) => void;
  label?: string;
}

const NEW = '__new__';

// "Bài": the lesson of a word, picked from a list (never typed on the word, so
// one topic cannot split into two by a typo). "+ Tạo bài mới…" makes one in
// the deck on the spot.
export function LessonSelect({ id, lang, decks, value, onChange, label = 'Bài' }: LessonSelectProps) {
  const [groups, setGroups] = useState<Array<{ deck: LessonDeck; lessons: Lesson[] }>>([]);
  const [making, setMaking] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const deckKey = decks.map((d) => d.setId ?? 'general').join(',');

  async function load() {
    const loaded = await Promise.all(
      decks.map(async (deck) => ({ deck, lessons: await listLessons(lang, deck.setId) })),
    );
    setGroups(loaded);
  }

  useEffect(() => {
    setMaking(false);
    setDraft('');
    setError('');
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, deckKey]);

  const canMake = decks.length === 1;
  const known = groups.some((g) => g.lessons.some((l) => l.id === value));

  async function handleCreate() {
    setError('');
    const result = await createLesson(lang, decks[0]?.setId, draft);
    if (!result.ok) {
      setError(result.reason === 'duplicate' ? 'Deck này đã có bài cùng tên.' : 'Hãy nhập tên bài.');
      return;
    }
    setMaking(false);
    setDraft('');
    await load();
    onChange(result.lesson.id);
  }

  return (
    <div>
      <label className={fieldStyles.label} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={fieldStyles.input}
        // A lesson that is no longer in the list (other deck) shows as none.
        value={making ? NEW : known ? value : ''}
        onChange={(e) => {
          if (e.target.value === NEW) setMaking(true);
          else {
            setMaking(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">— không có bài —</option>
        {groups.map(({ deck, lessons }) =>
          decks.length > 1 ? (
            <optgroup key={deck.setId ?? 'general'} label={deck.label}>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
          ) : (
            lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))
          ),
        )}
        {canMake && <option value={NEW}>+ Tạo bài mới…</option>}
      </select>
      {making && (
        <>
          <input
            className={fieldStyles.input}
            aria-label="Tên bài mới"
            value={draft}
            autoFocus
            placeholder="vd: Family"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleCreate();
              }
            }}
          />
          {error && <p className={fieldStyles.error}>{error}</p>}
          <ButtonRow>
            <Button variant="secondary" disabled={!draft.trim()} onClick={() => void handleCreate()}>
              Tạo bài
            </Button>
            <Button variant="ghost" onClick={() => setMaking(false)}>
              Hủy
            </Button>
          </ButtonRow>
        </>
      )}
      {!canMake && decks.length > 1 && (
        <p className={fieldStyles.hint}>
          Từ nằm trong nhiều deck: chọn bài của một deck, hoặc tạo bài ở <Link to="/lessons">Quản lý bài</Link>.
        </p>
      )}
    </div>
  );
}
