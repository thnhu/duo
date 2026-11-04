import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { BackupError, exportBackup, restoreBackup } from '../../backup/json';
import { dateStamp, downloadBlob, getLastBackupAt, setLastBackupAt } from '../../backup/download';
import { exportXlsx } from '../../backup/table';
import { conceptRepository, exampleRepository } from '../../db/repositories';
import { StudyCard } from './StudyCard';
import { SyncCard } from './SyncCard';
import styles from './SettingsPage.module.css';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('vi-VN');
}

export function SettingsPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [lastBackup, setLastBackup] = useState<number | null>(getLastBackupAt());

  async function run(task: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ kind: 'ok', text: await task() });
    } catch (error) {
      const text = error instanceof BackupError ? error.message : 'Có lỗi xảy ra, dữ liệu không bị thay đổi.';
      setNotice({ kind: 'error', text });
    } finally {
      setBusy(false);
    }
  }

  const handleExportJson = () =>
    run(async () => {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      downloadBlob(blob, `duo-backup-${dateStamp()}.json`);
      setLastBackupAt(backup.exportedAt);
      setLastBackup(backup.exportedAt);
      const count = backup.tables.concepts.length;
      return `Đã xuất bản sao lưu đầy đủ (${count} từ). Hãy cất file ở nơi an toàn.`;
    });

  const handleExportXlsx = () =>
    run(async () => {
      const [concepts, examples] = await Promise.all([
        conceptRepository.listActive(),
        exampleRepository.listActive(),
      ]);
      downloadBlob(await exportXlsx(concepts, examples), `duo-words-${dateStamp()}.xlsx`);
      return `Đã xuất ${concepts.length} từ ra file xlsx (cùng cột với file mẫu nhập). File này để đọc/lưu trữ; sao lưu đầy đủ là file JSON.`;
    });

  const handleImportJson = (file: File) =>
    run(async () => {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new BackupError('File không đọc được (không phải JSON).');
      }
      const summary = await restoreBackup(data);
      return `Đã khôi phục: thêm ${summary.added}, cập nhật ${summary.updated}, giữ nguyên ${summary.kept} bản ghi. Không có gì bị xóa.`;
    });

  return (
    <section className={styles.page}>
      <h1>Cài đặt</h1>

      <StudyCard />

      <SyncCard />

      <Card className={styles.card}>
        <h2>Sao lưu</h2>
        <p className={styles.note}>
          {lastBackup
            ? `Lần xuất JSON gần nhất trên máy này: ${formatTime(lastBackup)}.`
            : 'Chưa xuất bản sao lưu nào trên máy này.'}
        </p>
        <Button disabled={busy} onClick={() => void handleExportJson()}>
          Xuất sao lưu JSON (đầy đủ)
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void handleExportXlsx()}>
          Xuất danh sách từ (xlsx)
        </Button>
      </Card>

      <Card className={styles.card}>
        <h2>Khôi phục</h2>
        <p className={styles.note}>
          Nhập file JSON đã xuất ở máy này hoặc máy khác. Dữ liệu được <strong>gộp</strong> vào máy hiện tại:
          bản ghi mới hơn thắng, không xóa gì.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className={styles.hidden}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleImportJson(file);
          }}
        />
        <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
          Nhập sao lưu JSON
        </Button>
        <p className={styles.note}>
          Muốn nạp danh sách từ từ file xlsx/csv? Dùng <Link to="/import">Nhập từ file</Link>.
        </p>
      </Card>

      {notice && (
        <p className={notice.kind === 'ok' ? styles.ok : styles.error} role="status">
          {notice.text}
        </p>
      )}
    </section>
  );
}
