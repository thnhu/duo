import { useEffect, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import fieldStyles from '../../ui/field.module.css';
import { autoGaps } from '../../choicesets';
import { cleanGaps, remapGaps, segmentText, toggleGap, type PassageGap } from '../../passages';
import { isGapCell, tableCells } from '../../passages/table';
import type { PassageLayout } from '../../db/types';
import { normalizeSelection } from '../quick-add/highlight';
import styles from '../quick-add/AddPassageForm.module.css';

export interface PassageDraft {
  title: string;
  // Optional description shown on top when studying (M18a).
  prompt: string;
  text: string;
  gaps: PassageGap[];
}

interface PassageEditorProps {
  draft: PassageDraft;
  onChange: (draft: PassageDraft) => void;
  // Shown under the passage when there is no hint of its own.
  note?: string;
  // Tiles of the grammar set: with them, one button makes a gap of every word
  // that is a tile (Bản 10).
  autoItems?: string[];
  // A table passage (M18c): gap mode draws the grid and a tap makes a whole
  // cell a gap; header cells and blank cells cannot be gaps.
  layout?: PassageLayout;
  tableHeaders?: { row: boolean; col: boolean };
}

// Offset in the passage of a point of the browser selection: every segment of
// the gap view is one element with `data-start` holding one text node.
function offsetOf(node: Node | null, offset: number): number | null {
  const el = (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('[data-start]');
  if (!el || el.dataset.start === undefined) return null;
  return Number(el.dataset.start) + (node instanceof Element ? 0 : offset);
}

// Title and passage of one passage, shared by "Thêm đoạn văn" and "Sửa đoạn
// văn". Two modes on the same passage: "Đục lỗ" shows it as text where a tap on
// a word makes (or removes) a gap and a selection makes a phrase gap; "Sửa
// chữ" turns it into a box to type in. Editing the text keeps the gaps: they
// move with the words around them (remapGaps), so nothing is ever retyped.
export function PassageEditor({ draft, onChange, note, autoItems, layout, tableHeaders }: PassageEditorProps) {
  const { text, gaps } = draft;
  const [mode, setMode] = useState<'gap' | 'text'>(text.trim() ? 'gap' : 'text');
  const [hint, setHint] = useState('');
  const [picked, setPicked] = useState<{ start: number; end: number } | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  // A phrase selected on the passage (drag on a computer, long-press on a
  // phone) waits behind a button; a plain tap makes a one-word gap.
  useEffect(() => {
    if (mode !== 'gap') return;
    function onSelection() {
      const sel = window.getSelection();
      const view = viewRef.current;
      if (!sel || !view || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) {
        setPicked(null);
        return;
      }
      if (!view.contains(sel.anchorNode) || !view.contains(sel.focusNode)) return;
      const a = offsetOf(sel.anchorNode, sel.anchorOffset);
      const b = offsetOf(sel.focusNode, sel.focusOffset);
      if (a === null || b === null) return;
      const norm = normalizeSelection(text, { start: Math.min(a, b), end: Math.max(a, b) });
      setPicked(norm);
    }
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [mode, text]);

  function tap(start: number, end: number) {
    if (!window.getSelection()?.isCollapsed) return; // a selection is in progress
    setHint('');
    onChange({ ...draft, gaps: toggleGap(text, gaps, start, end) as PassageGap[] });
  }

  function addPicked() {
    if (!picked) return;
    const touched = gaps.some((g) => g.start < picked.end && picked.start < g.end);
    window.getSelection()?.removeAllRanges();
    setPicked(null);
    if (touched) {
      setHint('Cụm này chạm vào một lỗ đã có. Chạm lỗ đó để bỏ trước.');
      return;
    }
    setHint('');
    onChange({ ...draft, gaps: cleanGaps(text, [...gaps, picked]) });
  }

  const segments = segmentText(text, gaps);
  const cells = layout === 'table' ? tableCells(text) : null;

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
        <label className={fieldStyles.label} htmlFor="passage-prompt">
          Mô tả (không bắt buộc)
        </label>
        <input
          id="passage-prompt"
          className={fieldStyles.input}
          value={draft.prompt}
          onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
          placeholder="vd: Điền mạo từ xác định theo giống và số"
        />
        <p className={fieldStyles.hint}>Hiện trên đầu bài khi ôn để biết đang kiểm tra gì. Không phải là lỗ hay đáp án.</p>
      </div>

      <div className={styles.modes} role="group" aria-label="Chế độ đoạn văn">
        <button
          type="button"
          className={[styles.modeBtn, mode === 'gap' && styles.modeOn].filter(Boolean).join(' ')}
          aria-pressed={mode === 'gap'}
          disabled={!text.trim()}
          onClick={() => setMode('gap')}
        >
          Đục lỗ
        </button>
        <button
          type="button"
          className={[styles.modeBtn, mode === 'text' && styles.modeOn].filter(Boolean).join(' ')}
          aria-pressed={mode === 'text'}
          onClick={() => {
            setPicked(null);
            setMode('text');
          }}
        >
          Sửa chữ
        </button>
      </div>

      {mode === 'text' ? (
        <div>
          <label className={fieldStyles.label} htmlFor="passage-text">
            Đoạn văn (*)
          </label>
          <textarea
            id="passage-text"
            className={`${fieldStyles.textarea} ${styles.passageBox}`}
            value={text}
            onChange={(e) => {
              // Gaps follow the edit; one the edit cuts across is dropped.
              const next = remapGaps(text, e.target.value, gaps);
              setHint(
                next.length < gaps.length
                  ? `Đã bỏ ${gaps.length - next.length} lỗ vì phần chữ đó bị sửa. Chuyển sang "Đục lỗ" để đục lại.`
                  : '',
              );
              onChange({ ...draft, text: e.target.value, gaps: next });
            }}
            placeholder="vd: He brushes his teeth, shaves, and takes a shower."
          />
          <p className={fieldStyles.hint}>
            {hint || 'Dán hoặc gõ đoạn văn. Sửa chữ thì các lỗ đã đục đi theo. Xong thì bấm "Đục lỗ".'}
          </p>
        </div>
      ) : (
        <div>
          {cells ? (
            <div className={styles.tableScroll}>
              <table className={styles.tableGrid} aria-label="Bảng: chạm một ô để đục lỗ">
                <tbody>
                  {cells.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell) => {
                        const gapNo = gaps.findIndex((g) => g.start === cell.start && g.end === cell.end) + 1;
                        const canGap = isGapCell(cell, tableHeaders);
                        if (gapNo > 0) {
                          return (
                            <td key={cell.col} className={styles.tableGapOn}>
                              <button
                                type="button"
                                className={styles.tableCellBtn}
                                aria-label={`Lỗ ${gapNo}: ${cell.text}. Chạm để bỏ`}
                                onClick={() => tap(cell.start, cell.end)}
                              >
                                <sup className={styles.gapNo}>{gapNo}</sup>
                                {cell.text}
                              </button>
                            </td>
                          );
                        }
                        return (
                          <td key={cell.col} className={canGap ? undefined : styles.tableCellMuted}>
                            {canGap ? (
                              <button
                                type="button"
                                className={styles.tableCellBtn}
                                onClick={() => tap(cell.start, cell.end)}
                              >
                                {cell.text}
                              </button>
                            ) : (
                              <span className={styles.tableCellText}>{cell.text}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
          <div ref={viewRef} className={styles.view} aria-label="Đoạn văn: chạm một word để đục lỗ">
            {segments.map((seg) => {
              const piece = text.slice(seg.start, seg.end);
              if (seg.kind === 'plain') {
                return (
                  <span key={seg.start} data-start={seg.start}>
                    {piece}
                  </span>
                );
              }
              if (seg.kind === 'gap') {
                return (
                  <span
                    key={seg.start}
                    data-start={seg.start}
                    className={styles.gapTap}
                    role="button"
                    tabIndex={0}
                    aria-label={`Lỗ ${seg.gap}: ${piece}. Chạm để bỏ`}
                    onClick={() => tap(seg.start, seg.end)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        tap(seg.start, seg.end);
                      }
                    }}
                  >
                    <sup className={styles.gapNo}>{seg.gap}</sup>
                    {piece}
                  </span>
                );
              }
              return (
                <span
                  key={seg.start}
                  data-start={seg.start}
                  className={styles.word}
                  role="button"
                  tabIndex={0}
                  onClick={() => tap(seg.start, seg.end)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      tap(seg.start, seg.end);
                    }
                  }}
                >
                  {piece}
                </span>
              );
            })}
          </div>
          )}

          <ButtonRow>
            {picked && (
              <Button variant="secondary" onClick={addPicked}>
                Đục lỗ cụm đã chọn
              </Button>
            )}
            {autoItems && autoItems.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  // Merge with the gaps already there; overlaps are dropped.
                  let found = autoGaps(text, autoItems);
                  if (cells) {
                    // Only whole cells of the table can be gaps.
                    const ok = cells.flat().filter((c) => isGapCell(c, tableHeaders));
                    found = found.filter((g) => ok.some((c) => c.start === g.start && c.end === g.end));
                  }
                  setHint(found.length === 0 ? 'Không có chữ nào trong đoạn khớp với các thẻ.' : '');
                  onChange({ ...draft, gaps: cleanGaps(text, [...gaps, ...found]) });
                }}
              >
                Đục tự động theo bộ thẻ
              </Button>
            )}
            {gaps.length > 0 && (
              <Button variant="ghost" onClick={() => onChange({ ...draft, gaps: [] })}>
                Bỏ hết lỗ
              </Button>
            )}
          </ButtonRow>
          <p className={fieldStyles.hint}>
            {hint ||
              note ||
              (gaps.length === 0
                ? cells
                  ? 'Chạm một ô để đục lỗ. Ô tiêu đề và ô trống không đục được.'
                  : 'Chạm một word để đục lỗ. Muốn đục cả cụm, bôi đen cụm rồi bấm "Đục lỗ cụm đã chọn".'
                : `${gaps.length} lỗ. Chạm một lỗ để bỏ, chạm word khác để đục thêm.`)}
          </p>
        </div>
      )}
      {mode === 'text' && note && <p className={fieldStyles.hint}>{note}</p>}
    </>
  );
}
