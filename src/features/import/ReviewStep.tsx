import { useMemo, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import type { BuildResult, ExampleDraft } from '../../import/build';
import type { DuplicateAction, ImportGroup } from '../../import/plan';
import { normalizeSelection } from '../quick-add/highlight';
import styles from './ImportPage.module.css';

const PAGE_SIZE = 100;

interface ReviewStepProps {
  built: BuildResult;
  groups: ImportGroup[];
  onGroups: (groups: ImportGroup[]) => void;
  duplicateAction: DuplicateAction;
  onDuplicateAction: (action: DuplicateAction) => void;
  busy: boolean;
  onBack: () => void;
  onCommit: () => void;
}

export function ReviewStep({
  built,
  groups,
  onGroups,
  duplicateAction,
  onDuplicateAction,
  busy,
  onBack,
  onCommit,
}: ReviewStepProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showAcquired, setShowAcquired] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const lessons = useMemo(
    () => [...new Set(groups.map((g) => g.lesson).filter((l): l is string => !!l))].sort(),
    [groups],
  );
  const hasDuplicates = groups.some((g) => g.existing && !g.hiddenAsAcquired);
  const acquiredCount = groups.filter((g) => g.hiddenAsAcquired).length;
  const visible = groups.filter((g) => showAcquired || !g.hiddenAsAcquired);
  const includedCount = groups.filter((g) => g.included).length;

  function update(key: string, patch: Partial<ImportGroup>) {
    onGroups(groups.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  }

  function setExample(key: string, index: number, patch: Partial<ExampleDraft>) {
    onGroups(
      groups.map((g) =>
        g.key === key
          ? { ...g, examples: g.examples.map((e, i) => (i === index ? { ...e, ...patch } : e)) }
          : g,
      ),
    );
  }

  // A1d: import just one lesson — tick only the words of that lesson.
  function onlyLesson(lesson: string | null) {
    onGroups(
      groups.map((g) =>
        g.hiddenAsAcquired ? g : { ...g, included: lesson === null || g.lesson === lesson },
      ),
    );
  }

  return (
    <>
      <Card tinted className={styles.card}>
        <p className={styles.sectionTitle}>Kết quả kiểm tra</p>
        <ul className={styles.summary}>
          <li>
            {groups.length} từ (từ {built.rows.length} dòng hợp lệ)
          </li>
          {built.errors.length > 0 && <li className={styles.errorText}>{built.errors.length} dòng lỗi — sẽ bị bỏ qua</li>}
          {built.warnings.length > 0 && <li>{built.warnings.length} cảnh báo</li>}
          {built.blankRows > 0 && <li>{built.blankRows} dòng trống bị bỏ qua</li>}
          {acquiredCount > 0 && <li>{acquiredCount} từ đã thụ đắc được ẩn</li>}
        </ul>
        {(built.errors.length > 0 || built.warnings.length > 0) && (
          <Button variant="ghost" onClick={() => setShowErrors((v) => !v)}>
            {showErrors ? 'Ẩn chi tiết' : 'Xem lỗi theo dòng'}
          </Button>
        )}
        {showErrors && (
          <ul className={styles.issues}>
            {built.errors.map((e, i) => (
              <li key={`e${i}`} className={styles.errorText}>
                Dòng {e.rowNumber}
                {e.text ? ` (${e.text})` : ''}: {e.message}
              </li>
            ))}
            {built.warnings.map((e, i) => (
              <li key={`w${i}`}>
                Dòng {e.rowNumber}
                {e.text ? ` (${e.text})` : ''}: {e.message}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(lessons.length > 0 || hasDuplicates) && (
        <Card className={styles.card}>
          {lessons.length > 0 && (
            <div>
              <label className={fieldStyles.label}>Chỉ nạp một bài</label>
              <select
                className={fieldStyles.input}
                defaultValue=""
                onChange={(e) => onlyLesson(e.target.value === '' ? null : e.target.value)}
              >
                <option value="">Tất cả các bài</option>
                {lessons.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}
          {hasDuplicates && (
            <div>
              <label className={fieldStyles.label}>Từ đã có trong thư viện</label>
              <select
                className={fieldStyles.input}
                value={duplicateAction}
                onChange={(e) => onDuplicateAction(e.target.value as DuplicateAction)}
              >
                <option value="merge">Gộp thêm ví dụ/nghĩa mới</option>
                <option value="skip">Bỏ qua</option>
                <option value="update">Cập nhật bằng dữ liệu trong file</option>
              </select>
            </div>
          )}
        </Card>
      )}

      {acquiredCount > 0 && (
        <label className={styles.check}>
          <input type="checkbox" checked={showAcquired} onChange={(e) => setShowAcquired(e.target.checked)} />
          Hiện cả {acquiredCount} từ đã thụ đắc
        </label>
      )}

      <div className={styles.list}>
        {visible.slice(0, limit).map((group) => (
          <Card key={group.key} className={styles.group}>
            <label className={styles.groupHead}>
              <input
                type="checkbox"
                checked={group.included}
                onChange={(e) => update(group.key, { included: e.target.checked })}
              />
              <span className={styles.groupText}>{group.text}</span>
              <span className={styles.badges}>
                {group.existing && <span className={styles.badge}>Đã có</span>}
                {group.hiddenAsAcquired && <span className={styles.badge}>Đã thụ đắc</span>}
                {group.lesson && <span className={styles.badge}>{group.lesson}</span>}
              </span>
            </label>
            {group.meanings.length > 0 && (
              <div className={styles.groupMeaning}>{group.meanings.join('; ')}</div>
            )}
            {group.examples.map((example, index) =>
              example.needsHighlight && !example.highlight ? (
                <ManualHighlight
                  key={index}
                  example={example}
                  onPick={(highlight) => setExample(group.key, index, { highlight, needsHighlight: false })}
                />
              ) : null,
            )}
          </Card>
        ))}
      </div>
      {visible.length > limit && (
        <Button variant="secondary" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Hiện thêm ({visible.length - limit})
        </Button>
      )}

      <div className={styles.row}>
        <Button variant="ghost" onClick={onBack}>
          Quay lại
        </Button>
        <Button disabled={busy || includedCount === 0} onClick={onCommit}>
          {busy ? 'Đang lưu…' : `Nạp ${includedCount} từ`}
        </Button>
      </div>
    </>
  );
}

// Spec 6.4: when the word isn't found in the sentence (e.g. "swallowed"
// for "swallow") PO highlights it by hand here. Left alone, the sentence
// goes to the Hộp chờ duyệt.
function ManualHighlight({
  example,
  onPick,
}: {
  example: ExampleDraft;
  onPick: (highlight: { start: number; end: number }) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className={styles.manual}>
      <textarea ref={ref} className={fieldStyles.textarea} defaultValue={example.text} readOnly rows={2} />
      <p className={fieldStyles.hint}>
        Không thấy từ trong câu. Bôi đen cụm cần học rồi bấm nút, hoặc bỏ qua để câu vào Hộp chờ duyệt.
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          const sel = normalizeSelection(example.text, {
            start: el.selectionStart,
            end: el.selectionEnd,
          });
          if (sel) onPick(sel);
        }}
      >
        Tô sáng cụm đã chọn
      </Button>
    </div>
  );
}
