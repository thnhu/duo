import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { listExamplesForConcept } from '../../db/queries';
import { conceptRepository } from '../../db/repositories';
import type { Concept, Example } from '../../db/types';
import { deleteConceptCascade, deleteExample } from './actions';
import styles from './ConceptDetailPage.module.css';

export function ConceptDetailPage() {
  const { conceptId } = useParams<{ conceptId: string }>();
  const navigate = useNavigate();

  const [concept, setConcept] = useState<Concept | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [text, setText] = useState('');
  const [pos, setPos] = useState('');
  const [meanings, setMeanings] = useState('');

  async function load(id: string) {
    const found = await conceptRepository.getById(id);
    if (!found) return;
    setConcept(found);
    setText(found.text);
    setPos(found.pos ?? '');
    setMeanings(found.meanings.join('; '));
    setExamples(await listExamplesForConcept(id));
  }

  useEffect(() => {
    if (!conceptId) return;
    void load(conceptId);
  }, [conceptId]);

  async function handleSave() {
    if (!concept) return;
    await conceptRepository.update(concept.id, {
      text: text.trim(),
      pos: pos.trim() || undefined,
      meanings: meanings
        .split(';')
        .map((m) => m.trim())
        .filter(Boolean),
    });
    await load(concept.id);
  }

  async function handleDeleteConcept() {
    if (!concept) return;
    if (!confirm(`Xóa "${concept.text}" và mọi ví dụ của nó?`)) return;
    await deleteConceptCascade(concept.id);
    navigate('/library');
  }

  async function handleDeleteExample(exampleId: string) {
    if (!confirm('Xóa ví dụ này?')) return;
    await deleteExample(exampleId);
    if (conceptId) await load(conceptId);
  }

  if (!concept) {
    return (
      <section className={styles.page}>
        <Link to="/library" className={styles.back}>
          ← Thư viện
        </Link>
        <p>Đang tải...</p>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <Link to="/library" className={styles.back}>
        ← Thư viện
      </Link>

      <div className={styles.form}>
        <div>
          <label className={fieldStyles.label} htmlFor="concept-text">
            Từ / cụm từ
          </label>
          <input
            id="concept-text"
            className={fieldStyles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div className={styles.row}>
          <div>
            <label className={fieldStyles.label} htmlFor="concept-pos">
              Loại từ
            </label>
            <input
              id="concept-pos"
              className={fieldStyles.input}
              value={pos}
              onChange={(e) => setPos(e.target.value)}
              placeholder="vd: verb"
            />
          </div>
        </div>

        <div>
          <label className={fieldStyles.label} htmlFor="concept-meanings">
            Nghĩa (phân tách bằng ;)
          </label>
          <textarea
            id="concept-meanings"
            className={fieldStyles.textarea}
            value={meanings}
            onChange={(e) => setMeanings(e.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <Button onClick={() => void handleSave()}>Lưu</Button>
          <Button variant="destructive" onClick={() => void handleDeleteConcept()}>
            Xóa
          </Button>
        </div>
      </div>

      <div>
        <h2>Ví dụ ({examples.length})</h2>
        <div className={styles.examples}>
          {examples.map((example) => (
            <Card key={example.id} className={styles.example}>
              <p className={styles.exampleText}>
                {example.highlight ? (
                  <>
                    {example.text.slice(0, example.highlight.start)}
                    <span className={styles.highlight}>
                      {example.text.slice(example.highlight.start, example.highlight.end)}
                    </span>
                    {example.text.slice(example.highlight.end)}
                  </>
                ) : (
                  example.text
                )}
              </p>
              <div className={styles.exampleMeta}>
                {example.isMinimal && <span className={styles.minimalTag}>Example tối thiểu</span>}
                <Button variant="ghost" onClick={() => void handleDeleteExample(example.id)}>
                  Xóa
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
