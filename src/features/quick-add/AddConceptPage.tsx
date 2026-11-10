import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import { LangToggle } from '../../ui/LangToggle';
import { useToast } from '../../ui/Toast';
import fieldStyles from '../../ui/field.module.css';
import { dictionaryIdForLang } from '../../db/queries';
import { addConceptToSet } from '../../wordsets';
import { textForSelection } from './highlight';
import { createConceptWithDescription } from './actions';
import { createExample, createWordFromHighlight } from '../example/actions';
import { ExampleFields, emptyDraft, type ExampleDraft } from '../example/ExampleFields';
import { DeckSelect } from '../sets/DeckSelect';
import { useLastLanguage } from './useLastLanguage';
import styles from './AddConceptPage.module.css';

// "Thêm concept": an idea (name + description) and, right below, the ways of
// saying it: each one an example with its highlighted phrase and TMRND labels,
// all linked to this concept (e.g. "chào hỏi" -> Hello / Hi / Greetings).
export function AddConceptPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [lang, setLang] = useLastLanguage();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [setId, setSetId] = useState('');
  const [added, setAdded] = useState<ExampleDraft[]>([]);
  const [draft, setDraft] = useState<ExampleDraft>(emptyDraft);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function addDraft() {
    if (!draft.text.trim()) return;
    setAdded([...added, draft]);
    setDraft(emptyDraft());
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const dictionaryId = await dictionaryIdForLang(lang);
      const { outcome, concept } = await createConceptWithDescription(dictionaryId, lang, trimmed, description);
      if (outcome === 'duplicate') {
        setError(`Concept "${concept.text}" đã có. Mở nó rồi thêm example, hoặc đổi tên.`);
        return;
      }
      if (setId) await addConceptToSet(concept.id, setId);
      // The box still being filled counts too, so the last example needs no extra click.
      const all = draft.text.trim() ? [...added, draft] : added;
      let wordsMade = 0;
      for (const item of all) {
        const created = await createExample({ ...item, dictionaryId, conceptId: concept.id });
        if (created && item.alsoWord && (await createWordFromHighlight(created, lang))?.created) wordsMade++;
      }
      toast.show(
        all.length > 0
          ? `Đã thêm concept "${concept.text}" và ${all.length} example${wordsMade > 0 ? `, ${wordsMade} word từ cụm tô sáng` : ''}.`
          : `Đã thêm concept "${concept.text}". Thêm example ở màn concept.`,
      );
      navigate(`/library/${concept.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Thêm concept</h1>
        <LangToggle
          value={lang}
          onChange={(next) => {
            setLang(next);
            setAdded([]);
            setDraft(emptyDraft());
          }}
        />
      </div>
      <p className={fieldStyles.hint}>
        Concept là một ý (nút để gom và tìm lại). Bên dưới, thêm các cách nói của ý đó: mỗi cách là một example, có
        thể tô sáng cụm và gắn nhãn. <Link to="/add">Chọn loại khác</Link>
      </p>

      <div>
        <label className={fieldStyles.label} htmlFor="concept-name">
          Tên concept (*)
        </label>
        <input
          id="concept-name"
          className={fieldStyles.input}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          placeholder="vd: chào hỏi, số lượng nhiều"
          autoFocus
        />
        {error && <p className={fieldStyles.error}>{error}</p>}
      </div>

      <div>
        <label className={fieldStyles.label} htmlFor="concept-description">
          Mô tả (không bắt buộc)
        </label>
        <textarea
          id="concept-description"
          className={fieldStyles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="vd: các cách chào người khác"
        />
      </div>

      <DeckSelect id="concept-deck" lang={lang} value={setId} onChange={setSetId} />

      <Card className={styles.examples}>
        <h2>Example của concept này ({added.length})</h2>

        {added.length > 0 && (
          <ul className={styles.list}>
            {added.map((item, index) => (
              <li key={index} className={styles.item}>
                <span>
                  {item.highlight ? (
                    <>
                      <span className={styles.context}>{item.text.slice(0, item.highlight.start)}</span>
                      <span className={styles.highlight}>{textForSelection(item.text, item.highlight)}</span>
                      <span className={styles.context}>{item.text.slice(item.highlight.end)}</span>
                    </>
                  ) : (
                    item.text
                  )}
                  {item.labelsChosen && (
                    <span className={styles.labels}>
                      {Object.values(item.attributes)
                        .filter((v) => v !== 'Neutral')
                        .join(' · ') || 'Neutral'}
                    </span>
                  )}
                </span>
                <Button variant="ghost" onClick={() => setAdded(added.filter((_, i) => i !== index))}>
                  Bỏ
                </Button>
              </li>
            ))}
          </ul>
        )}

        <ExampleFields idPrefix="concept-example" draft={draft} onChange={setDraft} />

        <ButtonRow>
          <Button variant="secondary" disabled={!draft.text.trim()} onClick={addDraft}>
            Thêm example này, nhập tiếp
          </Button>
        </ButtonRow>
      </Card>

      <ButtonRow>
        <Button disabled={!name.trim() || saving} onClick={() => void handleSave()}>
          Lưu concept
        </Button>
      </ButtonRow>
    </section>
  );
}
