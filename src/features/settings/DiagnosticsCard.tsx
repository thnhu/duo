import { useState } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useToast } from '../../ui/Toast';
import { clearLog, readLog, type DiagEntry } from '../../diagnostics';
import styles from './SettingsPage.module.css';

const KIND_LABEL: Record<DiagEntry['kind'], string> = {
  error: 'Lỗi',
  rejection: 'Lỗi (promise)',
  freeze: 'Đứng hình',
  'dead-tap': 'Chạm không ăn',
};

function toText(entries: DiagEntry[]): string {
  return entries
    .map((e) => `${new Date(e.at).toLocaleString('vi-VN')} [${KIND_LABEL[e.kind]}] ${e.message}`)
    .join('\n');
}

// Settings → Nhật ký: what the on-device diagnostics caught (see src/diagnostics).
export function DiagnosticsCard() {
  const toast = useToast();
  const [entries, setEntries] = useState<DiagEntry[]>(() => readLog());

  async function copy() {
    try {
      await navigator.clipboard.writeText(toText(entries));
      toast.show('Đã sao chép nhật ký.');
    } catch {
      toast.show('Không sao chép được: hãy bôi đen khung bên dưới rồi chép tay.', { kind: 'error' });
    }
  }

  return (
    <Card className={styles.card}>
      <h2>Nhật ký lỗi</h2>
      <p className={styles.note}>
        App tự ghi lại lỗi, lần trang bị đứng hình và những lần chạm vào nút mà không có phản hồi (kèm phần tử đang
        nằm đè lên). Chỉ lưu trên máy này. Khi gặp lỗi, mở mục này (hoặc tải lại app rồi mở) và gửi nội dung cho người
        sửa lỗi.
      </p>
      {entries.length === 0 ? (
        <p className={styles.note}>Chưa ghi nhận gì.</p>
      ) : (
        <textarea readOnly value={toText(entries)} rows={10} style={{ width: '100%', fontSize: '0.75rem' }} />
      )}
      <Button variant="secondary" onClick={() => setEntries(readLog())}>
        Làm mới
      </Button>
      <Button disabled={entries.length === 0} onClick={() => void copy()}>
        Sao chép
      </Button>
      <Button
        variant="ghost"
        disabled={entries.length === 0}
        onClick={() => {
          clearLog();
          setEntries([]);
        }}
      >
        Xóa nhật ký
      </Button>
    </Card>
  );
}
