import { useState } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import type { Concept, ConceptGrammar, LookupEntry } from '../../db/types';
import { applyReview, dismissSuggestion } from '../../lookup/apply';
import styles from './LookupReview.module.css';

interface LookupReviewProps {
  concept: Concept;
  onChanged: () => void;
}

// Review screen for a lookup suggestion (journey J3 steps 3-4): shows where
// each piece of information came from, lets PO pick and edit, and only the
// "Duyệt" button turns it into verified data.
export function LookupReview({ concept, onChanged }: LookupReviewProps) {
  const lookup = concept.lookup!;
  const [entryIndex, setEntryIndex] = useState(0);

  return (
    <Card className={styles.card}>
      <h2>Gợi ý tra cứu</h2>
      <p className={styles.source}>
        Nguồn:{' '}
        {lookup.sourceUrl ? (
          <a href={lookup.sourceUrl} target="_blank" rel="noreferrer">
            {lookup.sourceName ?? lookup.sourceUrl}
          </a>
        ) : (
          lookup.sourceName
        )}
        {lookup.license && (
          <>
            {' · '}
            {lookup.license.url ? (
              <a href={lookup.license.url} target="_blank" rel="noreferrer">
                {lookup.license.name}
              </a>
            ) : (
              lookup.license.name
            )}
          </>
        )}
      </p>

      {lookup.entries.length > 1 && (
        <div className={styles.entryTabs} role="group" aria-label="Loại từ">
          {lookup.entries.map((entry, i) => (
            <button
              key={i}
              type="button"
              className={[styles.tab, i === entryIndex && styles.tabActive].filter(Boolean).join(' ')}
              onClick={() => setEntryIndex(i)}
            >
              {entry.pos ?? `#${i + 1}`}
            </button>
          ))}
        </div>
      )}

      <EntryReview
        key={entryIndex}
        concept={concept}
        entry={lookup.entries[entryIndex]}
        onChanged={onChanged}
      />
    </Card>
  );
}

function EntryReview({
  concept,
  entry,
  onChanged,
}: {
  concept: Concept;
  entry: LookupEntry;
  onChanged: () => void;
}) {
  const isGerman = concept.lang === 'de';
  const [pickedDefs, setPickedDefs] = useState<Set<number>>(
    () => new Set(entry.definitions.slice(0, 1).map((_, i) => i)),
  );
  const [pickedExamples, setPickedExamples] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const suggested = entry.grammar;
  const existing = concept.grammar;
  const [gender, setGender] = useState(suggested?.gender ?? existing?.gender ?? '');
  const [plural, setPlural] = useState(suggested?.plural ?? existing?.plural ?? '');
  const [infinitiv, setInfinitiv] = useState(
    suggested?.verbForms?.infinitiv ?? existing?.verbForms?.infinitiv ?? '',
  );
  const [praeteritum, setPraeteritum] = useState(
    suggested?.verbForms?.praeteritum ?? existing?.verbForms?.praeteritum ?? '',
  );
  const [partizip2, setPartizip2] = useState(
    suggested?.verbForms?.partizip2 ?? existing?.verbForms?.partizip2 ?? '',
  );

  const isNoun = /noun/i.test(entry.pos ?? '');
  const isVerb = /verb/i.test(entry.pos ?? '');

  function toggle<T>(set: Set<T>, value: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  async function handleApprove() {
    setBusy(true);
    const grammar: ConceptGrammar = {};
    if (isGerman && isNoun) {
      if (gender) grammar.gender = gender;
      if (plural.trim()) grammar.plural = plural.trim();
    }
    if (isGerman && isVerb) {
      grammar.verbForms = {
        infinitiv: infinitiv.trim() || undefined,
        praeteritum: praeteritum.trim() || undefined,
        partizip2: partizip2.trim() || undefined,
      };
    }
    await applyReview(concept.id, {
      pos: entry.pos,
      meanings: entry.definitions.filter((_, i) => pickedDefs.has(i)).map((d) => d.text),
      grammar: Object.keys(grammar).length > 0 ? grammar : undefined,
      examples: entry.definitions.flatMap((d, di) =>
        (d.examples ?? []).filter((_, ei) => pickedExamples.has(`${di}:${ei}`)),
      ),
    });
    setBusy(false);
    onChanged();
  }

  async function handleDismiss() {
    setBusy(true);
    await dismissSuggestion(concept.id);
    setBusy(false);
    onChanged();
  }

  return (
    <>
      {isGerman && isNoun && (
        <div className={styles.grammar}>
          <div>
            <label className={fieldStyles.label}>Giống</label>
            <select className={fieldStyles.input} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">—</option>
              <option value="der">der</option>
              <option value="die">die</option>
              <option value="das">das</option>
            </select>
          </div>
          <div>
            <label className={fieldStyles.label}>Số nhiều</label>
            <input className={fieldStyles.input} value={plural} onChange={(e) => setPlural(e.target.value)} />
          </div>
        </div>
      )}
      {isGerman && isVerb && (
        <div className={styles.grammar}>
          <div>
            <label className={fieldStyles.label}>Infinitiv</label>
            <input className={fieldStyles.input} value={infinitiv} onChange={(e) => setInfinitiv(e.target.value)} />
          </div>
          <div>
            <label className={fieldStyles.label}>Präteritum</label>
            <input className={fieldStyles.input} value={praeteritum} onChange={(e) => setPraeteritum(e.target.value)} />
          </div>
          <div>
            <label className={fieldStyles.label}>Partizip II</label>
            <input className={fieldStyles.input} value={partizip2} onChange={(e) => setPartizip2(e.target.value)} />
          </div>
        </div>
      )}

      <p className={fieldStyles.hint}>
        Tick nghĩa/ví dụ muốn giữ. Nghĩa nguồn bằng tiếng Anh — sau khi duyệt bạn có thể sửa lại ở ô "Nghĩa".
      </p>

      <ul className={styles.defs}>
        {entry.definitions.map((definition, di) => (
          <li key={di} className={styles.def}>
            <label className={styles.defRow}>
              <input
                type="checkbox"
                checked={pickedDefs.has(di)}
                onChange={() => toggle(pickedDefs, di, setPickedDefs)}
              />
              <span>
                {definition.labels?.map((label) => (
                  <span key={label} className={styles.label}>
                    {label}
                  </span>
                ))}
                {definition.text}
              </span>
            </label>
            {definition.examples?.map((example, ei) => (
              <label key={ei} className={`${styles.defRow} ${styles.example}`}>
                <input
                  type="checkbox"
                  checked={pickedExamples.has(`${di}:${ei}`)}
                  onChange={() => toggle(pickedExamples, `${di}:${ei}`, setPickedExamples)}
                />
                <span>
                  {example.text}
                  {example.translation && <em className={styles.translation}> — {example.translation}</em>}
                </span>
              </label>
            ))}
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <Button disabled={busy} onClick={() => void handleApprove()}>
          Duyệt và áp dụng
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void handleDismiss()}>
          Bỏ gợi ý
        </Button>
      </div>
    </>
  );
}
