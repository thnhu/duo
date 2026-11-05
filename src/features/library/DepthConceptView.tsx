import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { LinkButton } from '../../ui/LinkButton';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { SETTINGS_ID } from '../../db/defaults';
import { conceptRepository, settingsRepository } from '../../db/repositories';
import type { AttributeValueSets, Concept, Example } from '../../db/types';
import {
  addExpression,
  groupExpressions,
  listExpressions,
  loadDepthSettings,
  triFoldProgress,
  type TriFoldProgress,
} from '../../depth';
import { useToast } from '../../ui/Toast';
import { deleteConceptCascade, deleteExample, restoreDeleted } from './actions';
import { ConceptSetsCard } from '../sets/ConceptSetsCard';
import styles from './ConceptDetailPage.module.css';

const LABEL_KEYS = ['tone', 'mode', 'register', 'nuance', 'dialect'] as const;
const KEY_TITLE: Record<(typeof LABEL_KEYS)[number], string> = {
  tone: 'Tone',
  mode: 'Mode',
  register: 'Register',
  nuance: 'Nuance',
  dialect: 'Dialect',
};

// A depth concept is an IDEA; this screen is its shelf (spec 1.4): the
// different ways of saying it, each with the labels that tell them apart,
// and how close the idea is to "tri-fold" (several distinct ways).
export function DepthConceptView({ concept, onChanged }: { concept: Concept; onChanged: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(concept.text);
  const [description, setDescription] = useState(concept.meanings[0] ?? '');
  const [expressions, setExpressions] = useState<Example[]>([]);
  const [progress, setProgress] = useState<TriFoldProgress | null>(null);
  const [draft, setDraft] = useState('');
  // Shelf view: group the ways of saying the idea by one label (or not).
  const [groupBy, setGroupBy] = useState<(typeof LABEL_KEYS)[number] | ''>('');
  const [valueSets, setValueSets] = useState<AttributeValueSets | null>(null);

  async function load() {
    const [list, settings] = await Promise.all([listExpressions(concept.id), loadDepthSettings()]);
    setExpressions(list);
    setProgress(triFoldProgress(list, settings.minExpressions));
    setValueSets((await settingsRepository.getById(SETTINGS_ID))?.attributeValueSets ?? null);
  }

  useEffect(() => {
    void load();
  }, [concept.id]);

  async function handleSave() {
    if (!name.trim()) {
      toast.show('Hãy nhập tên concept trước khi lưu.', { kind: 'error' });
      return;
    }
    await conceptRepository.update(concept.id, {
      text: name.trim(),
      meanings: description.trim() ? [description.trim()] : [],
    });
    onChanged();
    toast.show(`Đã lưu "${name.trim()}".`);
    navigate('/library');
  }

  async function handleAdd() {
    if (!draft.trim()) return;
    const text = draft.trim();
    await addExpression(concept, draft);
    setDraft('');
    await load();
    toast.show(`Đã thêm "${text}".`);
  }

  async function handleDeleteExpression(example: Example) {
    const deleted = await deleteExample(example.id);
    await load();
    toast.show(`Đã xóa "${example.text}".`, {
      action: {
        label: 'Hoàn tác',
        onClick: async () => {
          await restoreDeleted(deleted);
          await load();
        },
      },
    });
  }

  async function handleDeleteConcept() {
    const deleted = await deleteConceptCascade(concept.id);
    navigate('/library');
    toast.show(`Đã xóa "${concept.text}" và các cách diễn đạt của nó.`, {
      action: { label: 'Hoàn tác', onClick: () => restoreDeleted(deleted) },
    });
  }

  const duplicateIds = new Set(progress?.duplicates.map((e) => e.id));
  const groups = groupBy
    ? groupExpressions(expressions, groupBy, (valueSets?.[groupBy] as string[] | undefined) ?? [])
    : [{ value: null as string | null, expressions, plain: true }];

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
        <ButtonRow>
        <LinkButton to={`/tree/${concept.id}`}>Xem cây (concept cha, con)</LinkButton>
        <LinkButton to={`/links/${concept.id}`}>Liên kết cha/con</LinkButton>
      </ButtonRow>
        <ButtonRow>
          <Button onClick={() => void handleSave()}>Lưu</Button>
          <Button variant="destructive" onClick={() => void handleDeleteConcept()}>
            Xóa
          </Button>
        </ButtonRow>
      </div>

      <ConceptSetsCard concept={concept} onChanged={onChanged} />

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
        {expressions.length > 1 && (
          <div>
            <label className={fieldStyles.label} htmlFor="depth-group">
              Gom theo
            </label>
            <select
              id="depth-group"
              className={fieldStyles.input}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
            >
              <option value="">Không gom</option>
              {LABEL_KEYS.map((k) => (
                <option key={k} value={k}>
                  {KEY_TITLE[k]}
                </option>
              ))}
            </select>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.value ?? '__none__'}>
            {groupBy && (
              <h3>
                {group.value === null ? 'Chưa gắn nhãn' : `${KEY_TITLE[groupBy]}: ${group.value}`} (
                {group.expressions.length})
              </h3>
            )}
            <div className={styles.examples}>
              {group.expressions.map((example) => (
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
                <LinkButton to={`/example/${example.id}`}>
                  Sửa / gắn nhãn
                </LinkButton>
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
        ))}
      </div>
    </section>
  );
}
