import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { maxResponseTimeFor } from '../../acquisition';
import { loadCriteria } from '../../acquisition/update';
import type { AcquisitionCriteria } from '../../db/types';
import { exerciseModules, type Answer, type ExerciseLibrary } from '../../exercises';
import { loadLibrary } from '../../exercises/library';
import { loadReviewItems } from '../../exercises/review';
import { speak, stopSpeaking } from '../../exercises/speech';
import {
  buildSession,
  defaultOptions,
  loadPairs,
  recordAnswer,
  summarize,
  type AnswerRecord,
  type SessionItem,
} from '../../exercises/session';
import { ReflexTimer } from '../../exercises/timer';
import type { SessionConfig } from './LearnPage';
import styles from './SessionPage.module.css';

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export function SessionPage() {
  const config = useLocation().state as SessionConfig | null;
  const kind = config?.kind ?? 'drill';
  if (!config || (kind === 'drill' && !(config.moduleId && exerciseModules.has(config.moduleId)))) {
    return <Navigate to="/learn" replace />;
  }
  return <Session config={config} />;
}

function Session({ config }: { config: SessionConfig }) {
  const navigate = useNavigate();
  const kind = config.kind ?? 'drill';
  const fixedModule = config.moduleId ? exerciseModules.get(config.moduleId) : undefined;

  const [round, setRound] = useState(0);
  const [pairs, setPairs] = useState<SessionItem[] | null>(null);
  const [library, setLibrary] = useState<ExerciseLibrary>({ concepts: [] });
  const [criteria, setCriteria] = useState<AcquisitionCriteria | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer>({});
  const [record, setRecord] = useState<AnswerRecord | null>(null);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [finished, setFinished] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const timer = useRef(new ReflexTimer());
  const submitting = useRef(false);
  const answerRef = useRef<Answer>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // (Re)load the words for this session. Every answer is saved the moment
  // it is given, so stopping half way loses nothing (journey G2).
  useEffect(() => {
    let current = true;
    const loading: Promise<SessionItem[]> =
      kind === 'drill' && fixedModule && config.lang
        ? loadPairs(fixedModule, { lang: config.lang, lesson: config.lesson }).then((all) =>
            buildSession(all, config.count, Math.random).map((p) => ({ ...p, module: fixedModule })),
          )
        : loadReviewItems({ kind: kind === 'flash' ? 'flash' : 'review', count: config.count, lang: config.lang });
    void Promise.all([loading, loadCriteria(), loadLibrary()]).then(([items, loadedCriteria, loadedLibrary]) => {
      if (!current) return;
      setCriteria(loadedCriteria);
      setLibrary(loadedLibrary);
      setPairs(items);
      setIndex(0);
      setRecords([]);
      setRecord(null);
      setFinished(false);
    });
    return () => {
      current = false;
    };
  }, [kind, fixedModule, config, round]);

  const pair = pairs?.[index];
  const exercise = useMemo(
    () =>
      pair
        ? pair.module.generate(pair.concept, pair.example, {
            rng: Math.random,
            library,
            options: kind === 'drill' ? config.options : defaultOptions(pair.module),
          })
        : null,
    [pair, kind, config.options, library],
  );

  // Flash round: each question has a time limit (the same limit the
  // acquisition criteria use for that drill). When it runs out the answer
  // as it stands is submitted.
  const timeLimit =
    kind === 'flash' && criteria && pair ? maxResponseTimeFor(criteria, pair.module.id) : null;

  // A new question appears: clear the answer, start the clock (and read it
  // out for dictation).
  useEffect(() => {
    if (!exercise) return;
    setAnswer({});
    setRecord(null);
    setTimedOut(false);
    submitting.current = false;
    timer.current.start();
    if (exercise.speak) void speak(exercise.speak.text, exercise.speak.lang);
    return () => stopSpeaking();
  }, [exercise]);

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  useEffect(() => {
    if (!exercise || timeLimit === null || record) return;
    const id = setTimeout(() => void handleSubmit(true), timeLimit);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, timeLimit, record]);

  const allFilled = exercise?.fields.every((f) => (answer[f.key] ?? '').trim() !== '') ?? false;

  async function handleSubmit(force = false) {
    if (!exercise || !pair) return;
    if (record) {
      next();
      return;
    }
    if ((!force && !allFilled) || submitting.current) return;
    submitting.current = true;
    if (force) setTimedOut(true);
    // The core measures reaction time, from the question appearing to now.
    const elapsed = timer.current.stop();
    const result = await recordAnswer(
      pair.module,
      exercise,
      force ? answerRef.current : answer,
      elapsed,
    );
    setRecord(result);
    setRecords((all) => [...all, result]);
  }

  function next() {
    if (!pairs) return;
    if (index + 1 >= pairs.length) setFinished(true);
    else setIndex(index + 1);
  }

  function insertChar(char: string) {
    if (!focusedKey) return;
    const el = inputs.current[focusedKey];
    const value = answer[focusedKey] ?? '';
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setAnswer({ ...answer, [focusedKey]: value.slice(0, start) + char + value.slice(end) });
    requestAnimationFrame(() => el?.setSelectionRange(start + 1, start + 1));
  }

  if (pairs === null) return <p>Đang chuẩn bị…</p>;

  if (pairs.length === 0) {
    return (
      <section className={styles.page}>
        <p>
          {kind === 'drill'
            ? 'Chưa có từ nào dùng được cho bài này.'
            : kind === 'flash'
              ? 'Chưa có từ nào để luyện phản xạ.'
              : 'Hôm nay không có gì cần ôn.'}
        </p>
        <Button onClick={() => navigate(kind === 'drill' ? '/learn' : '/')}>Quay lại</Button>
      </section>
    );
  }

  if (finished) {
    return (
      <Summary
        records={records}
        total={pairs.length}
        onAgain={() => setRound((r) => r + 1)}
        onBack={() => navigate('/learn')}
      />
    );
  }

  if (!exercise) return null;

  const result = record?.result;
  const specialKeys = pair?.module.input?.specialKeys ?? [];
  const hasTextField = exercise.fields.some((f) => f.type === 'text');

  return (
    <section className={styles.page}>
      <div className={styles.top}>
        <span className={styles.progress}>
          {kind === 'flash' ? '⚡ ' : ''}Câu {index + 1}/{pairs.length} · {exercise.title}
        </span>
        <Button variant="ghost" onClick={() => setFinished(true)}>
          Dừng
        </Button>
      </div>

      {timeLimit !== null && !record && (
        <div className={styles.countdown} aria-hidden="true">
          <div className={styles.countdownBar} style={{ animationDuration: `${timeLimit}ms` }} />
        </div>
      )}

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <Card className={styles.question}>
          {exercise.speak ? (
            <div className={styles.speakRow}>
              <Button
                variant="secondary"
                onClick={() => void speak(exercise.speak!.text, exercise.speak!.lang)}
              >
                🔊 Nghe lại
              </Button>
              <Button
                variant="ghost"
                onClick={() => void speak(exercise.speak!.text, exercise.speak!.lang, 0.6)}
              >
                Nghe chậm
              </Button>
            </div>
          ) : null}
          <p className={exercise.speak ? styles.instruction : styles.prompt}>{exercise.prompt}</p>
          {exercise.detail && <p className={styles.detail}>{exercise.detail}</p>}
        </Card>

        {exercise.fields.map((field) => (
          <div key={field.key}>
            <label className={fieldStyles.label} htmlFor={`f-${field.key}`}>
              {field.label}
            </label>
            {field.type === 'choice' ? (
              <div className={styles.choices} role="group" aria-label={field.label}>
                {field.options?.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={!!record}
                    aria-pressed={answer[field.key] === option}
                    className={[
                      styles.choice,
                      answer[field.key] === option && styles.choiceActive,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setAnswer({ ...answer, [field.key]: option })}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <input
                id={`f-${field.key}`}
                ref={(el) => {
                  inputs.current[field.key] = el;
                }}
                className={fieldStyles.input}
                value={answer[field.key] ?? ''}
                disabled={!!record}
                lang={pair?.module.input?.lang}
                autoFocus={field === exercise.fields.find((f) => f.type === 'text')}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                onFocus={() => setFocusedKey(field.key)}
                onChange={(e) => setAnswer({ ...answer, [field.key]: e.target.value })}
              />
            )}
            {result && !result.perField[field.key] && (
              <p className={styles.expected}>Đáp án: {result.expected[field.key]}</p>
            )}
          </div>
        ))}

        {hasTextField && !record && specialKeys.length > 0 && (
          <div className={styles.keys} role="group" aria-label="Ký tự đặc biệt">
            {specialKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={styles.key}
                // Keep the text box focused while tapping a key.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertChar(key)}
              >
                {key}
              </button>
            ))}
          </div>
        )}

        {record && result && (
          <p className={result.correct ? styles.right : styles.wrong} role="status">
            {timedOut ? 'Hết giờ. ' : ''}
            {result.correct ? 'Đúng!' : 'Chưa đúng.'} · {seconds(record.responseTimeMs)}
          </p>
        )}

        <Button type="submit" disabled={!record && !allFilled}>
          {record ? (index + 1 >= pairs.length ? 'Xem kết quả' : 'Tiếp') : 'Kiểm tra'}
        </Button>
      </form>
    </section>
  );
}

function Summary({
  records,
  total,
  onAgain,
  onBack,
}: {
  records: AnswerRecord[];
  total: number;
  onAgain: () => void;
  onBack: () => void;
}) {
  const summary = summarize(records);
  return (
    <section className={styles.page}>
      <h1>Kết quả phiên</h1>
      <Card tinted className={styles.summary}>
        <p className={styles.score}>
          {summary.correct}/{summary.answered} đúng
        </p>
        {summary.answered < total && (
          <p className={styles.detail}>Đã dừng sớm ({summary.answered}/{total} câu).</p>
        )}
        {summary.answered > 0 && (
          <p>Thời gian phản xạ trung bình: {seconds(summary.averageMs)}</p>
        )}
      </Card>

      {summary.newlyAcquired.length > 0 && (
        <Card tinted className={styles.summary}>
          <h2>{summary.newlyAcquired.length} từ mới thụ đắc 🎉</h2>
          <ul className={styles.weak}>
            {summary.newlyAcquired.map((w, i) => (
              <li key={i}>
                <Link to={`/library/${w.conceptId}`}>{w.prompt}</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.weak.length > 0 && (
        <Card className={styles.summary}>
          <h2>Từ cần ôn thêm</h2>
          <ul className={styles.weak}>
            {summary.weak.map((w, i) => (
              <li key={i}>
                <Link to={`/library/${w.conceptId}`}>{w.prompt}</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className={styles.actions}>
        <Button onClick={onAgain}>Học tiếp</Button>
        <Button variant="secondary" onClick={onBack}>
          Chọn bài khác
        </Button>
      </div>
    </section>
  );
}
