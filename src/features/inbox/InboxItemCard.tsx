import { useRef, useState } from 'react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import fieldStyles from '../../ui/field.module.css';
import { findConceptByExactText } from '../../db/queries';
import { ConceptSuggestions } from '../search/ConceptSuggestions';
import { resolveInboxExample } from '../quick-add/actions';
import { normalizeSelection, textForSelection, type Selection } from '../quick-add/highlight';
import type { Concept, Example, Lang } from '../../db/types';
import styles from './InboxPage.module.css';

interface InboxItemCardProps {
  example: Example;
  lang: Lang;
  onResolved: (exampleId: string, concept: Concept) => void;
}

export function InboxItemCard({ example, lang, onResolved }: InboxItemCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [matchedConcept, setMatchedConcept] = useState<Concept | undefined>(undefined);
  const [pickedConceptId, setPickedConceptId] = useState<string | undefined>(undefined);

  async function handlePickHighlight() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const normalized = normalizeSelection(example.text, {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });
    if (!normalized) return;

    setSelection(normalized);
    setPickedConceptId(undefined);
    const phrase = textForSelection(example.text, normalized);
    setMatchedConcept(await findConceptByExactText(example.dictionaryId, phrase));
  }

  async function handleSave() {
    if (!selection) return;
    const result = await resolveInboxExample(example, lang, selection, pickedConceptId);
    if (result) onResolved(example.id, result.concept);
  }

  return (
    <Card className={styles.card}>
      <textarea
        ref={textareaRef}
        className={fieldStyles.textarea}
        defaultValue={example.text}
        readOnly
        onSelect={() => setSelection(null)}
      />
      {selection && (
        <p className={fieldStyles.hint}>
          {pickedConceptId
            ? 'Sẽ gắn vào concept bạn đã chọn bên dưới.'
            : matchedConcept
              ? `Sẽ gắn vào concept đã có: "${matchedConcept.text}"`
              : `Sẽ tạo concept mới: "${textForSelection(example.text, selection)}"`}
        </p>
      )}
      {selection && (
        <ConceptSuggestions
          phrase={textForSelection(example.text, selection)}
          lang={lang}
          pickedId={pickedConceptId}
          onPick={setPickedConceptId}
        />
      )}
      <div className={styles.cardActions}>
        {!selection && (
          <Button variant="secondary" onClick={() => void handlePickHighlight()}>
            Tô sáng cụm đã chọn
          </Button>
        )}
        {selection && <Button onClick={() => void handleSave()}>Lưu</Button>}
      </div>
    </Card>
  );
}
