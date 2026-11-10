import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useToast } from '../../ui/Toast';
import { formatBytes, loadStorageStats, requestPersistence, type StorageStats } from '../../diagnostics/storage';
import styles from './SettingsPage.module.css';

const LABELS: Record<string, string> = {
  dictionaries: 'Từ điển',
  concepts: 'Concept / word',
  examples: 'Example',
  exampleLinks: 'Liên kết example',
  conceptLinks: 'Liên kết concept',
  wordSets: 'Deck',
  lessons: 'Lesson',
  passages: 'Đoạn văn',
  choiceSets: 'Bộ thẻ',
  scheduleStates: 'Lịch ôn',
  reviewLogs: 'Log trả lời',
  importMappings: 'Ánh xạ cột nhập',
  importBatches: 'Lần nhập (để hoàn tác)',
  settings: 'Cài đặt',
};

// Settings -> Dung lượng: how much data this device holds and how much room is left.
export function StorageCard() {
  const toast = useToast();
  const [stats, setStats] = useState<StorageStats | null>(null);

  async function refresh() {
    setStats(await loadStorageStats());
  }

  useEffect(() => {
    void loadStorageStats().then(setStats);
  }, []);

  async function handlePersist() {
    const granted = await requestPersistence();
    toast.show(
      granted
        ? 'Trình duyệt đã đồng ý giữ dữ liệu bền vững.'
        : 'Trình duyệt chưa đồng ý. Hãy thêm app vào màn hình chính và xuất sao lưu JSON định kỳ.',
      { kind: granted ? 'success' : 'info' },
    );
    await refresh();
  }

  return (
    <Card className={styles.card}>
      <h2>Dung lượng dữ liệu</h2>
      {!stats ? (
        <p className={styles.note}>Đang đếm…</p>
      ) : (
        <>
          <p>
            <strong>{stats.totalRows.toLocaleString('vi-VN')}</strong> bản ghi, khoảng{' '}
            <strong>{formatBytes(stats.totalBytes)}</strong> trên máy này
            {stats.usage !== undefined && stats.quota ? (
              <>
                {' '}
                (trình duyệt cho app dùng tối đa khoảng {formatBytes(stats.quota)}, đang dùng {formatBytes(stats.usage)}
                ).
              </>
            ) : (
              '.'
            )}
          </p>
          <ul className={styles.note}>
            {stats.tables
              .filter((t) => t.rows > 0)
              .map((t) => (
                <li key={t.name}>
                  {LABELS[t.name] ?? t.name}: {t.rows.toLocaleString('vi-VN')} (~{formatBytes(t.bytes)})
                </li>
              ))}
          </ul>
          <p className={styles.note}>
            {stats.persisted === true
              ? 'Trình duyệt đã cam kết giữ dữ liệu của app.'
              : 'Trình duyệt có thể tự xóa dữ liệu của app nếu thiếu chỗ hoặc lâu không dùng (đặc biệt trên iPhone). Thêm app vào màn hình chính và xuất sao lưu JSON định kỳ.'}
          </p>
          <Button variant="secondary" onClick={() => void refresh()}>
            Đếm lại
          </Button>
          {stats.persisted !== true && <Button onClick={() => void handlePersist()}>Xin giữ dữ liệu bền vững</Button>}
        </>
      )}
    </Card>
  );
}
