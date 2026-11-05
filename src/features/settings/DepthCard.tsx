import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import {
  MIN_EXPRESSIONS_RANGE,
  defaultDepthSettings,
  loadDepthSettings,
  saveDepthSettings,
} from '../../depth';
import styles from './SettingsPage.module.css';

// Settings → Học sâu: how many different ways of saying a concept count as
// tri-fold complete (spec 1.4).
export function DepthCard() {
  const [value, setValue] = useState(String(defaultDepthSettings.minExpressions));
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    void loadDepthSettings().then((s) => {
      if (current) setValue(String(s.minExpressions));
    });
    return () => {
      current = false;
    };
  }, []);

  async function handleSave() {
    const n = Number(value.trim());
    if (!Number.isInteger(n) || n < MIN_EXPRESSIONS_RANGE.min || n > MIN_EXPRESSIONS_RANGE.max) {
      setNotice(`Nhập số nguyên từ ${MIN_EXPRESSIONS_RANGE.min} đến ${MIN_EXPRESSIONS_RANGE.max}.`);
      return;
    }
    await saveDepthSettings({ minExpressions: n });
    setNotice('Đã lưu.');
  }

  return (
    <Card className={styles.card}>
      <h2>Học sâu (tri-fold)</h2>
      <div>
        <label className={fieldStyles.label} htmlFor="depth-min">
          Số cách diễn đạt khác nhau cho một concept
        </label>
        <input
          id="depth-min"
          inputMode="numeric"
          className={fieldStyles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <p className={styles.note}>
        Mặc định 3. Một cách chỉ được tính khi đã gắn nhãn TMRND và khác các cách trước ở ít nhất một nhãn.
        Ngưỡng này đặt riêng từng thiết bị.
      </p>
      <Button onClick={() => void handleSave()}>Lưu</Button>
      {notice && <p className={styles.note}>{notice}</p>}
    </Card>
  );
}
