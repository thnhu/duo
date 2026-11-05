import { useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import fieldStyles from '../../ui/field.module.css';
import { filterConcepts } from '../../links';
import type { Concept } from '../../db/types';
import styles from './LinkEditorPage.module.css';

interface ConceptPickerProps {
  id: string;
  label: string;
  concepts: Concept[];
  selected: Concept | null;
  onSelect: (concept: Concept | null) => void;
  // "No match concept. Add?" (R3): creates the typed text as a new concept.
  onAdd?: (text: string) => Promise<void>;
}

// Search box + results that show each concept's description, so two concepts
// with the same spelling can be told apart (R3).
export function ConceptPicker({ id, label, concepts, selected, onSelect, onAdd }: ConceptPickerProps) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const hits = useMemo(() => filterConcepts(concepts, query), [concepts, query]);

  if (selected) {
    return (
      <div>
        <span className={fieldStyles.label}>{label}</span>
        <div className={styles.chosen}>
          <span>
            <strong>{selected.text}</strong>
            {selected.meanings[0] && <span className={styles.desc}>{selected.meanings[0]}</span>}
          </span>
          <Button variant="ghost" onClick={() => onSelect(null)}>
            Đổi
          </Button>
        </div>
      </div>
    );
  }

  async function handleAdd() {
    if (busy) return;
    setBusy(true);
    try {
      await onAdd?.(query.trim());
      setQuery('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className={fieldStyles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={fieldStyles.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Gõ từ hoặc mô tả để tìm…"
        autoComplete="off"
      />
      {hits.length > 0 && (
        <ul className={styles.results}>
          {hits.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={styles.result}
                onClick={() => {
                  onSelect(c);
                  setQuery('');
                }}
              >
                <strong>{c.text}</strong>
                {c.meanings[0] && <span className={styles.desc}>{c.meanings[0]}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && hits.length === 0 && !onAdd && <p className={styles.noMatch}>Không có concept nào khớp.</p>}
      {query.trim() && hits.length === 0 && onAdd && (
        <div className={styles.noMatch}>
          <span>Không có concept nào khớp.</span>
          <Button variant="secondary" disabled={busy} onClick={() => void handleAdd()}>
            Thêm “{query.trim()}”?
          </Button>
        </div>
      )}
    </div>
  );
}
