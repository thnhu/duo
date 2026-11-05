import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { LangToggle } from '../../ui/LangToggle';
import fieldStyles from '../../ui/field.module.css';
import { conceptRepository } from '../../db/repositories';
import type { Lang, WordSet } from '../../db/types';
import { listWordSets, readStudySets, writeStudySets } from '../../wordsets';
import { SetChips } from '../sets/SetChips';
import { exerciseModules, modulesForLanguage, type ExerciseModule } from '../../exercises';
import { hasVoiceFor, isSpeechSupported } from '../../exercises/speech';
import { loadPairs } from '../../exercises/session';
import { loadStudy } from '../../settings/study';
import styles from './LearnPage.module.css';

// What the session screen needs to start; passed through router state.
export interface SessionConfig {
  // 'drill' = one chosen drill; 'review' = words due today; 'flash' = timed
  // quick-fire round. Review/flash pick the drill per question.
  kind?: 'drill' | 'review' | 'flash';
  moduleId?: string;
  lang?: Lang;
  lesson?: string;
  // Only words in one of these word sets (M13); empty/undefined = all.
  setIds?: string[];
  count: number;
  options: Record<string, string>;
}

const COUNTS = [5, 10, 20];

// The usual choices plus PO's own session size from Settings.
function countChoices(preferred: number): number[] {
  return [...new Set([...COUNTS, preferred])].sort((a, b) => a - b);
}

export function LearnPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>('de');
  const [lesson, setLesson] = useState('');
  const [count, setCount] = useState(10);
  const [preferredCount, setPreferredCount] = useState(10);
  const [lessons, setLessons] = useState<string[]>([]);
  const [sets, setSets] = useState<WordSet[]>([]);
  const [setIds, setSetIdsState] = useState<string[]>([]);
  const [available, setAvailable] = useState<Record<string, number>>({});
  const [optionValues, setOptionValues] = useState<Record<string, string>>({});
  // Does this device have the voice a drill reads with? Keyed by voice tag.
  const [voices, setVoices] = useState<Record<string, boolean>>({});

  const modules = modulesForLanguage(lang);

  // Sets of this language; the choice is remembered per language.
  useEffect(() => {
    let current = true;
    void listWordSets(lang).then((list) => {
      if (!current) return;
      setSets(list);
      const live = new Set(list.map((s) => s.id));
      setSetIdsState(readStudySets(`duo:learn-sets:${lang}`).filter((id) => live.has(id)));
    });
    return () => {
      current = false;
    };
  }, [lang]);

  function chooseSets(ids: string[]) {
    writeStudySets(`duo:learn-sets:${lang}`, ids);
    setSetIdsState(ids);
  }

  useEffect(() => {
    let current = true;
    void conceptRepository.listActive().then((concepts) => {
      if (!current) return;
      const set = new Set(
        concepts.filter((c) => c.lang === lang && c.source.lesson).map((c) => c.source.lesson!),
      );
      setLessons([...set].sort());
    });
    return () => {
      current = false;
    };
  }, [lang]);

  // How many words each drill can use right now.
  useEffect(() => {
    let current = true;
    void Promise.all(
      exerciseModules.list().map(async (m) => {
        const pairs = await loadPairs(m, { lang, lesson: lesson || undefined, setIds });
        return [m.id, pairs.length] as const;
      }),
    ).then((entries) => {
      if (current) setAvailable(Object.fromEntries(entries));
    });
    return () => {
      current = false;
    };
  }, [lang, lesson, setIds]);

  useEffect(() => {
    void loadStudy().then((study) => {
      setPreferredCount(study.sessionCount);
      setCount(study.sessionCount);
    });
  }, []);

  // Check every voice the registered drills need (not just German).
  useEffect(() => {
    const tags = [...new Set(exerciseModules.list().flatMap((m) => (m.speech ? [m.speech.tag] : [])))];
    let current = true;
    void Promise.all(tags.map(async (tag) => [tag, await hasVoiceFor(tag)] as const)).then((entries) => {
      if (current) setVoices(Object.fromEntries(entries));
    });
    return () => {
      current = false;
    };
  }, []);

  function start(module: ExerciseModule) {
    const options: Record<string, string> = {};
    for (const option of module.options ?? []) {
      options[option.id] = optionValues[`${module.id}.${option.id}`] ?? option.default;
    }
    const config: SessionConfig = {
      moduleId: module.id,
      lang,
      lesson: lesson || undefined,
      setIds,
      count,
      options,
    };
    navigate('/learn/session', { state: config });
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Học</h1>
        <LangToggle value={lang} onChange={setLang} />
      </div>

      <Card className={styles.settings}>
        <div>
          <label className={fieldStyles.label}>Số câu mỗi phiên</label>
          <div className={styles.counts} role="group" aria-label="Số câu">
            {countChoices(preferredCount).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={count === c}
                className={[styles.count, count === c && styles.countActive]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setCount(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        {sets.length > 0 && (
          <div>
            <label className={fieldStyles.label}>Deck</label>
            <SetChips sets={sets} selected={setIds} onChange={chooseSets} />
          </div>
        )}
        {lessons.length > 0 && (
          <div>
            <label className={fieldStyles.label} htmlFor="learn-lesson">
              Phạm vi
            </label>
            <select
              id="learn-lesson"
              className={fieldStyles.input}
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
            >
              <option value="">Tất cả từ đã nạp</option>
              {lessons.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {modules.length === 0 && (
        <p className={styles.empty}>
          Chưa có kiểu bài cho ngôn ngữ này.
        </p>
      )}

      <div className={styles.list}>
        {modules.map((module) => {
          const n = available[module.id];
          const noVoice = !!module.speech && (!isSpeechSupported() || voices[module.speech.tag] === false);
          const disabled = !n || noVoice;
          return (
            <Card key={module.id} className={styles.module}>
              <div>
                <h2>{module.label}</h2>
                <p className={styles.description}>{module.description}</p>
                <p className={styles.available}>
                  {n === undefined ? 'Đang kiểm tra…' : `${n} từ dùng được`}
                </p>
              </div>

              {module.options?.map((option) => (
                <div key={option.id}>
                  <label className={fieldStyles.label}>{option.label}</label>
                  <select
                    className={fieldStyles.input}
                    value={optionValues[`${module.id}.${option.id}`] ?? option.default}
                    onChange={(e) =>
                      setOptionValues({
                        ...optionValues,
                        [`${module.id}.${option.id}`]: e.target.value,
                      })
                    }
                  >
                    {option.choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              {noVoice && (
                <p className={styles.warning}>
                  Máy này không có giọng đọc {module.speech?.label} ({module.speech?.tag}) nên chưa
                  thể dùng bài này. Hãy cài giọng đọc trong cài đặt hệ thống (Text-to-speech) rồi mở
                  lại app.
                </p>
              )}
              {n === 0 && !noVoice && (
                <p className={styles.hint}>
                  {module.unavailableHint ?? 'Chưa có từ đủ dữ liệu cho bài này.'}
                </p>
              )}

              <Button disabled={disabled} onClick={() => start(module)}>
                Bắt đầu
              </Button>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
