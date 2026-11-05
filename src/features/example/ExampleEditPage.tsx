import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { SETTINGS_ID } from '../../db/defaults';
import { conceptRepository, exampleRepository, settingsRepository } from '../../db/repositories';
import { dictionaryIdForLang } from '../../db/queries';
import type { AttributeValueSets, Concept, Example, ExampleAttributes, Lang } from '../../db/types';
import { normalizeSelection, type Selection } from '../quick-add/highlight';
import { addSecondPhrase, clearExampleAttributes, createNextExample, saveExampleEdits } from './actions';
import { useToast } from '../../ui/Toast';
import { ExampleLinksCard } from './ExampleLinksCard';
import styles from './ExampleEditPage.module.css';

// Attribute display order and labels. The value lists come from Settings
// (PVO defaults), so adding a value needs no change here (spec 7).
const ATTRIBUTES: Array<{ key: keyof ExampleAttributes; label: string; hint: string }> = [
  { key: 'tone', label: 'Tone', hint: 'Mức trang trọng' },
  { key: 'mode', label: 'Mode', hint: 'Nói hay viết' },
  { key: 'register', label: 'Register', hint: 'Lĩnh vực sử dụng' },
  { key: 'nuance', label: 'Nuance', hint: 'Sắc thái' },
  { key: 'dialect', label: 'Dialect', hint: 'Phương ngữ' },
];

const STATUS_LABEL = {
  empty: 'Chưa gắn nhãn',
  suggested: 'Nhãn gợi ý, chưa duyệt',
  verified: 'Nhãn đã duyệt',
} as const;

export function ExampleEditPage() {
  const { exampleId } = useParams<{ exampleId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [example, setExample] = useState<Example | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [valueSets, setValueSets] = useState<AttributeValueSets | null>(null);
  const [attributes, setAttributes] = useState<ExampleAttributes | null>(null);
  const [note, setNote] = useState('');
  const [highlight, setHighlight] = useState<Selection | null>(null);
  const [message, setMessage] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const [keep, setKeep] = useState(true);
  const [nextText, setNextText] = useState<string | null>(null);

  async function load(id: string) {
    const found = await exampleRepository.getById(id);
    if (!found || found.deletedAt !== undefined) return;
    setExample(found);
    setAttributes(found.attributes);
    setNote(found.note ?? '');
    setHighlight(found.highlight ?? null);
    setConcept(
      found.targetConceptId ? ((await conceptRepository.getById(found.targetConceptId)) ?? null) : null,
    );
    setLang((await dictionaryIdForLang('de')) === found.dictionaryId ? 'de' : 'en');
    const settings = await settingsRepository.getById(SETTINGS_ID);
    setValueSets(settings?.attributeValueSets ?? null);
  }

  useEffect(() => {
    if (exampleId) void load(exampleId);
  }, [exampleId]);

  if (!example || !attributes || !valueSets) {
    return (
      <section className={styles.page}>
        <Link to="/library" className={styles.back}>
          ← Thư viện
        </Link>
        <p>Đang tải...</p>
      </section>
    );
  }

  const backTo = concept ? `/library/${concept.id}` : '/inbox';
  const backLabel = concept ? `← ${concept.text}` : '← Hộp chờ duyệt';
  // A minimal example is just the concept text: nothing to re-highlight.
  // A depth expression is a whole phrase: nothing to highlight inside it.
  const canHighlight = !example.isMinimal && concept?.mode !== 'depth';

  function handlePickHighlight() {
    const textarea = textareaRef.current;
    if (!textarea || !example) return;
    const picked = normalizeSelection(example.text, {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });
    if (!picked) {
      setMessage('Hãy kéo chọn một cụm trong câu trước.');
      return;
    }
    setHighlight(picked);
    setMessage('');
  }

  function handleHighlightAll() {
    if (!example) return;
    setHighlight(normalizeSelection(example.text, { start: 0, end: example.text.length }));
    setMessage('');
  }

  // Writes the edits; the callers decide where to go next.
  async function persist(): Promise<boolean> {
    if (!example || !attributes) return false;
    const changedHighlight =
      highlight &&
      (highlight.start !== example.highlight?.start || highlight.end !== example.highlight?.end)
        ? highlight
        : undefined;
    const saved = await saveExampleEdits(example, { highlight: changedHighlight, attributes, note });
    if (!saved) {
      setMessage('Không lưu được: cụm tô sáng không hợp lệ.');
      return false;
    }
    setMessage('');
    await load(example.id);
    return true;
  }

  // Saved: a badge, then back to the concept (or the inbox), so nobody has
  // to find the way out.
  async function handleSave() {
    if (!(await persist())) return;
    toast.show('Đã lưu ví dụ. Nhãn được đánh dấu là đã duyệt.');
    navigate(backTo);
  }

  // "Save & next" (R5): save this one, then ask for the next sentence.
  async function handleSaveAndNext() {
    if (!(await persist())) return;
    toast.show('Đã lưu. Nhập câu kế tiếp bên dưới.');
    setNextText('');
  }

  async function handleCreateNext() {
    if (!example || !nextText?.trim()) return;
    // Saved just now, so read the stored row (labels and links) as the source.
    const saved = (await exampleRepository.getById(example.id)) ?? example;
    const created = await createNextExample(saved, nextText, keep);
    setNextText(null);
    toast.show('Đã tạo ví dụ kế tiếp.');
    navigate(`/example/${created.id}`);
  }

  async function handleClear() {
    if (!example) return;
    await clearExampleAttributes(example.id);
    setMessage('');
    toast.show('Đã bỏ nhãn.', { kind: 'info' });
    await load(example.id);
  }

  async function handleSecondPhrase() {
    if (!example) return;
    await addSecondPhrase(example);
    toast.show('Đã tạo ví dụ mới trong Hộp chờ duyệt, tô sáng cụm khác ở đó.', { kind: 'info' });
    navigate('/inbox');
  }

  return (
    <section className={styles.page}>
      <Link to={backTo} className={styles.back}>
        {backLabel}
      </Link>

      <div>
        <h1 className={styles.title}>{concept?.mode === 'depth' ? 'Sửa cách diễn đạt' : 'Sửa ví dụ'}</h1>
        <p className={styles.sentence}>
          {highlight ? (
            <>
              <span className={styles.context}>{example.text.slice(0, highlight.start)}</span>
              <span className={styles.highlight}>{example.text.slice(highlight.start, highlight.end)}</span>
              <span className={styles.context}>{example.text.slice(highlight.end)}</span>
            </>
          ) : (
            example.text
          )}
        </p>
        {concept && <p className={fieldStyles.hint}>Concept: {concept.text}</p>}
      </div>

      {canHighlight && (
        <Card className={styles.section}>
          <h2>Cụm cần học</h2>
          <textarea
            ref={textareaRef}
            className={fieldStyles.textarea}
            value={example.text}
            readOnly
            aria-label="Câu ví dụ, kéo chọn cụm cần học"
          />
          <ButtonRow>
            <Button variant="secondary" onClick={handlePickHighlight}>
              Tô sáng cụm đã chọn
            </Button>
            <Button variant="ghost" onClick={handleHighlightAll}>
              Tô cả câu
            </Button>
          </ButtonRow>
          <p className={fieldStyles.hint}>
            Chỉ cụm tô sáng được kiểm tra; phần còn lại là ngữ cảnh. Concept giữ nguyên, chỉ vị trí tô sáng đổi.
          </p>
        </Card>
      )}

      <Card className={styles.section}>
        <div className={styles.statusRow}>
          <h2>Nhãn TMRND</h2>
          <span className={example.attributesStatus === 'verified' ? styles.verified : styles.unverified}>
            {STATUS_LABEL[example.attributesStatus]}
          </span>
        </div>
        {ATTRIBUTES.map(({ key, label, hint }) => (
          <div key={key}>
            <label className={fieldStyles.label} htmlFor={`attr-${key}`}>
              {label} <span className={styles.labelHint}>· {hint}</span>
            </label>
            <select
              id={`attr-${key}`}
              className={fieldStyles.input}
              value={attributes[key]}
              onChange={(e) => setAttributes({ ...attributes, [key]: e.target.value } as ExampleAttributes)}
            >
              {(valueSets[key] as string[]).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        ))}
        <p className={fieldStyles.hint}>
          Chọn "Other" thì ghi rõ trong ghi chú. Nhãn không có trong bộ (ví dụ slang) cũng ghi vào ghi chú.
        </p>
      </Card>

      <ExampleLinksCard example={example} lang={lang} onMainChanged={() => void load(example.id)} />

      <div>
        <label className={fieldStyles.label} htmlFor="example-note">
          Ghi chú
        </label>
        <textarea
          id="example-note"
          className={fieldStyles.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="vd: slang"
        />
      </div>

      {message && <p className={fieldStyles.hint}>{message}</p>}

      <ButtonRow>
        <Button onClick={() => void handleSave()}>Lưu</Button>
        <Button variant="secondary" onClick={() => void handleSaveAndNext()}>
          Lưu và nhập tiếp
        </Button>
        {example.attributesStatus !== 'empty' && (
          <Button variant="ghost" onClick={() => void handleClear()}>
            Bỏ nhãn
          </Button>
        )}
      </ButtonRow>

      <label className={styles.keep}>
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        Giữ tham số (liên kết và nhãn) cho ví dụ kế tiếp
      </label>

      {nextText !== null && (
        <Card tinted className={styles.section}>
          <h2>Ví dụ kế tiếp</h2>
          <textarea
            className={fieldStyles.textarea}
            value={nextText}
            onChange={(e) => setNextText(e.target.value)}
            aria-label="Câu của ví dụ kế tiếp"
            placeholder="Nhập câu kế tiếp…"
          />
          <ButtonRow>
            <Button variant="ghost" onClick={() => setNextText(null)}>
              Hủy
            </Button>
            <Button disabled={!nextText.trim()} onClick={() => void handleCreateNext()}>
              Tạo và sửa tiếp
            </Button>
          </ButtonRow>
        </Card>
      )}

      {canHighlight && concept && (
        <Card tinted className={styles.section}>
          <Button variant="secondary" onClick={() => void handleSecondPhrase()}>
            Học thêm cụm khác trong câu này
          </Button>
          <p className={fieldStyles.hint}>
            Tạo một ví dụ mới với cùng câu; bạn tô sáng cụm khác ở Hộp chờ duyệt.
          </p>
        </Card>
      )}
    </section>
  );
}
