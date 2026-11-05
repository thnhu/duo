import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import { LinkButton } from '../../ui/LinkButton';
import fieldStyles from '../../ui/field.module.css';
import { SETTINGS_ID } from '../../db/defaults';
import { dictionaryIdForLang } from '../../db/queries';
import { conceptRepository, settingsRepository } from '../../db/repositories';
import type { Concept, ConceptLink, ConceptLinkType } from '../../db/types';
import {
  LINK_FAILURE_TEXT,
  describePair,
  reverseConceptLink,
  saveConceptLink,
  type PairState,
} from '../../links';
import { CONCEPT_LINK_LABEL } from '../../links/labels';
import { saveQuickWord } from '../quick-add/actions';
import { ConceptPicker } from './ConceptPicker';
import styles from './LinkEditorPage.module.css';

type Relation = ConceptLinkType | 'none';

// Concept link editor (spec R1-R4): pick the child, pick the parent, read
// "child -> parent", choose the relation, Save. "No link" removes the link.
export function LinkEditorPage() {
  const { conceptId } = useParams<{ conceptId?: string }>();
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [types, setTypes] = useState<ConceptLinkType[]>(['association', 'typeOf']);
  const [child, setChild] = useState<Concept | null>(null);
  const [parent, setParent] = useState<Concept | null>(null);
  const [pair, setPair] = useState<PairState>({ state: 'none' });
  const [relation, setRelation] = useState<Relation>('none');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [asking, setAsking] = useState<ConceptLink | null>(null);

  async function loadConcepts() {
    const [all, settings] = await Promise.all([
      conceptRepository.listActive(),
      settingsRepository.getById(SETTINGS_ID),
    ]);
    setConcepts(all.sort((a, b) => a.text.localeCompare(b.text)));
    if (settings) setTypes(settings.linkTypes.conceptConcept);
    return all;
  }

  useEffect(() => {
    void loadConcepts().then((all) => {
      const preset = conceptId ? all.find((c) => c.id === conceptId) : undefined;
      if (preset) setChild(preset);
    });
  }, [conceptId]);

  // Reading the current state of the chosen pair (R2: default is No link).
  const childId = child?.id;
  const parentId = parent?.id;
  useEffect(() => {
    setError('');
    setDone('');
    setAsking(null);
    if (!childId || !parentId) {
      setPair({ state: 'none' });
      setRelation('none');
      return;
    }
    void describePair(childId, parentId).then((p) => {
      setPair(p);
      setRelation(p.state === 'same' ? p.link.type : 'none');
    });
  }, [childId, parentId]);

  // Candidates must share a dictionary with the other side.
  const sameDict = (other: Concept | null) =>
    concepts.filter((c) => (!other || c.dictionaryId === other.dictionaryId) && c.id !== other?.id);

  async function addConcept(text: string, other: Concept | null, setter: (c: Concept) => void) {
    const lang = other?.lang ?? 'en';
    const dictionaryId = other?.dictionaryId ?? (await dictionaryIdForLang(lang));
    const { concept } = await saveQuickWord(dictionaryId, lang, text);
    await loadConcepts();
    setter(concept);
  }

  const current: Relation = pair.state === 'same' ? pair.link.type : 'none';
  const changed = pair.state === 'reversed' ? relation !== 'none' : relation !== current;

  async function afterSave(action: string) {
    if (!child || !parent) return;
    const p = await describePair(child.id, parent.id);
    setPair(p);
    setRelation(p.state === 'same' ? p.link.type : 'none');
    setDone(
      action === 'removed'
        ? 'Đã bỏ liên kết.'
        : action === 'created'
          ? 'Đã tạo liên kết.'
          : action === 'changed'
            ? 'Đã cập nhật liên kết.'
            : 'Không có gì thay đổi.',
    );
  }

  async function handleSave() {
    if (!child || !parent) return;
    setError('');
    setDone('');
    const result = await saveConceptLink(child.id, parent.id, relation === 'none' ? undefined : relation);
    if (!result.ok) {
      if (result.reason === 'reversed') setAsking(result.link);
      else setError(result.reason === 'cycle' ? `Vòng tròn: ${LINK_FAILURE_TEXT.cycle}` : LINK_FAILURE_TEXT[result.reason]);
      return;
    }
    await afterSave(result.action);
  }

  async function handleReverse() {
    if (!asking || relation === 'none') return;
    const result = await reverseConceptLink(asking, relation);
    setAsking(null);
    if (!result.ok) {
      if (result.reason !== 'reversed')
        setError(result.reason === 'cycle' ? `Vòng tròn: ${LINK_FAILURE_TEXT.cycle}` : LINK_FAILURE_TEXT[result.reason]);
      return;
    }
    await afterSave('changed');
  }

  return (
    <section className={styles.page}>
      <Link to="/library" className={styles.back}>
        ← Thư viện
      </Link>
      <h1>Liên kết concept</h1>
      <p className={fieldStyles.hint}>
        Liên kết luôn đọc theo chiều con → cha, ví dụ “blue” → “color” (Type of).
      </p>

      <ConceptPicker
        id="link-child"
        label="Concept con (*)"
        concepts={sameDict(parent)}
        selected={child}
        onSelect={setChild}
        onAdd={(t) => addConcept(t, parent, setChild)}
      />

      <Card className={styles.middle}>
        <p className={styles.pair}>
          <strong>{child?.text ?? '…'}</strong> <span className={styles.arrow}>→</span>{' '}
          <strong>{parent?.text ?? '…'}</strong>
        </p>
        <div>
          <label className={fieldStyles.label} htmlFor="link-relation">
            Quan hệ
          </label>
          <select
            id="link-relation"
            className={fieldStyles.input}
            value={relation}
            disabled={!child || !parent}
            onChange={(e) => {
              setRelation(e.target.value as Relation);
              setDone('');
            }}
          >
            <option value="none">No link</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {CONCEPT_LINK_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        {pair.state === 'reversed' && !asking && child && parent && (
          <p className={styles.notice}>
            “{parent.text}” đang là con của “{child.text}”. Lưu để đổi chiều.
          </p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {done && <p className={styles.notice}>{done}</p>}
        {asking && child && parent && (
          <div className={styles.dialog} role="alertdialog" aria-label="Đổi chiều liên kết">
            <p>
              “{parent.text}” hiện là con của “{child.text}”. Đổi chiều thành “{child.text}” là con của “{parent.text}”?
            </p>
            <ButtonRow>
              <Button variant="ghost" onClick={() => setAsking(null)}>
                Hủy
              </Button>
              <Button onClick={() => void handleReverse()}>Đổi chiều</Button>
            </ButtonRow>
          </div>
        )}
        <ButtonRow>
          <Button disabled={!child || !parent || !changed || asking !== null} onClick={() => void handleSave()}>
            Lưu
          </Button>
        </ButtonRow>
      </Card>

      <ConceptPicker
        id="link-parent"
        label="Concept cha (*)"
        concepts={sameDict(child)}
        selected={parent}
        onSelect={setParent}
        onAdd={(t) => addConcept(t, child, setParent)}
      />

      {(child || parent) && (
        <ButtonRow>
          {child && <LinkButton to={`/tree/${child.id}`}>Cây của “{child.text}”</LinkButton>}
          {parent && <LinkButton to={`/tree/${parent.id}`}>Cây của “{parent.text}”</LinkButton>}
        </ButtonRow>
      )}
    </section>
  );
}
