import { useState, useSyncExternalStore } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { activeSyncAdapter } from '../../sync';
import { syncManager } from '../../sync/manager';
import { SyncError } from '../../sync/types';
import styles from './SettingsPage.module.css';

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('vi-VN');
}

// Settings → Đồng bộ (journey J0/J9). Three states: not set up on this
// device, set up but signed out, signed in.
export function SyncCard() {
  const state = useSyncExternalStore(syncManager.subscribe, syncManager.getState);
  const [config, setConfig] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  function handleSaveConfig() {
    setMessage(null);
    try {
      syncManager.configure(config);
      setConfig('');
    } catch (error) {
      setMessage(error instanceof SyncError ? error.message : 'Không đọc được cấu hình.');
    }
  }

  const adapter = activeSyncAdapter();
  const busy = state.phase === 'syncing';

  return (
    <Card className={styles.card}>
      <h2>Đồng bộ giữa các thiết bị</h2>
      <p className={styles.note}>
        Dùng {adapter.label}. Dữ liệu luôn lưu trên máy trước; đồng bộ chạy nền, app vẫn dùng bình thường khi
        mất mạng hoặc khi dịch vụ ngừng. Xem hướng dẫn thiết lập ở <code>docs/sync-setup.md</code>.
      </p>

      {state.phase === 'unconfigured' && (
        <>
          <label className={fieldStyles.label} htmlFor="sync-config">
            Cấu hình Firebase (dán khối firebaseConfig)
          </label>
          <textarea
            id="sync-config"
            className={fieldStyles.textarea}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder={'{ "apiKey": "…", "authDomain": "…", "projectId": "…", "appId": "…" }'}
            spellCheck={false}
          />
          <Button disabled={!config.trim()} onClick={handleSaveConfig}>
            Lưu cấu hình
          </Button>
        </>
      )}

      {state.phase === 'signed-out' && (
        <>
          <label className={fieldStyles.label} htmlFor="sync-email">
            Email
          </label>
          <input
            id="sync-email"
            type="email"
            autoComplete="email"
            className={fieldStyles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className={fieldStyles.label} htmlFor="sync-password">
            Mật khẩu
          </label>
          <input
            id="sync-password"
            type="password"
            autoComplete="current-password"
            className={fieldStyles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button disabled={!email || !password} onClick={() => void syncManager.signIn(email, password, false)}>
            Đăng nhập
          </Button>
          <Button
            variant="secondary"
            disabled={!email || !password}
            onClick={() => void syncManager.signIn(email, password, true)}
          >
            Tạo tài khoản mới
          </Button>
          {adapter.signInWithGoogle && (
            <Button variant="secondary" onClick={() => void syncManager.signInWithGoogle()}>
              Đăng nhập bằng Google
            </Button>
          )}
          <Button variant="ghost" onClick={() => void syncManager.removeConfiguration()}>
            Gỡ cấu hình trên máy này
          </Button>
        </>
      )}

      {(state.phase === 'idle' || state.phase === 'syncing' || state.phase === 'error') && state.user && (
        <>
          <p>
            Đã đăng nhập: <strong>{state.user.label}</strong>
          </p>
          <p className={styles.note}>
            {busy
              ? 'Đang đồng bộ…'
              : state.lastSyncAt
                ? `Đồng bộ lần cuối: ${formatTime(state.lastSyncAt)}${
                    state.lastReport ? ` (gửi ${state.lastReport.pushed}, nhận ${state.lastReport.pulled})` : ''
                  }.`
                : 'Chưa đồng bộ lần nào.'}
          </p>
          <Button disabled={busy} onClick={() => void syncManager.syncNow(true)}>
            Đồng bộ ngay
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void syncManager.resyncAll()}>
            Đồng bộ lại toàn bộ
          </Button>
          <p className={styles.note}>
            Dùng khi dữ liệu (ví dụ bộ thẻ) có ở máy này mà không có ở máy kia: máy này gửi lại mọi thứ và nhận lại
            mọi thứ từ đầu, bản mới hơn thắng. Nên bấm ở máy có dữ liệu trước, rồi mới bấm ở máy còn thiếu.
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void syncManager.signOut()}>
            Đăng xuất
          </Button>
        </>
      )}

      {(state.error || message) && (
        <p className={styles.error} role="status">
          {message ?? state.error?.message}
          {state.error?.kind === 'offline' && ' Sẽ tự thử lại khi có mạng.'}
        </p>
      )}
    </Card>
  );
}
