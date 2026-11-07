import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../ui/Card';
import { useToast } from '../../ui/Toast';
import type { Concept, WordSet } from '../../db/types';
import { assignLesson } from '../../lessons';
import { GENERAL_DECK_NAME, listWordSets } from '../../wordsets';
import { LessonSelect, type LessonDeck } from './LessonSelect';
import styles from '../sets/Sets.module.css';

// The lesson of a concept, changed on the spot like its decks. Its choices are
// the lessons of the decks the concept is in (General when it is in none).
export function ConceptLessonCard({ concept, onChanged }: { concept: Concept; onChanged: () => void }) {
  const [decks, setDecks] = useState<WordSet[] | null>(null);
  const toast = useToast();

  useEffect(() => {
    void listWordSets(concept.lang).then(setDecks);
  }, [concept.lang, concept.setIds]);

  if (!decks) return null;
  const mine = (concept.setIds ?? []).map((id) => decks.find((d) => d.id === id)).filter((d): d is WordSet => !!d);
  const options: LessonDeck[] =
    mine.length > 0
      ? mine.map((d) => ({ setId: d.id, label: d.name }))
      : [{ setId: undefined, label: GENERAL_DECK_NAME }];

  async function handleChange(lessonId: string) {
    const result = await assignLesson(concept.id, lessonId || undefined);
    if (!result.ok) {
      toast.show('Bài này không thuộc deck nào của concept.', { kind: 'error' });
      return;
    }
    toast.show(lessonId ? 'Đã xếp concept vào bài.' : 'Đã đưa concept ra khỏi bài.', { kind: 'info' });
    onChanged();
  }

  return (
    <Card className={styles.card}>
      <h2>Bài</h2>
      <LessonSelect
        id="concept-lesson"
        lang={concept.lang}
        decks={options}
        value={concept.lessonId ?? ''}
        onChange={(id) => void handleChange(id)}
        label="Bài của concept"
      />
      <p className={styles.hint}>
        Một concept thuộc một bài, và bài nằm trong một deck của concept. <Link to="/lessons">Quản lý bài</Link>
      </p>
    </Card>
  );
}
