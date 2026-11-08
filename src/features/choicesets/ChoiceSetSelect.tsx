import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import fieldStyles from '../../ui/field.module.css';
import type { ChoiceSet, Lang } from '../../db/types';
import { createChoiceSet, listChoiceSets, parseItems } from '../../choicesets';
import { CHOICE_SET_ERRORS } from './ChoiceSetsPage';

interface ChoiceSetSelectProps {
  id: string;
  lang: Lang;
  // '' = none.
  value: string;
  // The chosen set (null = none), so the screen can use its tiles at once.
  onChange: (set: ChoiceSet | null) => void;
  // Bump to re-read the sets (after tiles were added from outside).
  reloadKey?: number;
  label?: string;
}

const NEW = '__new__';

// "Bộ thẻ": the tiles a grammar passage is answered with, picked from the sets
// the PO made. "+ Tạo bộ mới…" makes one here (name + tiles) without leaving.
export function ChoiceSetSelect({ id, lang, value, onChange, reloadKey = 0, label = 'Bộ thẻ' }: ChoiceSetSelectProps) {
  const [sets, setSets] = useState<ChoiceSet[]>([]);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState('');
  const [items, setItems] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    void listChoiceSets(lang).then((list) => {
      if (!current) return;
      setSets(list);
      // Keep the screen's copy of the chosen set fresh (its tiles may have changed).
      if (value) onChange(list.find((s) => s.id === value) ?? null);
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, reloadKey]);

  async function handleCreate() {
    setError('');
    const result = await createChoiceSet(lang, name, parseItems(items));
    if (!result.ok) return setError(CHOICE_SET_ERRORS[result.reason]);
    setSets(await listChoiceSets(lang));
    setMaking(false);
    setName('');
    setItems('');
    onChange(result.set);
  }

  return (
    <div>
      <label className={fieldStyles.label} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={fieldStyles.input}
        value={making ? NEW : sets.some((s) => s.id === value) ? value : ''}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setMaking(true);
            return;
          }
          setMaking(false);
          onChange(sets.find((s) => s.id === e.target.value) ?? null);
        }}
      >
        <option value="">— không có bộ thẻ (gõ đáp án) —</option>
        {sets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.items.join(' ')})
          </option>
        ))}
        <option value={NEW}>+ Tạo bộ thẻ mới…</option>
      </select>
      {making && (
        <>
          <input
            className={fieldStyles.input}
            aria-label="Tên bộ thẻ mới"
            value={name}
            autoFocus
            placeholder="vd: Bestimmter Artikel"
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className={fieldStyles.textarea}
            aria-label="Các thẻ"
            value={items}
            placeholder={'der\ndas\ndie'}
            onChange={(e) => setItems(e.target.value)}
          />
          {error && <p className={fieldStyles.error}>{error}</p>}
          <ButtonRow>
            <Button
              variant="secondary"
              disabled={!name.trim() || parseItems(items).length === 0}
              onClick={() => void handleCreate()}
            >
              Tạo bộ thẻ
            </Button>
            <Button variant="ghost" onClick={() => setMaking(false)}>
              Hủy
            </Button>
          </ButtonRow>
        </>
      )}
      <p className={fieldStyles.hint}>
        Mỗi dòng một thẻ. Sửa hoặc xóa bộ thẻ ở <Link to="/choice-sets">Bộ thẻ</Link>.
      </p>
    </div>
  );
}
