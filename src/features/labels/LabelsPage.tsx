import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import {
  acceptSuggestion,
  dismissSuggestion,
} from '../../ai/suggest';
import { needsSuggestion, runSuggestionBatch } from '../../ai/batch';
import { aiErrorText } from '../../ai/messages';
import { callsToday, getAiProvider, loadAiConfig, loadApiKey } from '../../ai';
import { conceptRepository, exampleRepository } from '../../db/repositories';
import type { Example } from '../../db/types';
import { SuggestionList } from './SuggestionList';
import styles from './LabelsPage.module.css';

const DEFAULT_BATCH = 25; // spec 6.6: spike of 20–30 real examples first

// Run AI suggestions in batch and review them (spec 6.6, journey J10).
// Nothing is sent unless the PO presses the button here (G13).
export function LabelsPage() {
  const provider = getAiProvider();
  const [examples, setExamples] = useState<Example[]>([]);
  const [conceptText, setConceptText] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(false);
  const [count, setCount] = useState(String(DEFAULT_BATCH));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const [, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const [all, concepts, config] = await Promise.all([
      exampleRepository.listActive(),
      conceptRepository.listActive(),
      loadAiConfig(),
    ]);
    setExamples(all);
    setConceptText(Object.fromEntries(concepts.map((c) => [c.id, c.text])));
    setEnabled(config.enabled);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const eligible = examples
    .filter(needsSuggestion)
    .sort((a, b) => a.createdAt - b.createdAt);
  const pending = examples
    .filter((e) => e.suggestedAttributes && e.attributesStatus !== 'verified')
    .sort((a, b) => (b.suggestedAttributes?.suggestedAt ?? 0) - (a.suggestedAttributes?.suggestedAt ?? 0));
  const ready = enabled && loadApiKey() !== null && provider !== undefined;
  const wanted = Math.max(1, Math.min(Number(count) || DEFAULT_BATCH, eligible.length || 1));

  async function handleRun() {
    if (!provider || running) return;
    const chosen = eligible.slice(0, wanted);
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setMessage('');
    setProgress({ done: 0, total: chosen.length });
    try {
      const result = await runSuggestionBatch({
        provider,
        examples: chosen,
        signal: controller.signal,
        onProgress: (p) => {
          setProgress(p);
          void load();
        },
      });
      const parts = [`Đã gợi ý ${result.done}/${result.total} example.`];
      if (result.failed) parts.push(`${result.failed} example AI trả lời không dùng được, đã bỏ qua.`);
      if (result.aborted) parts.push('Đã dừng theo yêu cầu.');
      if (result.stoppedBy) {
        parts.push(`${aiErrorText(result.stoppedBy)} Phần còn lại giữ nguyên, bấm lại sau.`);
      }
      setMessage(parts.join(' '));
    } finally {
      setRunning(false);
      setProgress(null);
      abortRef.current = null;
      await load();
      setTick((n) => n + 1);
    }
  }

  async function handleAccept(example: Example) {
    await acceptSuggestion(example);
    await load();
  }

  async function handleDismiss(example: Example) {
    await dismissSuggestion(example);
    await load();
  }

  function renderSentence(example: Example) {
    const h = example.highlight;
    if (!h) return example.text;
    return (
      <>
        <span className={styles.context}>{example.text.slice(0, h.start)}</span>
        <span className={styles.highlight}>{example.text.slice(h.start, h.end)}</span>
        <span className={styles.context}>{example.text.slice(h.end)}</span>
      </>
    );
  }

  return (
    <section className={styles.page}>
      <Link to="/settings" className={styles.back}>
        ← Cài đặt
      </Link>
      <h1>Gợi ý nhãn TMRND</h1>

      <Card className={styles.section}>
        <h2>Chạy gợi ý</h2>
        {!ready && (
          <p className={fieldStyles.hint}>
            AI chưa sẵn sàng: bật AI và nhập khóa API ở <Link to="/settings">Cài đặt</Link>. Bạn vẫn gắn nhãn
            tay được ở màn sửa example.
          </p>
        )}
        <p>
          {eligible.length} example chưa có nhãn có thể gợi ý. Hôm nay đã gọi AI {callsToday()} lần trên máy
          này.
        </p>
        <div>
          <label className={fieldStyles.label} htmlFor="batch-count">
            Số example gợi ý lần này (nên bắt đầu với {DEFAULT_BATCH} để tự đánh giá chất lượng)
          </label>
          <input
            id="batch-count"
            className={fieldStyles.input}
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <Button disabled={!ready || running || eligible.length === 0} onClick={() => void handleRun()}>
            {running && progress
              ? `Đang gợi ý ${progress.done}/${progress.total}…`
              : `Gợi ý cho ${eligible.length === 0 ? 0 : wanted} example`}
          </Button>
          {running && (
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
              Dừng
            </Button>
          )}
        </div>
        <p className={fieldStyles.hint}>
          Mỗi example cách nhau vài giây để không vượt hạn mức miễn phí. Chỉ câu ví dụ trong danh sách được
          gửi đi.
        </p>
        {message && <p role="status">{message}</p>}
      </Card>

      <div>
        <h2>Chờ bạn duyệt ({pending.length})</h2>
        <div className={styles.list}>
          {pending.length === 0 && <p className={fieldStyles.hint}>Chưa có gợi ý nào đang chờ.</p>}
          {pending.map((example) => (
            <Card key={example.id} className={styles.section}>
              <p className={styles.sentence}>{renderSentence(example)}</p>
              {example.targetConceptId && conceptText[example.targetConceptId] && (
                <p className={fieldStyles.hint}>Concept: {conceptText[example.targetConceptId]}</p>
              )}
              {example.suggestedAttributes && <SuggestionList suggestion={example.suggestedAttributes} />}
              <div className={styles.actions}>
                <Button onClick={() => void handleAccept(example)}>Chấp nhận</Button>
                <Link to={`/example/${example.id}`} className={styles.link}>
                  Sửa
                </Link>
                <Button variant="ghost" onClick={() => void handleDismiss(example)}>
                  Bỏ gợi ý
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
