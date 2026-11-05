import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import type { Concept, WordSet } from '../../db/types';
import { addConceptToSet, createWordSet, listWordSets, setConceptSets } from '../../wordsets';
import styles from './Sets.module.css';

// Which word sets a concept is in. A concept can be in several sets, so the
// same word is entered once and shows up in each of them.
export function ConceptSetsCard({ concept, onChanged }: { concept: Concept; onChanged: () => void }) {
  const [sets, setSets] = useState<WordSet[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void listWordSets(concept.lang).then(setSets);
  }, [concept.lang, concept.setIds]);

  const current = new Set(concept.setIds ?? []);

  async function toggle(set: WordSet, on: boolean) {
    const next = on ? [...current, set.id] : [...current].filter((id) => id !== set.id);
    await setConceptSets(concept.id, next);
    onChanged();
  }

  async function handleCreate() {
    setError('');
    const result = await createWordSet(concept.lang, draft);
    if (!result.ok) {
      setError(result.reason === 'duplicate' ? 'Đã có deck cùng tên.' : 'Hãy nhập tên deck.');
      return;
    }
    await addConceptToSet(concept.id, result.set.id);
    setDraft('');
    onChanged();
  }

  return (
    <Card className={styles.card}>
      <h2>Deck</h2>
      {sets.length === 0 && <p className={styles.hint}>Chưa có deck nào. Tạo deck đầu tiên bên dưới.</p>}
      {sets.map((set) => (
        <label key={set.id} className={styles.check}>
          <input type="checkbox" checked={current.has(set.id)} onChange={(e) => void toggle(set, e.target.checked)} />
          {set.name}
        </label>
      ))}
      <div>
        <label className={fieldStyles.label} htmlFor="concept-new-set">
          Tạo deck mới và thêm từ này vào
        </label>
        <input
          id="concept-new-set"
          className={fieldStyles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="vd: IT, Từ phim"
        />
        {error && <p className={fieldStyles.error}>{error}</p>}
      </div>
      <ButtonRow>
        <Button variant="secondary" disabled={!draft.trim()} onClick={() => void handleCreate()}>
          Tạo và thêm
        </Button>
      </ButtonRow>
      <p className={styles.hint}>
        Một từ có thể nằm trong nhiều deck mà không phải nhập lại. <Link to="/sets">Quản lý deck</Link>
      </p>
    </Card>
  );
}
