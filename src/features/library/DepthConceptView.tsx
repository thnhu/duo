import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { conceptRepository } from '../../db/repositories';
import type { Concept, Example } from '../../db/types';
import {
  addExpression,
  listExpressions,
  loadDepthSettings,
  triFoldProgress,
  type TriFoldProgress,
} from '../../depth';
import { deleteConceptCascade, deleteExample } from './actions';
import styles from './ConceptDetailPage.module.css';

const LABEL_KEYS = ['tone', 'mode', 'register', 'nuance', 'dialect'] as const;

// A depth concept is an IDEA; this screen is its shelf (spec 1.4): the
// different ways of saying it, each with the labels that tell them apart,
// and how close the idea is to "tri-fold" (several distinct ways).
export function DepthConceptView({ concept, onChanged }: { concept: Concept; onChanged: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(concept.text);
  const [description, setDescription] = useState(concept.meanings[0] ?? '');
  const [expressions, setExpressions] = useState<Example[]>([]);
  const [progress, setProgress] = useState<TriFoldProgress | null>(null);
  const [draft, setDraft] = useState('');

  async function load() {
    const [list, settings] = await Promise.all([listExpressions(concept.id), loadDepthSettings()]);
    setExpressions(list);
    setProgress(triFoldProgress(list, settings.minExpressions));
  }

  useEffect(() => {
    void load();
  }, [concept.id]);

  async function handleSave() {
    await conceptRepository.update(concept.id, {
      text: name.trim() || concept.text,
      meanings: description.trim() ? [description.trim()] : [],
    });
    onChanged();
  }

  async function handleAdd() {
    if (!draft.trim()) return;
    await addExpression(concept, draft);
    setDraft('');
    await load();
  }

  async function handleDeleteExpression(example: Example) {
    if (!confirm(`Xóa cách diễn đạt "${example.text}"?`)) return;
    await deleteExample(example.id);
    await load();
  }

  async function handleDeleteConcept() {
    if (!confirm(`Xóa concept "${concept.text}" và các cách diễn đạt của nó?`)) return;
    await deleteConceptCascade(concept.id);
    navigate('/library');
  }

  const duplicateIds = new Set(progress?.duplicates.map((e) => e.id));

  return (
    <section className={styles.page}>
      <Link to="/library" className={styles.back}>
        ← Thư viện
      </Link>

      <div className={styles.form}>
        <div>
          <label className={fieldStyles.label} htmlFor="depth-name">
            Tên concept (một ý)
          </label>
          <input
            id="depth-name"
            className={fieldStyles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className={fieldStyles.label} htmlFor="depth-desc">
            Mô tả (tiếng Việt)
          </label>
          <textarea
            id="depth-desc"
            className={fieldStyles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <Button onClick={() => void handleSave()}>Lưu</Button>
          <Button variant="destructive" onClick={() => void handleDeleteConcept()}>
            Xóa
          </Button>
        </div>
      </div>

      {progress && (
        <Card tinted className={styles.lookupCard}>
          <p>
            <strong>
              {progress.distinct}/{progress.needed} cách diễn đạt khác nhau
            </strong>
            {progress.complete && ' — đủ tri-fold.'}
          </p>
          <p className={styles.note}>
            Một cách chỉ được tính khi đã gắn nhãn TMRND và khác các cách trước ở ít nhất một nhãn.
            {progress.unlabelled.length > 0 && ` ${progress.unlabelled.length} cách chưa gắn nhãn.`}
            {progress.duplicates.length > 0 && ` ${progress.duplicates.length} cách trùng nhãn với cách khác.`}
          </p>
        </Card>
      )}

      <div>
        <h2>Các cách diễn đạt ({expressions.length})</h2>
        <div className={styles.form}>
          <input
            className={fieldStyles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd();
            }}
            placeholder="vd: a bunch of"
            aria-label="Thêm một cách diễn đạt"
          />
          <Button onClick={() => void handleAdd()} disabled={!draft.trim()}>
            Thêm cách diễn đạt
          </Button>
        </div>
        <div className={styles.examples}>
          {expressions.map((example) => (
            <Card key={example.id} className={styles.example}>
              <p className={styles.exampleText}>{example.text}</p>
              <div className={styles.exampleMeta}>
                {example.attributesStatus === 'verified' ? (
                  LABEL_KEYS.filter((k) => example.attributes[k] !== 'Neutral').map((k) => (
                    <span key={k} className={styles.minimalTag}>
                      {k}: {example.attributes[k]}
                    </span>
                  ))
                ) : (
                  <span className={styles.unverified}>Chưa gắn nhãn</span>
                )}
                {example.attributesStatus === 'verified' &&
                  LABEL_KEYS.every((k) => example.attributes[k] === 'Neutral') && (
                    <span className={styles.minimalTag}>Tất cả Neutral</span>
                  )}
                {duplicateIds.has(example.id) && <span className={styles.unverified}>Trùng nhãn</span>}
                {example.targetConceptId !== concept.id && (
                  <span className={styles.minimalTag}>Nối từ concept khác</span>
                )}
                <Link to={`/example/${example.id}`} className={styles.editLink}>
                  Sửa / gắn nhãn
                </Link>
                {example.targetConceptId === concept.id && (
                  <Button variant="ghost" onClick={() => void handleDeleteExpression(example)}>
                    Xóa
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
