import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import { InlineConfirm } from '../../ui/InlineConfirm';
import { LangToggle } from '../../ui/LangToggle';
import { useToast } from '../../ui/Toast';
import fieldStyles from '../../ui/field.module.css';
import type { Lesson, WordSet } from '../../db/types';
import {
  countByLesson,
  createLesson,
  deleteLesson,
  listLessons,
  moveLesson,
  previewLessonDelete,
  renameLesson,
  restoreLesson,
} from '../../lessons';
import { GENERAL_DECK_NAME, listWordSets } from '../../wordsets';
import { useLastLanguage } from '../quick-add/useLastLanguage';
import styles from '../sets/Sets.module.css';

const GENERAL = 'general';

// Manage the lessons of one deck (Bản 8, M15b): create, rename, reorder, delete.
// A lesson is a named topic of about twenty words ("Family", "Daily
// activities"). Deleting a lesson only takes the words out of it.
export function LessonsPage() {
  const [lang, setLang] = useLastLanguage();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [decks, setDecks] = useState<WordSet[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; concepts: number } | null>(null);
  const [error, setError] = useState('');

  // The address says which deck: ?deck=general or a deck id.
  const deckKey = params.get('deck') ?? GENERAL;
  const deck = deckKey === GENERAL ? undefined : decks.find((d) => d.id === deckKey);
  // A deck of the other language, or a deleted one, falls back to General.
  const setId = deck?.id;

  useEffect(() => {
    let current = true;
    void listWordSets(lang).then((list) => {
      if (current) setDecks(list);
    });
    return () => {
      current = false;
    };
  }, [lang]);

  async function load() {
    const list = await listLessons(lang, setId);
    setLessons(list);
    setCounts(await countByLesson(lang, setId));
  }

  useEffect(() => {
    setError('');
    setEditing(null);
    setConfirming(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, setId]);

  const reasonText = (reason: 'empty' | 'duplicate' | 'missing') =>
    reason === 'duplicate'
      ? 'Deck này đã có lesson cùng tên.'
      : reason === 'empty'
        ? 'Hãy nhập tên lesson.'
        : 'Không tìm thấy lesson này.';

  async function handleCreate() {
    setError('');
    const result = await createLesson(lang, setId, draft);
    if (!result.ok) return setError(reasonText(result.reason));
    setDraft('');
    toast.show(`Đã tạo lesson "${result.lesson.name}".`);
    await load();
  }

  async function handleRename() {
    if (!editing) return;
    setError('');
    const result = await renameLesson(editing.id, editing.name);
    if (!result.ok) return setError(reasonText(result.reason));
    setEditing(null);
    toast.show('Đã đổi tên lesson. Mọi từ trong lesson đổi theo.');
    await load();
  }

  async function handleMove(lesson: Lesson, direction: -1 | 1) {
    await moveLesson(lesson.id, direction);
    await load();
  }

  async function askDelete(lesson: Lesson) {
    setConfirming({ id: lesson.id, ...(await previewLessonDelete(lesson.id)) });
  }

  async function handleDelete(lesson: Lesson) {
    const undo = await deleteLesson(lesson.id);
    setConfirming(null);
    toast.show(`Đã xóa lesson "${lesson.name}". ${undo.conceptIds.length} từ vẫn còn trong deck.`, {
      action: {
        label: 'Hoàn tác',
        onClick: () => {
          void restoreLesson(undo).then(() => load());
        },
      },
    });
    await load();
  }

  return (
    <section className={styles.page}>
      <Link to="/library" className={styles.back}>
        ← Thư viện
      </Link>
      <div className={styles.header}>
        <h1>Lesson</h1>
        <LangToggle
          value={lang}
          onChange={(next) => {
            setLang(next);
            setParams({ deck: GENERAL });
          }}
        />
      </div>
      <p className={styles.hint}>
        Lesson là một chủ đề có tên trong deck (ví dụ Family, Daily activities), khoảng 20 từ. Một từ thuộc một lesson.
        Xóa lesson chỉ đưa các từ ra khỏi lesson, không xóa từ.
      </p>

      <div>
        <label className={fieldStyles.label} htmlFor="lessons-deck">
          Deck
        </label>
        <select
          id="lessons-deck"
          className={fieldStyles.input}
          value={deck ? deck.id : GENERAL}
          onChange={(e) => setParams({ deck: e.target.value })}
        >
          <option value={GENERAL}>{GENERAL_DECK_NAME}</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <Card className={styles.card}>
        <label className={fieldStyles.label} htmlFor="new-lesson">
          Tạo lesson mới
        </label>
        <input
          id="new-lesson"
          className={fieldStyles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="vd: Family"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate();
          }}
        />
        <ButtonRow>
          <Button disabled={!draft.trim()} onClick={() => void handleCreate()}>
            Tạo lesson
          </Button>
        </ButtonRow>
      </Card>

      {lessons.length === 0 && <p className={styles.hint}>Deck này chưa có lesson nào.</p>}

      {lessons.map((lesson, index) => (
        <Card key={lesson.id} className={styles.setRow}>
          {editing?.id === lesson.id ? (
            <>
              <input
                className={fieldStyles.input}
                aria-label="Tên lesson"
                value={editing.name}
                onChange={(e) => setEditing({ id: lesson.id, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleRename();
                }}
              />
              <ButtonRow>
                <Button onClick={() => void handleRename()}>Lưu</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Hủy
                </Button>
              </ButtonRow>
            </>
          ) : (
            <>
              <div className={styles.setHead}>
                <h2>{lesson.name}</h2>
                <span className={styles.count}>{counts.get(lesson.id) ?? 0} từ</span>
              </div>
              <ButtonRow>
                <Button
                  variant="secondary"
                  aria-label={`Đưa lesson ${lesson.name} lên`}
                  disabled={index === 0}
                  onClick={() => void handleMove(lesson, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="secondary"
                  aria-label={`Đưa lesson ${lesson.name} xuống`}
                  disabled={index === lessons.length - 1}
                  onClick={() => void handleMove(lesson, 1)}
                >
                  ↓
                </Button>
                <Button variant="secondary" onClick={() => setEditing({ id: lesson.id, name: lesson.name })}>
                  Đổi tên
                </Button>
                <Button variant="ghost" onClick={() => void askDelete(lesson)}>
                  Xóa lesson
                </Button>
              </ButtonRow>
              {confirming?.id === lesson.id && (
                <InlineConfirm
                  confirmLabel="Xóa lesson"
                  onCancel={() => setConfirming(null)}
                  onConfirm={() => void handleDelete(lesson)}
                >
                  Xóa lesson "{lesson.name}"?{' '}
                  {confirming.concepts > 0
                    ? `${confirming.concepts} từ sẽ ra khỏi lesson (không bị xóa). Có thể Hoàn tác ngay sau đó.`
                    : 'Lesson đang trống.'}
                </InlineConfirm>
              )}
            </>
          )}
        </Card>
      ))}
    </section>
  );
}
