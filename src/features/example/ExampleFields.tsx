import { useEffect, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import fieldStyles from '../../ui/field.module.css';
import { SETTINGS_ID, createDefaultAttributes } from '../../db/defaults';
import { settingsRepository } from '../../db/repositories';
import type { AttributeValueSets, ExampleAttributes } from '../../db/types';
import { addPart, splitByParts } from '../../core/highlights';
import { normalizeSelection, type Selection } from '../quick-add/highlight';
import styles from './ExampleFields.module.css';

// What the PO has typed for one new example, before it is saved.
export interface ExampleDraft {
  text: string;
  highlight: Selection | null;
  // Other parts of a split phrase (separable verb: fahren + ab).
  highlightExtra: Selection[];
  attributes: ExampleAttributes;
  // True once the PO touched a label; only then are the labels saved as chosen.
  labelsChosen: boolean;
  note: string;
  // Also turn the highlighted phrase into a Word to study (default on).
  alsoWord: boolean;
}

export function emptyDraft(): ExampleDraft {
  return { text: '', highlight: null, highlightExtra: [], attributes: createDefaultAttributes(), labelsChosen: false, note: '', alsoWord: true };
}

// Same five labels as the example editor; the value lists come from Settings.
const ATTRIBUTES: Array<{ key: keyof ExampleAttributes; label: string; hint: string }> = [
  { key: 'tone', label: 'Tone', hint: 'Mức trang trọng' },
  { key: 'mode', label: 'Mode', hint: 'Nói hay viết' },
  { key: 'register', label: 'Register', hint: 'Lĩnh vực sử dụng' },
  { key: 'nuance', label: 'Nuance', hint: 'Sắc thái' },
  { key: 'dialect', label: 'Dialect', hint: 'Phương ngữ' },
];

interface ExampleFieldsProps {
  idPrefix: string;
  draft: ExampleDraft;
  onChange: (draft: ExampleDraft) => void;
  sentenceLabel?: string;
}

// One example: the sentence, the phrase to learn (drag-select, then "Tô sáng"),
// the five TMRND labels and a note. Used by both "Add example" and the
// examples under "Add concept".
export function ExampleFields({ idPrefix, draft, onChange, sentenceLabel }: ExampleFieldsProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [valueSets, setValueSets] = useState<AttributeValueSets | null>(null);
  const [hint, setHint] = useState('');

  useEffect(() => {
    void settingsRepository.getById(SETTINGS_ID).then((s) => setValueSets(s?.attributeValueSets ?? null));
  }, []);

  // Last non-empty selection, remembered as it changes: a tap on a button can
  // blur the textarea (and on a phone drop the selection) before the click reads it.
  const lastSelection = useRef<{ start: number; end: number } | null>(null);

  function rememberSelection() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart: start, selectionEnd: end } = textarea;
    if (end > start) lastSelection.current = { start, end };
  }

  // Current selection, or the remembered one when the textarea has lost it.
  function readSelection() {
    const textarea = textareaRef.current;
    if (textarea && textarea.selectionEnd > textarea.selectionStart) {
      return { start: textarea.selectionStart, end: textarea.selectionEnd };
    }
    return lastSelection.current ?? { start: 0, end: 0 };
  }

  function pickHighlight() {
    const picked = normalizeSelection(draft.text, readSelection());
    if (!picked) {
      setHint('Hãy bôi đen (chọn) một cụm trong câu trước.');
      return;
    }
    setHint('');
    onChange({ ...draft, highlight: picked, highlightExtra: [] });
  }

  // A separable verb or phrasal verb: one more part of the same phrase.
  function addHighlightPart() {
    if (!draft.highlight) return;
    const picked = normalizeSelection(draft.text, readSelection());
    const next = picked ? addPart([draft.highlight, ...draft.highlightExtra], picked) : null;
    if (!next) {
      setHint('Hãy bôi đen một đoạn khác (không trùng đoạn đã tô) rồi bấm lại.');
      return;
    }
    setHint('');
    onChange({ ...draft, highlight: next[0], highlightExtra: next.slice(1) });
  }

  return (
    <div className={styles.fields}>
      <div>
        <label className={fieldStyles.label} htmlFor={`${idPrefix}-text`}>
          {sentenceLabel ?? 'Example (*): câu hoặc cách diễn đạt'}
        </label>
        <textarea
          id={`${idPrefix}-text`}
          ref={textareaRef}
          className={fieldStyles.textarea}
          value={draft.text}
          onChange={(e) => {
            setHint('');
            lastSelection.current = null;
            onChange({ ...draft, text: e.target.value, highlight: null, highlightExtra: [] });
          }}
          onSelect={rememberSelection}
          onKeyUp={rememberSelection}
          onPointerUp={rememberSelection}
          placeholder="vd: I have a lot of houses."
        />
      </div>

      {/* Always rendered so the buttons below do not jump when a phrase is highlighted. */}
      <p className={styles.preview}>
        {draft.highlight
          ? splitByParts(draft.text, [draft.highlight, ...draft.highlightExtra]).map((piece, i) => (
              <span key={i} className={piece.hit ? styles.highlight : styles.context}>
                {piece.text}
              </span>
            ))
          : null}
      </p>

      <ButtonRow>
        <Button variant="secondary" keepFocus disabled={!draft.text.trim()} onClick={pickHighlight}>
          {draft.highlight ? 'Tô lại cụm đã chọn' : 'Tô sáng cụm đã chọn'}
        </Button>
        {draft.highlight && (
          <Button variant="secondary" keepFocus onClick={addHighlightPart}>
            Tô thêm đoạn nữa
          </Button>
        )}
        {draft.highlight && (
          <Button variant="ghost" onClick={() => onChange({ ...draft, highlight: null, highlightExtra: [] })}>
            Bỏ tô sáng
          </Button>
        )}
      </ButtonRow>
      {draft.highlight && draft.highlightExtra.length === 0 ? (
        <label className={fieldStyles.hint}>
          <input
            type="checkbox"
            checked={draft.alsoWord}
            onChange={(e) => onChange({ ...draft, alsoWord: e.target.checked })}
          />{' '}
          Cũng thêm cụm đã tô sáng thành Word để học (ở tab Học)
        </label>
      ) : (
        <label className={fieldStyles.hint} style={{ visibility: 'hidden' }} aria-hidden="true">
          <input type="checkbox" disabled tabIndex={-1} /> Cũng thêm cụm đã tô sáng thành Word để học (ở tab Học)
        </label>
      )}
      <p className={fieldStyles.hint}>
        {hint || 'Bôi đen cụm cần học trong câu rồi bấm "Tô sáng". Phần còn lại của câu chỉ là ngữ cảnh. Cụm bị ngắt quãng (động từ tách như fahren … ab): tô đoạn đầu rồi bấm "Tô thêm đoạn nữa" cho đoạn sau. Không tô thì cả câu là cách diễn đạt.'}
      </p>

      {valueSets && (
        <div className={styles.labels}>
          {ATTRIBUTES.map(({ key, label, hint: labelHint }) => (
            <div key={key}>
              <label className={fieldStyles.label} htmlFor={`${idPrefix}-${key}`}>
                {label} <span className={styles.labelHint}>· {labelHint}</span>
              </label>
              <select
                id={`${idPrefix}-${key}`}
                className={fieldStyles.input}
                value={draft.attributes[key]}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    labelsChosen: true,
                    attributes: { ...draft.attributes, [key]: e.target.value } as ExampleAttributes,
                  })
                }
              >
                {(valueSets[key] as string[]).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className={fieldStyles.label} htmlFor={`${idPrefix}-note`}>
          Ghi chú (không bắt buộc)
        </label>
        <input
          id={`${idPrefix}-note`}
          className={fieldStyles.input}
          value={draft.note}
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
          placeholder="vd: slang"
        />
      </div>
    </div>
  );
}
