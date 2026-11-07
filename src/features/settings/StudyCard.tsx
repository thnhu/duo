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
import {
  MAX_RETRIES_RANGE,
  PASS_PERCENT_RANGE,
  SESSION_COUNT_RANGE,
  defaultStudySettings,
  loadStudy,
  saveStudy,
} from '../../settings/study';
import { useToast } from '../../ui/Toast';
import styles from './SettingsPage.module.css';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

const THRESHOLD_KEYS = ['minCorrect', 'minDistinctContexts', 'minDistinctDays'] as const;

// Settings → Học: session size and the acquisition thresholds (spec section
// 2, "cấu hình chỉnh được"; journey J9 step 5).
export function StudyCard() {
  const [form, setForm] = useState<CriteriaForm | null>(null);
  const [count, setCount] = useState(String(defaultStudySettings.sessionCount));
  const [pass, setPass] = useState(String(defaultStudySettings.passagePassPercent));
  const [retries, setRetries] = useState(String(defaultStudySettings.passageMaxRetries));
  const toast = useToast();
  const [notice, setNotice] = useState<Notice>(null);
  const modules = exerciseModules.list();

  useEffect(() => {
    let current = true;
    void Promise.all([loadCriteria(), loadStudy()]).then(([criteria, study]) => {
      if (!current) return;
      setForm(toForm(criteria));
      setCount(String(study.sessionCount));
      setPass(String(study.passagePassPercent));
      setRetries(String(study.passageMaxRetries));
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
    const passagePassPercent = Number(pass.trim());
    if (!Number.isInteger(passagePassPercent) || passagePassPercent < PASS_PERCENT_RANGE.min || passagePassPercent > PASS_PERCENT_RANGE.max) {
      errors.push(`Điểm đạt đoạn văn: nhập số nguyên từ ${PASS_PERCENT_RANGE.min} đến ${PASS_PERCENT_RANGE.max} (%).`);
    }
    const passageMaxRetries = Number(retries.trim());
    if (retries.trim() === '' || !Number.isInteger(passageMaxRetries) || passageMaxRetries < MAX_RETRIES_RANGE.min || passageMaxRetries > MAX_RETRIES_RANGE.max) {
      errors.push(`Số lần làm lại đoạn văn: nhập số nguyên từ ${MAX_RETRIES_RANGE.min} đến ${MAX_RETRIES_RANGE.max}.`);
    }
    if (!parsed.ok || errors.length > 0) {
      setNotice({ kind: 'error', text: errors.join(' ') });
      return;
    }
    await saveCriteria(parsed.criteria);
    await saveStudy({ sessionCount, passagePassPercent, passageMaxRetries });
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
    setPass(String(defaultStudySettings.passagePassPercent));
    setRetries(String(defaultStudySettings.passageMaxRetries));
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

      <h3>Bài điền đoạn văn</h3>
      <p className={styles.note}>
        Nếu tỉ lệ chỗ trống đúng thấp hơn điểm đạt, đoạn văn hiện lại để bạn làm lại ngay. Chỉ lần làm đầu
        tiên được ghi vào lịch ôn và thụ đắc; các lần làm lại chỉ để luyện.
      </p>
      <div>
        <label className={fieldStyles.label} htmlFor="study-pass">
          Điểm đạt, % chỗ trống đúng ({PASS_PERCENT_RANGE.min}–{PASS_PERCENT_RANGE.max})
        </label>
        <input
          id="study-pass"
          inputMode="numeric"
          className={fieldStyles.input}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
      </div>
      <div>
        <label className={fieldStyles.label} htmlFor="study-retries">
          Số lần làm lại tối đa ({MAX_RETRIES_RANGE.min}–{MAX_RETRIES_RANGE.max}, 0 = không bắt làm lại)
        </label>
        <input
          id="study-retries"
          inputMode="numeric"
          className={fieldStyles.input}
          value={retries}
          onChange={(e) => setRetries(e.target.value)}
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
