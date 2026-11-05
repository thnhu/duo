import { useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import fieldStyles from '../../ui/field.module.css';
import { cleanGaps, remapGaps, type PassageGap } from '../../passages';
import { normalizeSelection, textForSelection } from '../quick-add/highlight';
import styles from '../quick-add/AddPassageForm.module.css';

export interface PassageDraft {
  title: string;
  text: string;
  gaps: PassageGap[];
}

interface PassageEditorProps {
  draft: PassageDraft;
  onChange: (draft: PassageDraft) => void;
  // Shown under the gap buttons when there is no hint of its own.
  note?: string;
}

// Title, text and gaps of one passage, shared by "Thêm đoạn văn" and "Sửa
// đoạn văn". Editing the text keeps the gaps: they move with the words around
// them (see remapGaps), so a long passage never has to be typed again.
export function PassageEditor({ draft, onChange, note }: PassageEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hint, setHint] = useState('');
  const { text, gaps } = draft;

  function addGap() {
    const el = textareaRef.current;
    if (!el) return;
    const picked = normalizeSelection(text, { start: el.selectionStart, end: el.selectionEnd });
    if (!picked) {
      setHint('Hãy bôi đen một word hoặc cụm trong đoạn văn trước.');
      return;
    }
    const next = cleanGaps(text, [...gaps, picked]);
    if (next.length === gaps.length) {
      setHint('Chỗ này trùng với một lỗ đã có.');
      return;
    }
    setHint('');
    onChange({ ...draft, gaps: next });
  }

  // The text between gaps, so the preview shows each gap in place.
  const segments: Array<{ text: string; gap?: number }> = [];
  let cursor = 0;
  gaps.forEach((gap, i) => {
    segments.push({ text: text.slice(cursor, gap.start) });
    segments.push({ text: textForSelection(text, gap), gap: i + 1 });
    cursor = gap.end;
  });
  segments.push({ text: text.slice(cursor) });

  return (
    <>
      <div>
        <label className={fieldStyles.label} htmlFor="passage-title">
          Tiêu đề (không bắt buộc)
        </label>
        <input
          id="passage-title"
          className={fieldStyles.input}
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder="vd: Daily activities"
        />
      </div>

      <div>
        <label className={fieldStyles.label} htmlFor="passage-text">
          Đoạn văn (*)
        </label>
        <textarea
          id="passage-text"
          ref={textareaRef}
          className={`${fieldStyles.textarea} ${styles.passageBox}`}
          value={text}
          onChange={(e) => {
            // Gaps follow the edit; one the edit cuts across is dropped.
            const next = remapGaps(text, e.target.value, gaps);
            setHint(
              next.length < gaps.length
                ? `Đã bỏ ${gaps.length - next.length} lỗ vì phần chữ đó bị sửa. Bôi đen và đục lại nếu cần.`
                : '',
            );
            onChange({ ...draft, text: e.target.value, gaps: next });
          }}
          placeholder="vd: He brushes his teeth, shaves, and takes a shower."
        />
      </div>

      <ButtonRow>
        <Button variant="secondary" disabled={!text.trim()} onClick={addGap}>
          Đục lỗ chỗ đã chọn
        </Button>
        {gaps.length > 0 && (
          <Button variant="ghost" onClick={() => onChange({ ...draft, gaps: [] })}>
            Bỏ hết lỗ
          </Button>
        )}
      </ButtonRow>
      <p className={fieldStyles.hint}>
        {hint || note || (gaps.length === 0 ? 'Chưa có lỗ nào.' : `${gaps.length} lỗ. Sửa chữ thì các lỗ đi theo.`)}
      </p>

      {gaps.length > 0 && (
        <>
          <p className={styles.preview}>
            {segments.map((seg, i) =>
              seg.gap ? (
                <span key={i} className={styles.gap}>
                  ({seg.gap}) {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </p>
          <ul className={styles.list}>
            {gaps.map((gap, i) => (
              <li key={`${gap.start}-${gap.end}`} className={styles.item}>
                <span>
                  ({i + 1}) {textForSelection(text, gap)}
                </span>
                <Button variant="ghost" onClick={() => onChange({ ...draft, gaps: gaps.filter((_, index) => index !== i) })}>
                  Bỏ
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
