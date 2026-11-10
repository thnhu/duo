import { useState } from 'react';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import fieldStyles from '../../ui/field.module.css';
import { guessValueCols, parseTable, tableToText } from '../../passages/table';
import styles from './TableInput.module.css';

export interface TableResult {
  text: string;
  headers: { row: boolean; col: boolean };
}

interface TableInputProps {
  // Called with the table as the text a table passage stores.
  onUse: (result: TableResult) => void;
  onCancel?: () => void;
}

// "Bảng" input (Bản 11, M18b): paste the table copied from a PDF (or from
// Sheets), say how many value columns it has, check the grid, fix a cell. For
// text with spaces between cells the PO sets N with +/-: each line's last N
// words are its cells, what comes first is the row label.
export function TableInput({ onUse, onCancel }: TableInputProps) {
  const [raw, setRaw] = useState('');
  const [n, setN] = useState(1);
  const [nTouched, setNTouched] = useState(false);
  const [rows, setRows] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(true);
  const [headerCol, setHeaderCol] = useState(true);

  const parsed = parseTable(raw, n);
  const delimited = parsed.mode === 'delimited';

  function rebuild(nextRaw: string, nextN: number) {
    setRows(parseTable(nextRaw, nextN).rows);
  }

  function changeRaw(next: string) {
    setRaw(next);
    const useN = nTouched ? n : guessValueCols(next);
    if (!nTouched) setN(useN);
    rebuild(next, useN);
  }

  function changeN(next: number) {
    const value = Math.min(12, Math.max(1, next));
    setN(value);
    setNTouched(true);
    rebuild(raw, value);
  }

  function setCell(r: number, c: number, value: string) {
    setRows(rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)));
  }

  const width = Math.max(0, ...rows.map((r) => r.length));
  const usable = rows.length > 0 && width > 0;

  return (
    <div className={styles.box}>
      <div>
        <label className={fieldStyles.label} htmlFor="table-raw">
          Dán bảng (*)
        </label>
        <textarea
          id="table-raw"
          className={`${fieldStyles.textarea} ${styles.raw}`}
          value={raw}
          onChange={(e) => changeRaw(e.target.value)}
          placeholder={'maskulin neutral feminin plural\nbestimmter Artikel der das die die'}
        />
        <p className={fieldStyles.hint}>
          Copy bảng từ PDF rồi dán vào đây, mỗi hàng một dòng. Dán từ Google Sheets/Excel hoặc gõ{' '}
          <code>a | b | c</code> thì các ô được tách sẵn.
        </p>
      </div>

      {raw.trim() && !delimited && (
        <div className={styles.stepper} role="group" aria-label="Số cột giá trị">
          <span className={styles.stepLabel}>Số cột giá trị</span>
          <button type="button" className={styles.stepBtn} aria-label="Bớt một cột" onClick={() => changeN(n - 1)}>
            −
          </button>
          <strong className={styles.stepValue}>{n}</strong>
          <button type="button" className={styles.stepBtn} aria-label="Thêm một cột" onClick={() => changeN(n + 1)}>
            +
          </button>
        </div>
      )}
      {raw.trim() && !delimited && (
        <p className={fieldStyles.hint}>
          Mỗi dòng lấy {n} từ cuối làm các ô, phần đứng trước là tên hàng. Hàng sai thì đổi số cột, bảng dựng lại.
          {parsed.groupLines.length > 0 && ` Dòng bị bỏ vì ngắn hơn ${n} từ: ${parsed.groupLines.join(' / ')}.`}
        </p>
      )}

      {usable && (
        <>
          <div className={styles.toggles}>
            <label className={styles.check}>
              <input type="checkbox" checked={headerRow} onChange={(e) => setHeaderRow(e.target.checked)} />
              Hàng đầu là tiêu đề
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={headerCol} onChange={(e) => setHeaderCol(e.target.checked)} />
              Cột đầu là tiêu đề
            </label>
          </div>

          <div className={styles.scroll}>
            <table className={styles.grid} aria-label="Xem trước bảng">
              <tbody>
                {rows.map((row, r) => (
                  <tr key={r}>
                    {Array.from({ length: width }, (_, c) => {
                      const header = (headerRow && r === 0) || (headerCol && c === 0);
                      return (
                        <td key={c} className={header ? styles.headerCell : undefined}>
                          <input
                            className={styles.cell}
                            value={row[c] ?? ''}
                            aria-label={`Hàng ${r + 1}, cột ${c + 1}`}
                            onChange={(e) => setCell(r, c, e.target.value)}
                          />
                        </td>
                      );
                    })}
                    <td className={styles.drop}>
                      <button
                        type="button"
                        className={styles.dropBtn}
                        aria-label={`Bỏ hàng ${r + 1}`}
                        onClick={() => setRows(rows.filter((_, i) => i !== r))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={fieldStyles.hint}>
            Chạm một ô để sửa chữ (ví dụ ký tự bị lỗi khi copy từ PDF). Ô <code>-----</code> hoặc để trống sẽ không bị
            đục lỗ. Đổi số cột hoặc dán lại thì bảng dựng lại và các sửa tay mất.
          </p>
        </>
      )}

      <ButtonRow>
        <Button
          disabled={!usable}
          onClick={() => onUse({ text: tableToText(rows), headers: { row: headerRow, col: headerCol } })}
        >
          Dùng bảng này
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Hủy
          </Button>
        )}
      </ButtonRow>
    </div>
  );
}
