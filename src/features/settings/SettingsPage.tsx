import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { BackupError, exportBackup, restoreBackup } from '../../backup/json';
import { dateStamp, downloadBlob, getLastBackupAt, setLastBackupAt } from '../../backup/download';
import { exportXlsx } from '../../backup/table';
import { conceptsInScope, isWholeKit, scopeLabel, scopeSlug, xlsxFileName, type ExportScope } from '../../backup/scope';
import { ExportScopeCard } from './ExportScopeCard';
import { conceptRepository, exampleRepository, lessonRepository, wordSetRepository } from '../../db/repositories';
import { useToast } from '../../ui/Toast';
import { StudyCard } from './StudyCard';
import { DepthCard } from './DepthCard';
import { SyncCard } from './SyncCard';
import { DiagnosticsCard } from './DiagnosticsCard';
import { VoiceCard } from './VoiceCard';
import styles from './SettingsPage.module.css';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('vi-VN');
}

export function SettingsPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [notice, setNotice] = useState<Notice>(null);
  const [scope, setScope] = useState<ExportScope>({});
  const [lastBackup, setLastBackup] = useState<number | null>(getLastBackupAt());

  async function run(task: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    try {
      toast.show(await task());
    } catch (error) {
      const text = error instanceof BackupError ? error.message : 'Có lỗi xảy ra, dữ liệu không bị thay đổi.';
      setNotice({ kind: 'error', text });
    } finally {
      setBusy(false);
    }
  }

  const handleExportJson = () =>
    run(async () => {
      const whole = isWholeKit(scope);
      const backup = await exportBackup(Date.now(), scope);
      if (backup.scope && backup.scope.conceptCount === 0) {
        throw new BackupError(`Phạm vi "${backup.scope.label}" chưa có concept nào để sao lưu.`);
      }
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const slug = backup.scope
        ? scopeSlug(backup.scope, { deckName: backup.scope.deckName, lessonName: backup.scope.lessonName })
        : '';
      downloadBlob(blob, slug ? `duo-backup-${slug}-${dateStamp()}.json` : `duo-backup-${dateStamp()}.json`);
      // Only a full backup counts as "the last backup" (the reminder).
      if (whole) {
        setLastBackupAt(backup.exportedAt);
        setLastBackup(backup.exportedAt);
        return `Đã xuất bản sao lưu đầy đủ (${backup.tables.concepts.length} concept). Hãy cất file ở nơi an toàn.`;
      }
      return `Đã xuất bản sao lưu một phần (${backup.scope!.label}): ${backup.scope!.conceptCount} concept cùng example, lesson, đoạn văn, lịch ôn của chúng. Nạp lại ở Khôi phục sẽ về đúng deck, lesson. Bản đầy đủ là xuất khi không chọn phạm vi.`;
    });

  const handleExportXlsx = () =>
    run(async () => {
      const [concepts, examples, sets, lessons] = await Promise.all([
        conceptRepository.listActive(),
        exampleRepository.listActive(),
        wordSetRepository.listActive(),
        lessonRepository.listActive(),
      ]);
      // Only the concepts inside the chosen scope.
      const inScope = conceptsInScope(concepts, scope, new Set(sets.map((d) => d.id)));
      const names = {
        deckName: sets.find((d) => d.id === scope.deck)?.name,
        lessonName: lessons.find((l) => l.id === scope.lessonId)?.name,
      };
      // Nothing to put in the file: say so instead of downloading an empty one.
      if (inScope.length === 0) throw new BackupError(`Phạm vi "${scopeLabel(scope, names)}" chưa có concept nào để xuất.`);
      downloadBlob(await exportXlsx(inScope, examples, sets, lessons), xlsxFileName(scope, names, dateStamp()));
      return `Đã xuất ${inScope.length} concept (${scopeLabel(scope, names)}) ra file xlsx. File này để đọc và sửa hàng loạt, nhập lại bằng Nhập từ file; không có liên kết, đoạn văn, lịch ôn. Sao lưu đầy đủ là file JSON.`;
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
      if (summary.partial) {
        const c = summary.concepts;
        return `Đã khôi phục bản sao lưu một phần (${summary.partial.label}): ${c.added} concept mới, ${c.updated} cập nhật, ${c.kept} giữ nguyên. Tổng cộng thêm ${summary.added}, cập nhật ${summary.updated}, giữ nguyên ${summary.kept} bản ghi. Không có gì bị xóa.`;
      }
      return `Đã khôi phục: thêm ${summary.added}, cập nhật ${summary.updated}, giữ nguyên ${summary.kept} bản ghi. Không có gì bị xóa.`;
    });

  return (
    <section className={styles.page}>
      <h1>Cài đặt</h1>

      <StudyCard />

      <DepthCard />

      <VoiceCard />

      <SyncCard />

      <DiagnosticsCard />

      <ExportScopeCard scope={scope} onChange={setScope} />

      <Card className={styles.card}>
        <h2>Sao lưu</h2>
        <p className={styles.note}>
          {lastBackup
            ? `Lần xuất JSON gần nhất trên máy này: ${formatTime(lastBackup)}.`
            : 'Chưa xuất bản sao lưu nào trên máy này.'}
        </p>
        <Button disabled={busy} onClick={() => void handleExportJson()}>
          {isWholeKit(scope) ? 'Xuất sao lưu JSON (đầy đủ)' : 'Xuất sao lưu JSON theo phạm vi'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void handleExportXlsx()}>
          Xuất danh sách concept (xlsx){isWholeKit(scope) ? '' : ' theo phạm vi'}
        </Button>
        <p className={styles.note}>
          Phạm vi ở trên áp dụng cho cả JSON và xlsx. Không chọn phạm vi thì JSON là bản sao lưu đầy đủ.
        </p>
        <ul className={styles.note}>
          <li>
            <strong>JSON</strong>: để sao lưu và khôi phục. Có đủ example, liên kết, đoạn văn, lesson, lịch ôn và lịch sử
            trả lời; nạp lại tự về đúng deck, lesson.
          </li>
          <li>
            <strong>xlsx</strong>: để đọc và sửa hàng loạt trong Excel. Chỉ có từ vựng (không có liên kết, đoạn văn,
            lịch ôn); nạp lại bằng Nhập từ file.
          </li>
        </ul>
      </Card>

      <Card className={styles.card}>
        <h2>Khôi phục</h2>
        <p className={styles.note}>
          Nhập file JSON đã xuất ở máy này hoặc máy khác, bản đầy đủ hay bản theo phạm vi. Dữ liệu được{' '}
          <strong>gộp</strong> vào máy hiện tại: bản ghi mới hơn thắng, không xóa gì; riêng cài đặt chỉ có trong bản
          đầy đủ.
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
          Muốn nạp danh sách concept từ file xlsx/csv? Dùng <Link to="/import">Nhập từ file</Link>.
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
