import { Card } from '../../ui/Card';
import { HighlightedText } from '../../ui/HighlightedText';
import type { Lang } from '../../db/types';
import styles from './ConceptSuggestions.module.css';
import { useSearch } from './useSearch';

interface ConceptSuggestionsProps {
  phrase: string;
  lang: Lang;
  // Concept the PO chose to link to instead of the default
  // (exact match, else a new concept). Undefined = default.
  pickedId?: string;
  onPick: (conceptId: string | undefined) => void;
}

// F3: when a phrase is highlighted, offer existing concepts that look like
// it so PO can link to one instead of creating a near-duplicate.
export function ConceptSuggestions({ phrase, lang, pickedId, onPick }: ConceptSuggestionsProps) {
  const { response } = useSearch({
    text: phrase,
    kinds: ['concept'],
    mode: 'related',
    filters: { lang },
    limit: 4,
  });
  const hits = response?.hits ?? [];
  if (hits.length === 0) return null;

  return (
    <Card tinted className={styles.box}>
      <p className={styles.title}>Gắn vào concept đã có?</p>
      <div className={styles.chips}>
        {hits.map((hit) => (
          <button
            key={hit.id}
            type="button"
            aria-pressed={pickedId === hit.id}
            className={[styles.chip, pickedId === hit.id && styles.chipActive]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onPick(pickedId === hit.id ? undefined : hit.id)}
          >
            <HighlightedText text={hit.text} ranges={hit.ranges} />
          </button>
        ))}
      </div>
    </Card>
  );
}
