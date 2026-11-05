import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import { LangToggle } from '../../ui/LangToggle';
import fieldStyles from '../../ui/field.module.css';
import { conceptRepository } from '../../db/repositories';
import type { WordSet } from '../../db/types';
import { countBySet, createWordSet, deleteWordSet, listWordSets, renameWordSet, type SetCounts } from '../../wordsets';
import { useLastLanguage } from '../quick-add/useLastLanguage';
import styles from './Sets.module.css';

// Manage word sets of one language: create, rename, delete. Deleting a set
// only removes the label; the words stay in the library (and in other sets).
export function SetsPage() {
  const [lang, setLang] = useLastLanguage();
  const [sets, setSets] = useState<WordSet[]>([]);
  const [counts, setCounts] = useState<SetCounts | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');

  async function load() {
    const [list, concepts] = await Promise.all([listWordSets(lang), conceptRepository.listActive()]);
    setSets(list);
    setCounts(countBySet(concepts.filter((c) => c.lang === lang), list));
  }

  useEffect(() => {
    setError('');
    setEditing(null);
    void load();
  }, [lang]);

  const reasonText = (reason: 'empty' | 'duplicate') =>
    reason === 'duplicate' ? 'Đã có deck cùng tên.' : 'Hãy nhập tên deck.';

  async function handleCreate() {
    setError('');
    const result = await createWordSet(lang, draft);
    if (!result.ok) return setError(reasonText(result.reason));
    setDraft('');
    await load();
  }

  async function handleRename() {
    if (!editing) return;
    setError('');
    const result = await renameWordSet(editing.id, editing.name);
    if (!result.ok) return setError(reasonText(result.reason));
    setEditing(null);
    await load();
  }

  async function handleDelete(set: WordSet) {
    const n = counts?.bySet.get(set.id) ?? 0;
    const message =
      n > 0
        ? `Xóa deck "${set.name}"? ${n} từ trong deck vẫn còn trong thư viện, chỉ bỏ nhãn deck.`
        : `Xóa deck "${set.name}"?`;
    if (!confirm(message)) return;
    await deleteWordSet(set.id);
    await load();
  }

  return (
    <section className={styles.page}>
      <Link to="/library" className={styles.back}>
        ← Thư viện
      </Link>
      <div className={styles.header}>
        <h1>Deck</h1>
        <LangToggle value={lang} onChange={setLang} />
      </div>
      <p className={styles.hint}>
        Deck gom các từ theo mục đích (ví dụ IT, từ phim). Một từ có thể nằm trong nhiều deck.
      </p>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <Card className={styles.card}>
        <label className={fieldStyles.label} htmlFor="new-set">
          Tạo deck mới
        </label>
        <input
          id="new-set"
          className={fieldStyles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="vd: IT"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate();
          }}
        />
        <ButtonRow>
          <Button disabled={!draft.trim()} onClick={() => void handleCreate()}>
            Tạo deck
          </Button>
        </ButtonRow>
      </Card>

      {sets.length === 0 && <p className={styles.hint}>Chưa có deck nào cho ngôn ngữ này.</p>}

      {sets.map((set) => (
        <Card key={set.id} className={styles.setRow}>
          {editing?.id === set.id ? (
            <>
              <input
                className={fieldStyles.input}
                aria-label="Tên deck"
                value={editing.name}
                onChange={(e) => setEditing({ id: set.id, name: e.target.value })}
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
                <h2>{set.name}</h2>
                <span className={styles.count}>{counts?.bySet.get(set.id) ?? 0} từ</span>
              </div>
              <ButtonRow>
                <Button variant="secondary" onClick={() => setEditing({ id: set.id, name: set.name })}>
                  Đổi tên
                </Button>
                <Button variant="ghost" onClick={() => void handleDelete(set)}>
                  Xóa deck
                </Button>
              </ButtonRow>
            </>
          )}
        </Card>
      ))}
    </section>
  );
}
