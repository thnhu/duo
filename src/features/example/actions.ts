import { createId } from '../../core/id';
import { createDefaultAttributes } from '../../db/defaults';
import { exampleRepository } from '../../db/repositories';
import type { Example, ExampleAttributes } from '../../db/types';
import { normalizeSelection, type Selection } from '../quick-add/highlight';

export interface ExampleEdits {
  // Re-highlight: the new phrase inside the same sentence. Undefined = keep.
  highlight?: Selection;
  attributes: ExampleAttributes;
  note: string;
}

// Saving labels by hand is the PO accepting them, so they become `verified`
// (spec 6.6). `suggestedAttributes` (M10b) is left alone.
export async function saveExampleEdits(
  example: Example,
  edits: ExampleEdits,
): Promise<Example | null> {
  const patch: Partial<Example> = {
    attributes: edits.attributes,
    attributesStatus: 'verified',
    // The PO has now decided; a pending AI suggestion is obsolete.
    suggestedAttributes: undefined,
    note: edits.note.trim() || undefined,
  };
  if (edits.highlight) {
    const normalized = normalizeSelection(example.text, edits.highlight);
    if (!normalized) return null;
    patch.highlight = normalized;
  }
  await exampleRepository.update(example.id, patch);
  return (await exampleRepository.getById(example.id)) ?? null;
}

// Back to "no labels yet": defaults, status `empty`, so nothing graded uses it.
export async function clearExampleAttributes(exampleId: string): Promise<void> {
  await exampleRepository.update(exampleId, {
    attributes: createDefaultAttributes(),
    attributesStatus: 'empty',
  });
}

// J10 step 7: same sentence, a different phrase to learn. The copy has no
// highlight, so it lands in the inbox (no schedule until highlighted). TMRND
// labels are not copied: nuance/register can differ per phrase.
export async function addSecondPhrase(example: Example): Promise<Example> {
  const now = Date.now();
  const copy: Example = {
    id: createId(),
    dictionaryId: example.dictionaryId,
    text: example.text,
    attributes: createDefaultAttributes(),
    attributesStatus: 'empty',
    verification: 'unverified',
    createdAt: now,
    updatedAt: now,
  };
  await exampleRepository.add(copy);
  return copy;
}
