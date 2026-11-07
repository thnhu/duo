import { createId } from '../../core/id';
import { toStored } from '../../core/highlights';
import { createDefaultAttributes } from '../../db/defaults';
import { exampleLinkRepository, exampleRepository } from '../../db/repositories';
import { listLinksOfExample } from '../../depth';
import type { Example, ExampleAttributes } from '../../db/types';
import { normalizeSelection, type Selection } from '../quick-add/highlight';

export interface ExampleEdits {
  // Re-highlight: the new phrase inside the same sentence. Undefined = keep.
  highlight?: Selection;
  // Further parts of a split phrase (separable verb); only read with `highlight`.
  highlightExtra?: Selection[];
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
    const extras = (edits.highlightExtra ?? [])
      .map((s) => normalizeSelection(example.text, s))
      .filter((s): s is Selection => s !== null);
    Object.assign(patch, toStored([normalized, ...extras].sort((a, b) => a.start - b.start)));
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

// "Save & next" (R5): a new example for the same main concept. With `keep`
// ("Re-use parameters") it also copies the extra links and the TMRND labels,
// so a batch of examples of one kind needs only the sentence. Labels copied
// this way were chosen by the PO a moment ago, so they stay `verified`; a
// source without verified labels gives an unlabelled copy.
export async function createNextExample(source: Example, text: string, keep: boolean): Promise<Example> {
  const now = Date.now();
  const labelled = keep && source.attributesStatus === 'verified';
  const next: Example = {
    id: createId(),
    dictionaryId: source.dictionaryId,
    text: text.trim(),
    targetConceptId: source.targetConceptId,
    attributes: labelled ? { ...source.attributes } : createDefaultAttributes(),
    attributesStatus: labelled ? 'verified' : 'empty',
    verification: 'unverified',
    createdAt: now,
    updatedAt: now,
  };
  await exampleRepository.add(next);
  if (keep) {
    for (const link of await listLinksOfExample(source.id)) {
      await exampleLinkRepository.add({
        id: createId(),
        exampleId: next.id,
        conceptId: link.conceptId,
        type: link.type,
        updatedAt: now,
      });
    }
  }
  return next;
}

// "Add example" and the examples under "Add concept": one new example. The
// highlighted phrase (optional) is what gets studied; `conceptId` is the
// concept the example is about (its main concept). With no concept it waits in
// the inbox. TMRND labels count as chosen (`verified`) only when the PO touched
// them, so untouched defaults never become answers (spec 6.6).
export interface NewExampleInput {
  dictionaryId: string;
  text: string;
  highlight?: Selection | null;
  // Further parts of a split phrase (separable verb).
  highlightExtra?: Selection[];
  attributes?: ExampleAttributes;
  labelsChosen?: boolean;
  note?: string;
  conceptId?: string;
}

export async function createExample(input: NewExampleInput): Promise<Example | null> {
  const text = input.text.trim();
  if (!text) return null;
  // The selection was made on the untrimmed text, so normalise against that.
  const highlight = input.highlight ? normalizeSelection(input.text, input.highlight) : null;
  const shift = input.text.length - input.text.trimStart().length;
  const inside = (s: Selection) => s.start - shift >= 0 && s.end - shift <= text.length;
  const moved = (s: Selection) => ({ start: s.start - shift, end: s.end - shift });
  const extras = (input.highlightExtra ?? [])
    .map((s) => normalizeSelection(input.text, s))
    .filter((s): s is Selection => s !== null && inside(s))
    .map(moved);
  const now = Date.now();
  const labelled = input.labelsChosen === true && input.attributes !== undefined;
  const example: Example = {
    id: createId(),
    dictionaryId: input.dictionaryId,
    text,
    targetConceptId: input.conceptId,
    ...(highlight && inside(highlight)
      ? toStored([moved(highlight), ...extras].sort((a, b) => a.start - b.start))
      : {}),
    attributes: labelled ? { ...input.attributes! } : createDefaultAttributes(),
    attributesStatus: labelled ? 'verified' : 'empty',
    note: input.note?.trim() || undefined,
    verification: 'unverified',
    createdAt: now,
    updatedAt: now,
  };
  await exampleRepository.add(example);
  return example;
}
