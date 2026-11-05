import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { LinkButton } from '../../ui/LinkButton';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { listExamplesForConcept } from '../../db/queries';
import { computeProgress, type AcquisitionProgress } from '../../acquisition';
import { loadCriteria } from '../../acquisition/update';
import { conceptRepository, reviewLogRepository } from '../../db/repositories';
import type { AcquisitionCriteria, Concept, Example } from '../../db/types';
import { InlineConfirm } from '../../ui/InlineConfirm';
import { useToast } from '../../ui/Toast';
import { deleteConceptCascade, deleteExample, restoreDeleted } from './actions';
import { isSingleWord, lookupQueue } from '../../lookup';
import { dismissSuggestion, markVerified } from '../../lookup/apply';
import { LookupReview } from '../lookup/LookupReview';
import { useLookupQueue } from '../lookup/useLookupQueue';
import { DepthConceptView } from './DepthConceptView';
import { ConceptSetsCard } from '../sets/ConceptSetsCard';
import styles from './ConceptDetailPage.module.css';

export function ConceptDetailPage() {
  const { conceptId } = useParams<{ conceptId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [concept, setConcept] = useState<Concept | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [text, setText] = useState('');
  const [pos, setPos] = useState('');
  const [meanings, setMeanings] = useState('');
  // What is waiting for a yes/no: the whole concept, or one example.
  const [confirm, setConfirm] = useState<{ kind: 'concept' } | { kind: 'example'; id: string } | null>(null);

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
    if (!text.trim()) {
      toast.show('Hãy nhập tên concept trước khi lưu.', { kind: 'error' });
      return;
    }
    await conceptRepository.update(concept.id, {
      text: text.trim(),
      pos: pos.trim() || undefined,
      meanings: meanings
        .split(';')
        .map((m) => m.trim())
        .filter(Boolean),
    });
    // Saved: say so and go back to the Library, so nobody has to find the way.
    toast.show(`Đã lưu "${text.trim()}".`);
    navigate('/library');
  }

  // No "are you sure?" box: the delete is soft, so it can be undone.
  async function handleDeleteConcept() {
    if (!concept) return;
    setConfirm(null);
    const deleted = await deleteConceptCascade(concept.id);
    navigate('/library');
    toast.show(`Đã xóa "${concept.text}" và các ví dụ của nó.`, {
      action: { label: 'Hoàn tác', onClick: () => restoreDeleted(deleted) },
    });
  }

  async function handleDeleteExample(exampleId: string) {
    setConfirm(null);
    const deleted = await deleteExample(exampleId);
    if (conceptId) await load(conceptId);
    toast.show('Đã xóa ví dụ.', {
      action: {
        label: 'Hoàn tác',
        onClick: async () => {
          await restoreDeleted(deleted);
          if (conceptId) await load(conceptId);
        },
      },
    });
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

  // Depth concepts are ideas with several ways of saying them (spec 1.4).
  if (concept.mode === 'depth') {
    return <DepthConceptView concept={concept} onChanged={() => void load(concept.id)} />;
  }

  return (
    <section className={styles.page}>
      <Link to="/library" className={styles.back}>
        ← Thư viện
      </Link>

      <div className={styles.form}>
        <div>
          <label className={fieldStyles.label} htmlFor="concept-text">
            Concept (text)
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

        <ButtonRow>
          <Button onClick={() => void handleSave()}>Lưu</Button>
          <Button variant="destructive" onClick={() => setConfirm({ kind: 'concept' })}>
            Xóa
          </Button>
        </ButtonRow>
        {confirm?.kind === 'concept' && (
          <InlineConfirm
            confirmLabel="Xóa concept"
            onCancel={() => setConfirm(null)}
            onConfirm={() => void handleDeleteConcept()}
          >
            Xóa "{concept.text}" và {examples.length} ví dụ của nó?
          </InlineConfirm>
        )}
      </div>

      <ButtonRow>
        <LinkButton to={`/tree/${concept.id}`}>Xem cây (concept cha, con)</LinkButton>
        <LinkButton to={`/links/${concept.id}`}>Liên kết cha/con</LinkButton>
      </ButtonRow>

      <ConceptSetsCard concept={concept} onChanged={() => void load(concept.id)} />

      <GrammarSummary concept={concept} />

      <AcquisitionCard concept={concept} />

      {concept.lookup?.status === 'found' && (
        <LookupReview concept={concept} onChanged={() => void load(concept.id)} />
      )}

      {concept.lookup?.status === 'not-found' && (
        <Card tinted className={styles.lookupCard}>
          <p>Từ điển không có mục từ này — hãy tự nhập nghĩa.</p>
          <ButtonRow>
            <Button variant="secondary" onClick={() => lookupQueue.enqueue([concept.id])}>
              Tra lại
            </Button>
            <Button variant="ghost" onClick={() => void dismissSuggestion(concept.id).then(() => load(concept.id))}>
              Ẩn
            </Button>
          </ButtonRow>
        </Card>
      )}

      {!concept.lookup && (
        <Card tinted className={styles.lookupCard}>
          <ButtonRow>
            <Button
              variant="secondary"
              disabled={!isSingleWord(concept.text) || queue.status === 'running'}
              onClick={() => lookupQueue.enqueue([concept.id])}
            >
              {queue.status === 'running' ? 'Đang tra cứu…' : 'Tra cứu concept này'}
            </Button>
            {concept.verification === 'unverified' && (
              <Button variant="ghost" onClick={() => void markVerified(concept.id).then(() => load(concept.id))}>
                Đánh dấu đã duyệt
              </Button>
            )}
          </ButtonRow>
          {!isSingleWord(concept.text) && (
            <p className={styles.note}>Chỉ tra cứu được word đơn (không gửi cụm nhiều word ra ngoài).</p>
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
                <LinkButton to={`/example/${example.id}`}>
                  Sửa / gắn nhãn
                </LinkButton>
                <Button variant="ghost" onClick={() => setConfirm({ kind: 'example', id: example.id })}>
                  Xóa
                </Button>
              </div>
              {confirm?.kind === 'example' && confirm.id === example.id && (
                <InlineConfirm
                  confirmLabel="Xóa ví dụ"
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => void handleDeleteExample(example.id)}
                >
                  Xóa ví dụ này?
                </InlineConfirm>
              )}
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
        {view.answers === 0 && ' — chưa làm bài nào với concept này.'}
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
