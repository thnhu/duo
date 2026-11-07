import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db } from '../../db/schema';
import type { Concept, Lang, Lesson, WordSet } from '../../db/types';
import {
  countByLesson,
  deckOfFilter,
  listLessonConcepts,
  listLessons,
  listUnassignedConcepts,
} from '../../lessons';
import type { SetFilter } from '../../wordsets';
import { ConceptRow } from './ConceptRow';
import styles from './LibraryPage.module.css';

// "Chưa xếp bài" is not a stored lesson: the words of the deck that are in none.
export const NO_LESSON = 'none';

interface LessonBrowserProps {
  lang: Lang;
  filter: SetFilter;
  sets: WordSet[];
  // Which lesson is open: a lesson id, NO_LESSON, or none (the list of lessons).
  lessonKey: string | null;
  onOpen: (lessonKey: string) => void;
}

// The "Bài" card of a deck: its lessons with their sizes; opening one lists its
// words (about twenty). Rows are read only when a lesson is opened, like the
// other sub decks.
export function LessonBrowser({ lang, filter, sets, lessonKey, onOpen }: LessonBrowserProps) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [unassigned, setUnassigned] = useState(0);
  const [words, setWords] = useState<Concept[] | null>(null);

  const deck = deckOfFilter(filter);
  const setId = deck.ok ? deck.setId : undefined;
  const filterKey = filter.kind === 'set' ? filter.id : filter.kind;

  async function load() {
    if (!deck.ok) return;
    const list = await listLessons(lang, setId);
    setLessons(list);
    setCounts(await countByLesson(lang, setId));
    setUnassigned((await listUnassignedConcepts(lang, filter, sets)).length);
    if (!lessonKey) setWords(null);
    else if (lessonKey === NO_LESSON) setWords(await listUnassignedConcepts(lang, filter, sets));
    else setWords(await listLessonConcepts(lang, lessonKey));
  }

  useEffect(() => {
    setLessons(null);
    setWords(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, filterKey, lessonKey, sets]);

  // Moving a word between lessons (or undoing a delete) updates what is shown.
  useEffect(() => {
    const watch = liveQuery(async () => [
      await db.concepts.count(),
      (await db.concepts.orderBy('updatedAt').last())?.updatedAt,
      await db.lessons.count(),
      (await db.lessons.orderBy('updatedAt').last())?.updatedAt,
    ]);
    let first = true;
    const sub = watch.subscribe(() => {
      if (first) {
        first = false;
        return;
      }
      void load();
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, filterKey, lessonKey, sets]);

  if (!deck.ok) return <p className={styles.empty}>Chọn một deck để xem các bài của nó.</p>;
  if (!lessons) return null;

  if (lessonKey) {
    const name = lessonKey === NO_LESSON ? 'Chưa xếp bài' : lessons.find((l) => l.id === lessonKey)?.name;
    if (name === undefined) return <p className={styles.empty}>Không tìm thấy bài này.</p>;
    return (
      <>
        <p className={styles.empty}>
          <strong>{name}</strong>
          {words ? ` · ${words.length} từ` : ''}
        </p>
        {words && words.length === 0 && <p className={styles.empty}>Bài này còn trống.</p>}
        <div className={styles.list}>
          {words?.map((concept) => (
            <ConceptRow key={concept.id} concept={concept} />
          ))}
        </div>
      </>
    );
  }

  const cards = [
    ...lessons.map((l) => ({ key: l.id, label: l.name, n: counts.get(l.id) ?? 0 })),
    ...(unassigned > 0 ? [{ key: NO_LESSON, label: 'Chưa xếp bài', n: unassigned }] : []),
  ];
  return (
    <>
      {cards.length === 0 && (
        <p className={styles.empty}>Deck này chưa có bài nào. Tạo ở "Quản lý bài" hoặc nhập file có cột lesson.</p>
      )}
      <div className={styles.deckGrid} role="list" aria-label="Bài">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            role="listitem"
            className={styles.deckCard}
            onClick={() => onOpen(card.key)}
          >
            <span className={styles.deckName}>{card.label}</span>
            <span className={styles.deckCount}>{card.n} từ</span>
          </button>
        ))}
      </div>
    </>
  );
}
