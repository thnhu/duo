import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import { LangToggle } from '../../ui/LangToggle';
import fieldStyles from '../../ui/field.module.css';
import { SETTINGS_ID } from '../../db/defaults';
import {
  conceptRepository,
  dictionaryRepository,
  settingsRepository,
} from '../../db/repositories';
import type { ImportBatch, StudyMode } from '../../db/types';
import { buildRows, type BuildResult } from '../../import/build';
import {
  commitImport,
  getLatestUndoableBatch,
  undoImport,
  type CommitResult,
} from '../../import/commit';
import { importFields, type ImportFieldId } from '../../import/fields';
import {
  guessMapping,
  listSavedMappings,
  resolveColumns,
  saveMapping,
  type ColumnMapping,
} from '../../import/mapping';
import { planGroups, type DuplicateAction, type ImportGroup } from '../../import/plan';
import { readTable, type ReadOptions, type TableData } from '../../import/readFile';
import { templateCsv, templateXlsx } from '../../import/template';
import type { Delimiter, TextEncodingChoice } from '../../import/csv';
import { useLastLanguage } from '../quick-add/useLastLanguage';
import { listWordSets } from '../../wordsets';
import { ReviewStep } from './ReviewStep';
import styles from './ImportPage.module.css';

type Step = 'file' | 'map' | 'review' | 'done';

const PREVIEW_ROWS = 5;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('file');
  const [source, setSource] = useState<{ bytes: ArrayBuffer; fileName: string } | null>(null);
  const [table, setTable] = useState<TableData | null>(null);
  const [readOptions, setReadOptions] = useState<ReadOptions>({});
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [mappingNote, setMappingNote] = useState('');
  const [defaultLang, setDefaultLang] = useLastLanguage();
  const [mode, setMode] = useState<StudyMode>('breadth');
  const [saveMappingChecked, setSaveMappingChecked] = useState(true);
  const [built, setBuilt] = useState<BuildResult | null>(null);
  const [groups, setGroups] = useState<ImportGroup[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>('merge');
  const [targetSet, setTargetSet] = useState('');
  const [setNames, setSetNames] = useState<string[]>([]);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [latestBatch, setLatestBatch] = useState<ImportBatch | undefined>(undefined);
  const [undone, setUndone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshLatestBatch() {
    setLatestBatch(await getLatestUndoableBatch());
  }

  useEffect(() => {
    void refreshLatestBatch();
    // Existing set names (both languages) as suggestions for the target set.
    void Promise.all([listWordSets('en'), listWordSets('de')]).then(([en, de]) =>
      setSetNames([...new Set([...en, ...de].map((s) => s.name))].sort()),
    );
  }, []);

  async function loadTable(bytes: ArrayBuffer, fileName: string, options: ReadOptions) {
    setBusy(true);
    setError(null);
    try {
      const next = await readTable(bytes, fileName, options);
      if (next.rows.length < 2) {
        setError('File không có dòng dữ liệu nào (chỉ có tiêu đề hoặc trống).');
        return;
      }
      const guess = guessMapping(next.rows[0], await listSavedMappings());
      setTable(next);
      setMapping(guess.mapping);
      setMappingNote(
        guess.source === 'saved'
          ? `Dùng cấu hình đã lưu "${guess.savedName}".`
          : 'Đã đoán cột theo tên tiêu đề — kiểm tra lại bên dưới.',
      );
      setStep('map');
    } catch {
      setError('Không đọc được file này. Chỉ hỗ trợ CSV hoặc XLSX hợp lệ.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    const bytes = await file.arrayBuffer();
    setSource({ bytes, fileName: file.name });
    setReadOptions({});
    await loadTable(bytes, file.name, {});
  }

  function changeRead(patch: ReadOptions) {
    if (!source) return;
    const next = { ...readOptions, ...patch };
    setReadOptions(next);
    void loadTable(source.bytes, source.fileName, next);
  }

  const headers = table?.rows[0] ?? [];
  const textMapped = Object.values(mapping).includes('text');

  async function handleToReview() {
    if (!table || !source) return;
    setBusy(true);
    setError(null);
    try {
      const [settings, dictionaries, existing] = await Promise.all([
        settingsRepository.getById(SETTINGS_ID),
        dictionaryRepository.listActive(),
        conceptRepository.listActive(),
      ]);
      if (!settings) throw new Error('settings');
      const result = buildRows(table.rows, resolveColumns(headers, mapping), {
        attributeValueSets: settings.attributeValueSets,
        languages: [...new Set(dictionaries.map((d) => d.lang))],
        defaultLang,
      });
      setBuilt(result);
      setGroups(planGroups(result.rows, existing));
      if (saveMappingChecked) {
        await saveMapping(`Ánh xạ: ${headers.join(' | ')}`.slice(0, 120), mapping, {
          delimiter: table.delimiter,
          sheet: table.sheet,
        });
      }
      setStep('review');
    } catch {
      setError('Không kiểm tra được dữ liệu. Thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const committed = await commitImport(groups, {
        fileName: source.fileName,
        mode,
        duplicateAction,
        targetSetName: targetSet,
      });
      setResult(committed);
      setUndone(false);
      await refreshLatestBatch();
      setStep('done');
    } catch {
      // The write is one transaction: on failure nothing was saved.
      setError('Không lưu được. Dữ liệu trong thư viện vẫn giữ nguyên — thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo(batchId: string) {
    setBusy(true);
    const ok = await undoImport(batchId);
    setBusy(false);
    if (ok) setUndone(true);
    await refreshLatestBatch();
  }

  function reset() {
    setStep('file');
    setSource(null);
    setTable(null);
    setBuilt(null);
    setGroups([]);
    setResult(null);
    setError(null);
  }

  return (
    <section className={styles.page}>
      <h1>Nhập từ file</h1>

      {error && <p className={styles.error}>{error}</p>}

      {step === 'file' && (
        <>
          <Card className={styles.card}>
            <p>
              Chọn file <strong>CSV</strong> hoặc <strong>XLSX</strong> (từ công cụ ngoài của bạn).
              File được đọc ngay trên máy, không tải lên đâu cả và không được lưu lại.
            </p>
            <label className={styles.fileButton}>
              Chọn file
              <input
                type="file"
                accept=".csv,.tsv,.txt,.xlsx"
                className={styles.fileInput}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            {busy && <p className={fieldStyles.hint}>Đang đọc file…</p>}
          </Card>

          <Card tinted className={styles.card}>
            <p className={styles.sectionTitle}>Chưa có file? Tải file mẫu</p>
            <ButtonRow>
              <Button
                variant="secondary"
                onClick={() =>
                  download(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }), 'duo-template.csv')
                }
              >
                Mẫu CSV
              </Button>
              <Button
                variant="secondary"
                onClick={() => void templateXlsx().then((b) => download(b, 'duo-template.xlsx'))}
              >
                Mẫu XLSX
              </Button>
            </ButtonRow>
            <p className={fieldStyles.hint}>
              Chỉ cột <code>text</code> là bắt buộc. Tên cột trong file của bạn có thể khác — bạn sẽ
              ánh xạ ở bước sau.
            </p>
          </Card>

          {latestBatch && (
            <Card className={styles.card}>
              <p>
                Lần nhập gần nhất: <strong>{latestBatch.fileName}</strong> (
                {latestBatch.createdConceptIds.length} từ mới).
              </p>
              <Button variant="destructive" disabled={busy} onClick={() => void handleUndo(latestBatch.id)}>
                Hoàn tác lần nhập này
              </Button>
            </Card>
          )}
        </>
      )}

      {step === 'map' && table && source && (
        <>
          <Card className={styles.card}>
            <p>
              <strong>{source.fileName}</strong> — {table.rows.length - 1} dòng dữ liệu
            </p>

            {table.kind === 'csv' && (
              <div className={styles.row}>
                <div className={styles.grow}>
                  <label className={fieldStyles.label}>Dấu phân cách</label>
                  <select
                    className={fieldStyles.input}
                    value={table.delimiter}
                    onChange={(e) => changeRead({ delimiter: e.target.value as Delimiter })}
                  >
                    <option value=",">Phẩy (,)</option>
                    <option value=";">Chấm phẩy (;)</option>
                    <option value={'\t'}>Tab</option>
                  </select>
                </div>
                <div className={styles.grow}>
                  <label className={fieldStyles.label}>Mã hóa</label>
                  <select
                    className={fieldStyles.input}
                    value={readOptions.encoding ?? 'auto'}
                    onChange={(e) => changeRead({ encoding: e.target.value as TextEncodingChoice })}
                  >
                    <option value="auto">Tự nhận (UTF-8)</option>
                    <option value="utf-8">UTF-8</option>
                    <option value="windows-1252">Windows-1252</option>
                  </select>
                </div>
              </div>
            )}

            {table.kind === 'xlsx' && table.sheets && table.sheets.length > 1 && (
              <div>
                <label className={fieldStyles.label}>Sheet</label>
                <select
                  className={fieldStyles.input}
                  value={table.sheet}
                  onChange={(e) => changeRead({ sheet: e.target.value })}
                >
                  {table.sheets.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {table.encodingFellBack && (
              <p className={styles.warning}>
                File không phải UTF-8 nên đã đọc bằng Windows-1252. Xem bảng bên dưới: nếu ä, ö, ü, ß
                đúng thì giữ nguyên, nếu sai hãy đổi mã hóa.
              </p>
            )}
            {table.suspectedMojibake && (
              <p className={styles.warning}>
                Có vẻ chữ bị lỗi mã hóa (ví dụ "Ã¤" thay cho "ä"). Thử đổi mã hóa ở trên.
              </p>
            )}
          </Card>

          <Card className={styles.card}>
            <p className={styles.sectionTitle}>Xem trước</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i}>{h || <em>(trống)</em>}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.slice(1, 1 + PREVIEW_ROWS).map((row, r) => (
                    <tr key={r}>
                      {headers.map((_, c) => (
                        <td key={c}>{row[c]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className={styles.card}>
            <p className={styles.sectionTitle}>Ánh xạ cột</p>
            <p className={fieldStyles.hint}>{mappingNote}</p>
            {headers.map((header, index) => (
              <div key={index}>
                <label className={fieldStyles.label}>Cột "{header || `#${index + 1}`}"</label>
                <select
                  className={fieldStyles.input}
                  value={mapping[header] ?? ''}
                  onChange={(e) =>
                    setMapping({ ...mapping, [header]: e.target.value as ImportFieldId | '' })
                  }
                >
                  <option value="">Không dùng</option>
                  {importFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                      {f.required ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {!textMapped && <p className={styles.error}>Cần ánh xạ một cột cho "text".</p>}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={saveMappingChecked}
                onChange={(e) => setSaveMappingChecked(e.target.checked)}
              />
              Lưu ánh xạ này cho lần sau
            </label>
          </Card>

          <Card className={styles.card}>
            <p className={styles.sectionTitle}>Nạp vào đâu?</p>
            <div>
              <label className={fieldStyles.label}>Ngôn ngữ (cho dòng không có cột lang)</label>
              <LangToggle value={defaultLang} onChange={setDefaultLang} />
            </div>
            <div>
              <label className={fieldStyles.label} htmlFor="import-set">
                Thêm tất cả vào bộ từ (tùy chọn)
              </label>
              <input
                id="import-set"
                className={fieldStyles.input}
                list="import-set-names"
                value={targetSet}
                onChange={(e) => setTargetSet(e.target.value)}
                placeholder="vd: IT, Từ phim — tạo mới nếu chưa có"
              />
              <datalist id="import-set-names">
                {setNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <p className={fieldStyles.hint}>
                Từ đã có trong thư viện cũng được thêm vào bộ này mà không bị nhân đôi. Cột <code>set</code> trong
                file (nếu có) được dùng thêm.
              </p>
            </div>
            <div>
              <label className={fieldStyles.label}>Chế độ</label>
              <select
                className={fieldStyles.input}
                value={mode}
                onChange={(e) => setMode(e.target.value as StudyMode)}
              >
                <option value="breadth">Rộng</option>
                <option value="depth">Sâu (chỉ tiếng Anh)</option>
              </select>
            </div>
          </Card>

          <ButtonRow>
            <Button variant="ghost" onClick={reset}>
              Đổi file
            </Button>
            <Button disabled={!textMapped || busy} onClick={() => void handleToReview()}>
              {busy ? 'Đang kiểm tra…' : 'Tiếp: kiểm tra'}
            </Button>
          </ButtonRow>
        </>
      )}

      {step === 'review' && built && (
        <ReviewStep
          built={built}
          groups={groups}
          onGroups={setGroups}
          duplicateAction={duplicateAction}
          onDuplicateAction={setDuplicateAction}
          busy={busy}
          onBack={() => setStep('map')}
          onCommit={() => void handleCommit()}
        />
      )}

      {step === 'done' && result && (
        <>
          <Card tinted className={styles.card}>
            {undone ? (
              <p>Đã hoàn tác lần nhập này.</p>
            ) : (
              <>
                <p className={styles.sectionTitle}>Đã nhập xong</p>
                <ul className={styles.summary}>
                  <li>{result.createdConcepts} từ mới</li>
                  {result.addedToSets > 0 && <li>{result.addedToSets} từ đã có được thêm vào bộ từ</li>}
                  {result.mergedConcepts > 0 && <li>{result.mergedConcepts} từ đã có được gộp thêm</li>}
                  {result.updatedConcepts > 0 && <li>{result.updatedConcepts} từ đã có được cập nhật</li>}
                  <li>{result.skippedDuplicates} từ trùng/không đổi (bỏ qua)</li>
                  <li>{result.examplesAdded} ví dụ được thêm</li>
                  {result.inboxExamples > 0 && (
                    <li>
                      {result.inboxExamples} câu chờ tô sáng trong <Link to="/inbox">Hộp chờ duyệt</Link>
                    </li>
                  )}
                </ul>
              </>
            )}
          </Card>
          <ButtonRow>
            {!undone && result.batchId && (
              <Button variant="destructive" disabled={busy} onClick={() => void handleUndo(result.batchId!)}>
                Hoàn tác lần nhập này
              </Button>
            )}
            <Button variant="secondary" onClick={reset}>
              Nhập file khác
            </Button>
            <Button onClick={() => navigate('/library')}>Xem thư viện</Button>
          </ButtonRow>
        </>
      )}
    </section>
  );
}
