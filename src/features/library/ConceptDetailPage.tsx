import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { listExamplesForConcept } from '../../db/queries';
import { computeProgress, type AcquisitionProgress } from '../../acquisition';
import { loadCriteria } from '../../acquisition/update';
import { conceptRepository, reviewLogRepository } from '../../db/repositories';
import type { AcquisitionCriteria, Concept, Example } from '../../db/types';
import { deleteConceptCascade, deleteExample } from './actions';
import { isSingleWord, lookupQueue } from '../../lookup';
import { dismissSuggestion, markVerified } from '../../lookup/apply';
import { LookupReview } from '../lookup/LookupReview';
import { useLookupQueue } from '../lookup/useLookupQueue';
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

  // A lookup started from here (or the Library) finishes in the background:
  // reload when the queue makes progress so the suggestion appears.
  const queue = useLookupQueue();
  useEffect(() => {
    if (conceptId) void load(conceptId);
  }, [queue.done, queue.status]);

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

      <GrammarSummary concept={concept} />

      <AcquisitionCard concept={concept} />

      {concept.lookup?.status === 'found' && (
        <LookupReview concept={concept} onChanged={() => void load(concept.id)} />
      )}

      {concept.lookup?.status === 'not-found' && (
        <Card tinted className={styles.lookupCard}>
          <p>Từ điển không có mục từ này — hãy tự nhập nghĩa.</p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => lookupQueue.enqueue([concept.id])}>
              Tra lại
            </Button>
            <Button variant="ghost" onClick={() => void dismissSuggestion(concept.id).then(() => load(concept.id))}>
              Ẩn
            </Button>
          </div>
        </Card>
      )}

      {!concept.lookup && (
        <Card tinted className={styles.lookupCard}>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={!isSingleWord(concept.text) || queue.status === 'running'}
              onClick={() => lookupQueue.enqueue([concept.id])}
            >
              {queue.status === 'running' ? 'Đang tra cứu…' : 'Tra cứu từ này'}
            </Button>
            {concept.verification === 'unverified' && (
              <Button variant="ghost" onClick={() => void markVerified(concept.id).then(() => load(concept.id))}>
                Đánh dấu đã duyệt
              </Button>
            )}
          </div>
          {!isSingleWord(concept.text) && (
            <p className={styles.note}>Chỉ tra cứu được từ đơn (không gửi cụm nhiều từ ra ngoài).</p>
          )}
          {queue.status === 'paused' && queue.error && (
            <p className={styles.note}>{queue.error.message}</p>
          )}
        </Card>
      )}

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
                {example.attributesStatus === 'verified' && <span className={styles.minimalTag}>Đã gắn nhãn</span>}
                <Link to={`/example/${example.id}`} className={styles.editLink}>
                  Sửa / gắn nhãn
                </Link>
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

// Progress against the acquisition criteria (journey J8).
function AcquisitionCard({ concept }: { concept: Concept }) {
  const [view, setView] = useState<{
    progress: AcquisitionProgress;
    criteria: AcquisitionCriteria;
    answers: number;
  } | null>(null);

  useEffect(() => {
    let current = true;
    void Promise.all([reviewLogRepository.listByConceptId(concept.id), loadCriteria()]).then(
      ([logs, criteria]) => {
        if (!current) return;
        setView({
          progress: computeProgress(logs, criteria, concept.progressResetAt),
          criteria,
          answers: logs.length,
        });
      },
    );
    return () => {
      current = false;
    };
  }, [concept.id, concept.progressResetAt, concept.status]);

  if (!view) return null;
  const { progress, criteria } = view;
  return (
    <Card tinted className={styles.lookupCard}>
      <p>
        <strong>{concept.status === 'acquired' ? 'Đã thụ đắc' : 'Tiến độ thụ đắc'}</strong>
        {view.answers === 0 && ' — chưa làm bài nào với từ này.'}
      </p>
      {view.answers > 0 && (
        <ul className={styles.note}>
          <li>
            Đúng và nhanh: {progress.correct}/{criteria.minCorrect} lần
          </li>
          <li>
            Số ví dụ khác nhau: {progress.contexts}/{criteria.minDistinctContexts}
          </li>
          <li>
            Số ngày khác nhau: {progress.days}/{criteria.minDistinctDays}
          </li>
        </ul>
      )}
    </Card>
  );
}

function GrammarSummary({ concept }: { concept: Concept }) {
  const g = concept.grammar;
  const parts: string[] = [];
  if (g?.gender) parts.push(g.gender);
  if (g?.plural) parts.push(`Pl. ${g.plural}`);
  if (g?.verbForms) {
    const { infinitiv, praeteritum, partizip2 } = g.verbForms;
    parts.push([infinitiv, praeteritum, partizip2].filter(Boolean).join(' · '));
  }
  return (
    <div className={styles.summary}>
      <span className={concept.verification === 'verified' ? styles.verified : styles.unverified}>
        {concept.verification === 'verified' ? 'Đã duyệt' : 'Chưa duyệt'}
      </span>
      {parts.length > 0 && <span className={styles.grammar}>{parts.join(' — ')}</span>}
    </div>
  );
}
