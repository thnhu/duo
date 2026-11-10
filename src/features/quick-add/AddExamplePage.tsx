import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { LangToggle } from '../../ui/LangToggle';
import { useToast } from '../../ui/Toast';
import fieldStyles from '../../ui/field.module.css';
import { conceptRepository } from '../../db/repositories';
import { dictionaryIdForLang, listConceptsByDictionary } from '../../db/queries';
import type { Concept } from '../../db/types';
import { createExample, createWordFromHighlight } from '../example/actions';
import { ExampleFields, emptyDraft, type ExampleDraft } from '../example/ExampleFields';
import { ConceptPicker } from '../links/ConceptPicker';
import { createConceptWithDescription } from './actions';
import { useLastLanguage } from './useLastLanguage';
import styles from './AddConceptPage.module.css';

// "Thêm example": one way of saying something. The PO writes the sentence,
// highlights the phrase to learn (e.g. "a lot of" in "I have a lot of houses"),
// sets the TMRND labels and picks the concept it belongs to ("số lượng nhiều").
// The phrase is NOT turned into a concept; the example is linked to the chosen
// one. With no concept picked it waits in the inbox.
export function AddExamplePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [lang, setLang] = useLastLanguage();
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [draft, setDraft] = useState<ExampleDraft>(emptyDraft);
  const [keep, setKeep] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadConcepts(currentLang: typeof lang) {
    const dictionaryId = await dictionaryIdForLang(currentLang);
    setConcepts(await listConceptsByDictionary(dictionaryId));
  }

  useEffect(() => {
    void loadConcepts(lang);
  }, [lang]);

  // /add/example?concept=<id> opens with that concept already chosen.
  const presetId = params.get('concept');
  useEffect(() => {
    if (!presetId) return;
    void conceptRepository.getById(presetId).then((found) => {
      if (found && found.deletedAt === undefined) {
        setLang(found.lang);
        setConcept(found);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId]);

  async function addConcept(text: string) {
    if (!text) return;
    const dictionaryId = await dictionaryIdForLang(lang);
    const { concept: created } = await createConceptWithDescription(dictionaryId, lang, text, '');
    await loadConcepts(lang);
    setConcept(created);
    toast.show(`Đã tạo concept "${created.text}".`);
  }

  async function save(next: boolean) {
    if (!draft.text.trim() || saving) return;
    setSaving(true);
    try {
      const dictionaryId = await dictionaryIdForLang(lang);
      const created = await createExample({ ...draft, dictionaryId, conceptId: concept?.id });
      if (!created) return;
      const made = draft.alsoWord ? await createWordFromHighlight(created, lang) : null;
      const wordNote = made ? (made.created ? ` Cụm "${made.word.text}" đã thành word để học.` : ` Đã thêm vào word "${made.word.text}".`) : '';
      if (next) {
        // Keep the concept and (with the box ticked) the labels for the next sentence.
        setDraft(keep ? { ...emptyDraft(), attributes: draft.attributes, labelsChosen: draft.labelsChosen } : emptyDraft());
        toast.show(concept ? `Đã thêm example vào "${concept.text}".${wordNote} Nhập câu kế tiếp.` : 'Đã lưu vào Hộp chờ duyệt.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      toast.show(concept ? `Đã thêm example vào "${concept.text}".${wordNote}` : 'Chưa chọn concept: example nằm trong Hộp chờ duyệt.');
      navigate(concept ? `/library/${concept.id}` : '/inbox');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Thêm example</h1>
        <LangToggle
          value={lang}
          onChange={(next) => {
            setLang(next);
            setConcept(null);
          }}
        />
      </div>
      <p className={fieldStyles.hint}>
        Example là một câu hoặc cách diễn đạt đang dùng. Tô sáng cụm cần học, gắn nhãn, rồi chọn concept mà nó thuộc
        về. <Link to="/add">Chọn loại khác</Link>
      </p>

      <ExampleFields idPrefix="new-example" draft={draft} onChange={setDraft} />

      <ConceptPicker
        id="example-concept"
        label="Thuộc concept"
        concepts={concepts}
        selected={concept}
        onSelect={setConcept}
        onAdd={addConcept}
      />
      {!concept && (
        <p className={fieldStyles.hint}>
          Chưa chọn concept thì example vào Hộp chờ duyệt, gắn concept sau. Gõ tên để tìm, hoặc thêm concept mới ngay
          tại đây.
        </p>
      )}

      <ButtonRow>
        <Button disabled={!draft.text.trim() || saving} onClick={() => void save(false)}>
          Lưu
        </Button>
        <Button variant="secondary" disabled={!draft.text.trim() || saving} onClick={() => void save(true)}>
          Lưu và nhập tiếp
        </Button>
      </ButtonRow>

      <label className={fieldStyles.hint}>
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Giữ nhãn TMRND cho example
        kế tiếp (concept luôn được giữ)
      </label>
    </section>
  );
}
