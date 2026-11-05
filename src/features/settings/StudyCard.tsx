import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { loadCriteria, recomputeAcquisition, saveCriteria } from '../../acquisition/update';
import { exerciseModules } from '../../exercises';
import {
  LIMITS,
  SECONDS_RANGE,
  defaultForm,
  parseForm,
  toForm,
  type CriteriaForm,
} from '../../settings/criteria';
import { SESSION_COUNT_RANGE, defaultStudySettings, loadStudy, saveStudy } from '../../settings/study';
import { useToast } from '../../ui/Toast';
import styles from './SettingsPage.module.css';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

const THRESHOLD_KEYS = ['minCorrect', 'minDistinctContexts', 'minDistinctDays'] as const;

// Settings → Học: session size and the acquisition thresholds (spec section
// 2, "cấu hình chỉnh được"; journey J9 step 5).
export function StudyCard() {
  const [form, setForm] = useState<CriteriaForm | null>(null);
  const [count, setCount] = useState(String(defaultStudySettings.sessionCount));
  const toast = useToast();
  const [notice, setNotice] = useState<Notice>(null);
  const modules = exerciseModules.list();

  useEffect(() => {
    let current = true;
    void Promise.all([loadCriteria(), loadStudy()]).then(([criteria, study]) => {
      if (!current) return;
      setForm(toForm(criteria));
      setCount(String(study.sessionCount));
    });
    return () => {
      current = false;
    };
  }, []);

  if (!form) return null;

  const update = (patch: Partial<CriteriaForm>) => setForm({ ...form, ...patch });

  async function handleSave() {
    if (!form) return;
    const labels = Object.fromEntries(modules.map((m) => [m.id, m.label]));
    const parsed = parseForm(form, labels);
    const errors = parsed.ok ? [] : [...parsed.errors];
    const sessionCount = Number(count.trim());
    if (
      !Number.isInteger(sessionCount) ||
      sessionCount < SESSION_COUNT_RANGE.min ||
      sessionCount > SESSION_COUNT_RANGE.max
    ) {
      errors.push(
        `Số câu mỗi phiên: nhập số nguyên từ ${SESSION_COUNT_RANGE.min} đến ${SESSION_COUNT_RANGE.max}.`,
      );
    }
    if (!parsed.ok || errors.length > 0) {
      setNotice({ kind: 'error', text: errors.join(' ') });
      return;
    }
    await saveCriteria(parsed.criteria);
    await saveStudy({ sessionCount });
    // Every word is judged again against the new thresholds.
    const result = await recomputeAcquisition(parsed.criteria);
    const changes: string[] = [];
    if (result.promoted > 0) changes.push(`${result.promoted} concept trở thành đã thụ đắc`);
    if (result.demoted > 0) changes.push(`${result.demoted} concept quay lại đang học`);
    setNotice(null);
    toast.show(`Đã lưu.${changes.length > 0 ? ` ${changes.join(', ')}.` : ' Không có concept nào đổi trạng thái.'}`);
  }

  function handleReset() {
    setForm(defaultForm());
    setCount(String(defaultStudySettings.sessionCount));
    setNotice(null);
  }

  return (
    <Card className={styles.card}>
      <h2>Học</h2>
      <div>
        <label className={fieldStyles.label} htmlFor="study-count">
          Số câu mỗi phiên ({SESSION_COUNT_RANGE.min}–{SESSION_COUNT_RANGE.max})
        </label>
        <input
          id="study-count"
          inputMode="numeric"
          className={fieldStyles.input}
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>

      <h3>Khi nào một concept được coi là đã thụ đắc</h3>
      <p className={styles.note}>
        Một câu trả lời chỉ tính khi đúng và nhanh hơn thời gian tối đa. Concept đạt cả ba điều kiện bên dưới
        thì thành "đã thụ đắc". Lưu xong, mọi concept được tính lại theo ngưỡng mới.
      </p>
      {THRESHOLD_KEYS.map((key) => (
        <div key={key}>
          <label className={fieldStyles.label} htmlFor={`study-${key}`}>
            {LIMITS[key].label} ({LIMITS[key].min}–{LIMITS[key].max})
          </label>
          <input
            id={`study-${key}`}
            inputMode="numeric"
            className={fieldStyles.input}
            value={form[key]}
            onChange={(e) => update({ [key]: e.target.value })}
          />
        </div>
      ))}
      <div>
        <label className={fieldStyles.label} htmlFor="study-seconds">
          Thời gian phản xạ tối đa, giây ({SECONDS_RANGE.min}–{SECONDS_RANGE.max})
        </label>
        <input
          id="study-seconds"
          inputMode="decimal"
          className={fieldStyles.input}
          value={form.maxSeconds}
          onChange={(e) => update({ maxSeconds: e.target.value })}
        />
        <p className={styles.note}>
          Bài gõ chép cần nhiều thời gian hơn bài bấm chọn: đặt riêng cho từng kiểu bài bên dưới (để trống
          = dùng mức chung). Vòng phản xạ chớp nhoáng cũng dùng các mức này làm giờ đếm ngược.
        </p>
      </div>
      {modules.map((module) => (
        <div key={module.id}>
          <label className={fieldStyles.label} htmlFor={`study-type-${module.id}`}>
            {module.label} ({module.languages.join('/')})
          </label>
          <input
            id={`study-type-${module.id}`}
            inputMode="decimal"
            placeholder="dùng mức chung"
            className={fieldStyles.input}
            value={form.secondsByType[module.id] ?? ''}
            onChange={(e) =>
              update({ secondsByType: { ...form.secondsByType, [module.id]: e.target.value } })
            }
          />
        </div>
      ))}

      <Button onClick={() => void handleSave()}>Lưu</Button>
      <Button variant="ghost" onClick={handleReset}>
        Về mặc định (chưa lưu)
      </Button>
      {notice && (
        <p className={notice.kind === 'ok' ? styles.ok : styles.error} role="status">
          {notice.text}
        </p>
      )}
    </Card>
  );
}
