import { useRef, useState } from 'react';
import { Card } from '../../ui/Card';
import { useToast } from '../../ui/Toast';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { LinkButton } from '../../ui/LinkButton';
import fieldStyles from '../../ui/field.module.css';
import { findConceptByExactText } from '../../db/queries';
import { InlineConfirm } from '../../ui/InlineConfirm';
import { exampleRepository } from '../../db/repositories';
import { deleteExample, restoreDeleted } from '../library/actions';
import { ConceptSuggestions } from '../search/ConceptSuggestions';
import { resolveInboxExample } from '../quick-add/actions';
import { normalizeSelection, textForSelection, type Selection } from '../quick-add/highlight';
import type { Concept, Example, Lang } from '../../db/types';
import styles from './InboxPage.module.css';

interface InboxItemCardProps {
  example: Example;
  lang: Lang;
  onResolved: (exampleId: string, concept: Concept) => void;
  // The example was deleted (true) or brought back by Undo (false).
  onRemoved?: (exampleId: string, removed: boolean) => void;
}

export function InboxItemCard({ example, lang, onResolved, onRemoved }: InboxItemCardProps) {
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [matchedConcept, setMatchedConcept] = useState<Concept | undefined>(undefined);
  const [pickedConceptId, setPickedConceptId] = useState<string | undefined>(undefined);
  // The sentence can be corrected here; nothing is highlighted yet in the inbox,
  // so changing the text cannot shift a stored highlight.
  const [text, setText] = useState(example.text);
  const [savedText, setSavedText] = useState(example.text);
  const [confirming, setConfirming] = useState(false);
  const edited = text !== savedText;

  async function handlePickHighlight() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const normalized = normalizeSelection(text, {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });
    if (!normalized) return;

    setSelection(normalized);
    setPickedConceptId(undefined);
    const phrase = textForSelection(text, normalized);
    setMatchedConcept(await findConceptByExactText(example.dictionaryId, phrase));
  }

  // Writes the corrected sentence. A new text invalidates any phrase picked on the old one.
  async function saveText(): Promise<boolean> {
    // Saved as typed: a highlight picked on this text is measured on it.
    const next = text;
    if (!next.trim()) {
      toast.show('Câu không được để trống.', { kind: 'error' });
      return false;
    }
    if (next === savedText) return true;
    await exampleRepository.update(example.id, { text: next });
    setSavedText(next);
    return true;
  }

  async function handleSaveText() {
    if (await saveText()) {
      setSelection(null);
      setMatchedConcept(undefined);
      setPickedConceptId(undefined);
      toast.show('Đã lưu câu.');
    }
  }

  async function handleDelete() {
    setConfirming(false);
    const deleted = await deleteExample(example.id);
    onRemoved?.(example.id, true);
    toast.show('Đã xóa câu.', {
      action: {
        label: 'Hoàn tác',
        onClick: async () => {
          await restoreDeleted(deleted);
          onRemoved?.(example.id, false);
        },
      },
    });
  }

  async function handleSave() {
    if (!selection) return;
    if (!(await saveText())) return;
    const result = await resolveInboxExample({ ...example, text }, lang, selection, pickedConceptId);
    if (result) {
      toast.show(`Đã tô sáng và gắn vào "${result.concept.text}".`);
      onResolved(example.id, result.concept);
    }
  }

  return (
    <Card className={styles.card}>
      <textarea
        ref={textareaRef}
        className={fieldStyles.textarea}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSelection(null);
          setMatchedConcept(undefined);
          setPickedConceptId(undefined);
        }}
        onSelect={() => setSelection(null)}
        aria-label="Câu"
      />
      {selection && (
        <p className={fieldStyles.hint}>
          {pickedConceptId
            ? 'Sẽ gắn vào concept bạn đã chọn bên dưới.'
            : matchedConcept
              ? `Sẽ gắn vào concept đã có: "${matchedConcept.text}"`
              : `Sẽ tạo concept mới: "${textForSelection(text, selection)}"`}
        </p>
      )}
      {selection && (
        <ConceptSuggestions
          phrase={textForSelection(text, selection)}
          lang={lang}
          pickedId={pickedConceptId}
          onPick={setPickedConceptId}
        />
      )}
      <ButtonRow>
        {edited && (
          <Button variant="secondary" onClick={() => void handleSaveText()}>
            Lưu câu đã sửa
          </Button>
        )}
        {!selection && (
          <Button variant="secondary" onMouseDown={(e) => e.preventDefault()} onClick={() => void handlePickHighlight()}>
            Tô sáng cụm đã chọn
          </Button>
        )}
        {selection && <Button onClick={() => void handleSave()}>Lưu</Button>}
        <LinkButton to={`/example/${example.id}`}>Sửa / gắn nhãn</LinkButton>
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Xóa
        </Button>
      </ButtonRow>
      {confirming && (
        <InlineConfirm confirmLabel="Xóa câu" onConfirm={() => void handleDelete()} onCancel={() => setConfirming(false)}>
          Xóa câu này khỏi Hộp chờ duyệt? Bạn có thể hoàn tác ngay sau đó.
        </InlineConfirm>
      )}
    </Card>
  );
}
