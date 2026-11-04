import type { SuggestedAttributes } from '../../db/types';
import styles from './LabelsPage.module.css';

const ROWS: Array<{ key: 'tone' | 'mode' | 'register' | 'nuance' | 'dialect'; label: string }> = [
  { key: 'tone', label: 'Tone' },
  { key: 'mode', label: 'Mode' },
  { key: 'register', label: 'Register' },
  { key: 'nuance', label: 'Nuance' },
  { key: 'dialect', label: 'Dialect' },
];

// The five suggested labels with the AI's short reason for each. Shown
// wherever a suggestion awaits the PO's decision.
export function SuggestionList({ suggestion }: { suggestion: SuggestedAttributes }) {
  return (
    <dl className={styles.suggestions}>
      {ROWS.map(({ key, label }) => {
        const item = suggestion[key];
        return (
          <div key={key} className={styles.suggestionRow}>
            <dt>{label}</dt>
            <dd>
              <strong>{item ? item.value : '—'}</strong>
              {item?.reason && <span className={styles.reason}> {item.reason}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
