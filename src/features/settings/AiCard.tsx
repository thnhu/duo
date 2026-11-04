import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { callsToday, getAiProvider, loadAiConfig, loadApiKey, saveAiConfig, saveApiKey } from '../../ai';
import styles from './SettingsPage.module.css';

// Settings → AI gợi ý nhãn (spec 6.6). The key stays on this device only:
// it is not synced, not in backups and not in the database.
export function AiCard() {
  const provider = getAiProvider();
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(() => loadApiKey() !== null);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    void loadAiConfig().then((config) => {
      if (!current) return;
      setEnabled(config.enabled);
      setModel(config.model ?? '');
      setLoaded(true);
    });
    return () => {
      current = false;
    };
  }, []);

  if (!loaded || !provider) return null;

  async function handleSave() {
    await saveAiConfig({ enabled, model });
    if (keyInput.trim()) {
      saveApiKey(keyInput);
      setKeyInput('');
      setHasKey(true);
    }
    setNotice('Đã lưu.');
  }

  function handleRemoveKey() {
    saveApiKey(null);
    setHasKey(false);
    setNotice('Đã xóa khóa API khỏi máy này.');
  }

  return (
    <Card className={styles.card}>
      <h2>AI gợi ý nhãn TMRND</h2>
      <p className={styles.note}>
        AI chỉ gợi ý 5 nhãn Tone, Mode, Register, Nuance, Dialect cho example bạn bấm yêu cầu. Gợi ý không bao
        giờ thành đáp án chấm điểm cho tới khi bạn chấp nhận. Tắt AI thì mọi chức năng khác vẫn dùng bình
        thường.
      </p>
      <p className={styles.note}>
        Nhà cung cấp: {provider.label}. Ở gói miễn phí, Google có thể dùng nội dung gửi đi để cải thiện sản
        phẩm. Chỉ câu ví dụ bạn yêu cầu được gửi.
      </p>

      <label className={styles.checkRow}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Bật AI gợi ý nhãn
      </label>

      <div>
        <label className={fieldStyles.label} htmlFor="ai-key">
          Khóa API (lưu trên máy này, không đồng bộ)
        </label>
        <input
          id="ai-key"
          type="password"
          autoComplete="off"
          className={fieldStyles.input}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={hasKey ? 'Đã có khóa. Nhập khóa mới để thay.' : 'Dán khóa từ Google AI Studio'}
        />
      </div>

      <div>
        <label className={fieldStyles.label} htmlFor="ai-model">
          Model (để trống = {provider.defaultModel})
        </label>
        <input
          id="ai-model"
          className={fieldStyles.input}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={provider.defaultModel}
        />
      </div>

      <p className={styles.note}>
        Số lần gọi AI hôm nay trên máy này: {callsToday()}. Hết lượt miễn phí thì dịch vụ báo lỗi, không tính
        tiền.
      </p>

      <Button onClick={() => void handleSave()}>Lưu</Button>
      {hasKey && (
        <Button variant="ghost" onClick={handleRemoveKey}>
          Xóa khóa API
        </Button>
      )}
      {notice && <p className={styles.note}>{notice}</p>}
      <p className={styles.note}>
        Chạy gợi ý hàng loạt và duyệt kết quả ở <Link to="/labels">Gợi ý nhãn</Link>.
      </p>
    </Card>
  );
}
