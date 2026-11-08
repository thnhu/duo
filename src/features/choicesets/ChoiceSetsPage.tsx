import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import { InlineConfirm } from '../../ui/InlineConfirm';
import { LangToggle } from '../../ui/LangToggle';
import { useToast } from '../../ui/Toast';
import fieldStyles from '../../ui/field.module.css';
import type { ChoiceSet } from '../../db/types';
import {
  createChoiceSet,
  deleteChoiceSet,
  listChoiceSets,
  parseItems,
  restoreChoiceSet,
  updateChoiceSet,
  type ChoiceSetResult,
} from '../../choicesets';
import { useLastLanguage } from '../quick-add/useLastLanguage';
import styles from '../sets/Sets.module.css';

export const CHOICE_SET_ERRORS: Record<Exclude<ChoiceSetResult, { ok: true }>['reason'], string> = {
  empty: 'Hãy nhập tên bộ thẻ.',
  'no-items': 'Hãy nhập ít nhất một thẻ.',
  duplicate: 'Đã có bộ thẻ cùng tên.',
  missing: 'Không tìm thấy bộ thẻ.',
};

// Tiles are typed one per line or separated by commas; the order is the order
// they appear on the answer screen.
export function ChoiceSetsPage() {
  const [lang, setLang] = useLastLanguage();
  const [sets, setSets] = useState<ChoiceSet[]>([]);
  const [name, setName] = useState('');
  const [items, setItems] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; items: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const toast = useToast();

  async function load() {
    setSets(await listChoiceSets(lang));
  }

  useEffect(() => {
    setError('');
    setEditing(null);
    setConfirming(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  async function handleCreate() {
    setError('');
    const result = await createChoiceSet(lang, name, parseItems(items));
    if (!result.ok) return setError(CHOICE_SET_ERRORS[result.reason]);
    setName('');
    setItems('');
    toast.show(`Đã tạo bộ thẻ "${result.set.name}".`);
    await load();
  }

  async function handleSave() {
    if (!editing) return;
    setError('');
    const result = await updateChoiceSet(editing.id, { name: editing.name, items: parseItems(editing.items) });
    if (!result.ok) return setError(CHOICE_SET_ERRORS[result.reason]);
    setEditing(null);
    toast.show('Đã lưu bộ thẻ.');
    await load();
  }

  async function handleDelete(set: ChoiceSet) {
    await deleteChoiceSet(set.id);
    setConfirming(null);
    toast.show(`Đã xóa bộ thẻ "${set.name}".`, {
      kind: 'info',
      action: {
        label: 'Hoàn tác',
        onClick: () => {
          void restoreChoiceSet(set.id).then(() => load());
        },
      },
    });
    await load();
  }

  return (
    <section className={styles.page}>
      <Link to="/passages" className={styles.back}>
        ← Đoạn văn
      </Link>
      <div className={styles.header}>
        <h1>Bộ thẻ</h1>
        <LangToggle value={lang} onChange={setLang} />
      </div>
      <p className={styles.hint}>
        Bộ thẻ là các thẻ bấm để trả lời đoạn văn ngữ pháp, ví dụ "Bestimmter Artikel": der, das, die, den, dem. Một bộ
        dùng lại cho nhiều đoạn văn. Có thể thêm thẻ gây nhiễu (ví dụ kein khi bài chỉ hỏi ein).
      </p>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <Card className={styles.card}>
        <label className={fieldStyles.label} htmlFor="new-choice-name">
          Tạo bộ thẻ mới
        </label>
        <input
          id="new-choice-name"
          className={fieldStyles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="vd: Bestimmter Artikel"
        />
        <label className={fieldStyles.label} htmlFor="new-choice-items">
          Các thẻ (mỗi dòng một thẻ, hoặc cách nhau bằng dấu phẩy)
        </label>
        <textarea
          id="new-choice-items"
          className={fieldStyles.textarea}
          value={items}
          onChange={(e) => setItems(e.target.value)}
          placeholder={'der\ndas\ndie'}
        />
        <ButtonRow>
          <Button disabled={!name.trim() || parseItems(items).length === 0} onClick={() => void handleCreate()}>
            Tạo bộ thẻ
          </Button>
        </ButtonRow>
      </Card>

      {sets.length === 0 && <p className={styles.hint}>Chưa có bộ thẻ nào cho ngôn ngữ này.</p>}

      {sets.map((set) => (
        <Card key={set.id} className={styles.setRow}>
          {editing?.id === set.id ? (
            <>
              <input
                className={fieldStyles.input}
                aria-label="Tên bộ thẻ"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <textarea
                className={fieldStyles.textarea}
                aria-label="Các thẻ"
                value={editing.items}
                onChange={(e) => setEditing({ ...editing, items: e.target.value })}
              />
              <ButtonRow>
                <Button onClick={() => void handleSave()}>Lưu</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Hủy
                </Button>
              </ButtonRow>
            </>
          ) : (
            <>
              <div className={styles.setHead}>
                <h2>{set.name}</h2>
                <span className={styles.count}>{set.items.length} thẻ</span>
              </div>
              <p>{set.items.join(' · ')}</p>
              <ButtonRow>
                <Button
                  variant="secondary"
                  onClick={() => setEditing({ id: set.id, name: set.name, items: set.items.join('\n') })}
                >
                  Sửa
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(set.id)}>
                  Xóa
                </Button>
              </ButtonRow>
              {confirming === set.id && (
                <InlineConfirm
                  confirmLabel="Xóa bộ thẻ"
                  onCancel={() => setConfirming(null)}
                  onConfirm={() => void handleDelete(set)}
                >
                  Xóa bộ thẻ "{set.name}"? Các đoạn văn đang dùng bộ này vẫn còn nhưng không có thẻ để bấm. Có thể
                  Hoàn tác ngay sau đó.
                </InlineConfirm>
              )}
            </>
          )}
        </Card>
      ))}
    </section>
  );
}
