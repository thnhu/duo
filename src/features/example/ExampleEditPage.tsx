import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { aiErrorText } from '../../ai/messages';
import { getAiProvider, loadAiConfig, loadApiKey } from '../../ai';
import { attributesFromSuggestion, dismissSuggestion, suggestForExample } from '../../ai/suggest';
import { SETTINGS_ID } from '../../db/defaults';
import { conceptRepository, exampleRepository, settingsRepository } from '../../db/repositories';
import type { AttributeValueSets, Concept, Example, ExampleAttributes } from '../../db/types';
import { normalizeSelection, type Selection } from '../quick-add/highlight';
import { SuggestionList } from '../labels/SuggestionList';
import { addSecondPhrase, clearExampleAttributes, saveExampleEdits } from './actions';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [example, setExample] = useState<Example | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [valueSets, setValueSets] = useState<AttributeValueSets | null>(null);
  const [attributes, setAttributes] = useState<ExampleAttributes | null>(null);
  const [note, setNote] = useState('');
  const [highlight, setHighlight] = useState<Selection | null>(null);
  const [message, setMessage] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

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
    const settings = await settingsRepository.getById(SETTINGS_ID);
    setValueSets(settings?.attributeValueSets ?? null);
    setAiEnabled((await loadAiConfig()).enabled);
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
  const canHighlight = !example.isMinimal;

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

  async function handleSave() {
    if (!example || !attributes) return;
    const changedHighlight =
      highlight &&
      (highlight.start !== example.highlight?.start || highlight.end !== example.highlight?.end)
        ? highlight
        : undefined;
    const saved = await saveExampleEdits(example, { highlight: changedHighlight, attributes, note });
    if (!saved) {
      setMessage('Không lưu được: cụm tô sáng không hợp lệ.');
      return;
    }
    setMessage('Đã lưu. Nhãn được đánh dấu là đã duyệt.');
    await load(example.id);
  }

  async function handleClear() {
    if (!example) return;
    await clearExampleAttributes(example.id);
    setMessage('Đã bỏ nhãn.');
    await load(example.id);
  }

  // Asks the AI for ONE example, only because the PO pressed the button.
  async function handleSuggest() {
    const provider = getAiProvider();
    if (!example || !provider) return;
    setSuggesting(true);
    setMessage('');
    try {
      await suggestForExample(example, provider);
      await load(example.id);
    } catch (error) {
      setMessage(aiErrorText(error));
    } finally {
      setSuggesting(false);
    }
  }

  // Fill the form with the suggested values; nothing is saved or verified
  // until the PO presses Lưu, and each label can still be changed first.
  function handleUseSuggestion() {
    if (!example?.suggestedAttributes || !attributes) return;
    setAttributes(attributesFromSuggestion(attributes, example.suggestedAttributes));
    setMessage('Đã điền gợi ý vào các ô. Sửa nếu cần, rồi bấm Lưu để duyệt.');
  }

  async function handleDismissSuggestion() {
    if (!example) return;
    await dismissSuggestion(example);
    await load(example.id);
  }

  async function handleSecondPhrase() {
    if (!example) return;
    await addSecondPhrase(example);
    navigate('/inbox');
  }

  return (
    <section className={styles.page}>
      <Link to={backTo} className={styles.back}>
        {backLabel}
      </Link>

      <div>
        <h1 className={styles.title}>Sửa ví dụ</h1>
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
          <div className={styles.actions}>
            <Button variant="secondary" onClick={handlePickHighlight}>
              Tô sáng cụm đã chọn
            </Button>
            <Button variant="ghost" onClick={handleHighlightAll}>
              Tô cả câu
            </Button>
          </div>
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
        {concept && !example.isMinimal && (
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={!aiEnabled || loadApiKey() === null || suggesting}
              onClick={() => void handleSuggest()}
            >
              {suggesting ? 'Đang hỏi AI…' : 'Gợi ý TMRND'}
            </Button>
          </div>
        )}
        {concept && !example.isMinimal && (!aiEnabled || loadApiKey() === null) && (
          <p className={fieldStyles.hint}>
            Muốn dùng AI gợi ý: bật AI và nhập khóa ở <Link to="/settings">Cài đặt</Link>. Gắn nhãn tay vẫn dùng
            được.
          </p>
        )}
        {example.suggestedAttributes && (
          <div className={styles.suggestion}>
            <p className={fieldStyles.hint}>
              AI gợi ý (chưa duyệt, chưa thành đáp án):
            </p>
            <SuggestionList suggestion={example.suggestedAttributes} />
            <div className={styles.actions}>
              <Button variant="secondary" onClick={handleUseSuggestion}>
                Điền gợi ý vào các ô
              </Button>
              <Button variant="ghost" onClick={() => void handleDismissSuggestion()}>
                Bỏ gợi ý
              </Button>
            </div>
          </div>
        )}
        <p className={fieldStyles.hint}>
          Chọn "Other" thì ghi rõ trong ghi chú. Nhãn không có trong bộ (ví dụ slang) cũng ghi vào ghi chú.
        </p>
      </Card>

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

      <div className={styles.actions}>
        <Button onClick={() => void handleSave()}>Lưu</Button>
        {example.attributesStatus !== 'empty' && (
          <Button variant="ghost" onClick={() => void handleClear()}>
            Bỏ nhãn
          </Button>
        )}
      </div>

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
