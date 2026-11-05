import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import type { Concept } from '../../db/types';
import { lookupQueue, needsLookup } from '../../lookup';
import { useLookupQueue } from './useLookupQueue';
import styles from './LookupBar.module.css';

interface LookupBarProps {
  concepts: Concept[];
}

// Library header card: start the automatic lookup for words that have no
// suggestion yet and follow its progress (journey J3 steps 1-2).
export function LookupBar({ concepts }: LookupBarProps) {
  const state = useLookupQueue();
  const missing = concepts.filter(needsLookup);
  const pendingReview = concepts.filter(
    (c) => c.verification === 'unverified' && c.lookup?.status === 'found',
  ).length;

  const running = state.status === 'running';
  const paused = state.status === 'paused';
  const finished = state.status === 'idle' && state.total > 0;

  if (missing.length === 0 && state.status === 'idle' && state.total === 0 && pendingReview === 0) {
    return null;
  }

  return (
    <Card tinted className={styles.bar}>
      {(running || paused) && (
        <>
          <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.done}>
            <div
              className={styles.progressFill}
              style={{ width: `${state.total ? (state.done / state.total) * 100 : 0}%` }}
            />
          </div>
          <p>
            {running ? 'Đang tra cứu' : 'Tra cứu tạm dừng'}: {state.done}/{state.total} concept
            {state.found > 0 && ` · ${state.found} có gợi ý`}
            {state.notFound > 0 && ` · ${state.notFound} không thấy`}
          </p>
          {paused && state.error && <p className={styles.warning}>{state.error.message}</p>}
          <ButtonRow>
            {running && (
              <Button variant="secondary" onClick={() => lookupQueue.stop()}>
                Dừng
              </Button>
            )}
            {paused && (
              <>
                <Button onClick={() => void lookupQueue.start()}>Thử lại</Button>
                <Button variant="ghost" onClick={() => lookupQueue.clear()}>
                  Hủy phần còn lại
                </Button>
              </>
            )}
          </ButtonRow>
        </>
      )}

      {!running && !paused && (
        <>
          {finished && (
            <div className={styles.summaryRow}>
              <p>
                Tra cứu xong: {state.found} có gợi ý, {state.notFound} không tìm thấy
                {state.skipped > 0 && `, ${state.skipped} bỏ qua (cụm nhiều word)`}.
              </p>
              <Button variant="ghost" onClick={() => lookupQueue.clear()}>
                Đóng
              </Button>
            </div>
          )}
          {pendingReview > 0 && (
            <p>{pendingReview} concept có gợi ý đang chờ bạn duyệt — mở concept để xem và duyệt.</p>
          )}
          {missing.length > 0 && (
            <>
              <Button onClick={() => lookupQueue.enqueue(missing.map((c) => c.id))}>
                Tra cứu tự động {missing.length} concept
              </Button>
              <p className={styles.hint}>
                Chỉ gửi từng word đơn lẻ tới từ điển, chạy nền và giãn nhịp. Kết quả chỉ là gợi ý cho đến khi bạn duyệt.
              </p>
            </>
          )}
        </>
      )}
    </Card>
  );
}
