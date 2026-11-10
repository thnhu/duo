import { createId } from '../../core/id';
import { toStored } from '../../core/highlights';
import { createDefaultAttributes } from '../../db/defaults';
import { conceptRepository, exampleLinkRepository, exampleRepository } from '../../db/repositories';
import { findConceptByExactText } from '../../db/queries';
import { listLinksOfExample } from '../../depth';
import type { Concept, Example, ExampleAttributes, Lang } from '../../db/types';
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

export interface WordFromHighlight {
  word: Concept;
  // True when the word did not exist and was created now.
  created: boolean;
  // The copy of the example that belongs to the word (undefined = it already had it).
  example?: Example;
}

// "Also learn the highlighted phrase as a word" (PO 2026-11-10): the phrase of
// an example that belongs to a concept becomes, or is matched to, a Word, so the
// Học tab can drill it. The Word gets its own copy of the example (same sentence,
// phrase and labels) because the schedule and the drills work per example. The
// word joins the decks and lesson of the concept the example is about. Only a
// single-part phrase is turned into a word (a split one like fahren ... ab is not
// one string), and never the concept itself.
export async function createWordFromHighlight(example: Example, lang: Lang): Promise<WordFromHighlight | null> {
  if (!example.targetConceptId || !example.highlight || (example.highlightExtra?.length ?? 0) > 0) return null;
  const phrase = example.text.slice(example.highlight.start, example.highlight.end).trim();
  if (!phrase) return null;
  const owner = example.targetConceptId ? await conceptRepository.getById(example.targetConceptId) : undefined;

  let word = await findConceptByExactText(example.dictionaryId, phrase);
  if (word && word.id === owner?.id) return null;
  let created = false;
  if (!word) {
    const now = Date.now();
    word = {
      id: createId(),
      dictionaryId: example.dictionaryId,
      lang,
      text: phrase,
      kind: 'word',
      meanings: [],
      verification: 'unverified',
      source: { type: 'quick-add' },
      status: 'loaded',
      ...(owner?.setIds && owner.setIds.length > 0 ? { setIds: [...owner.setIds] } : {}),
      ...(owner?.lessonId ? { lessonId: owner.lessonId } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await conceptRepository.add(word);
    created = true;
  }

  // Not twice when the word already has this very sentence and phrase.
  const have = (await exampleRepository.listActive()).some(
    (e) =>
      e.targetConceptId === word!.id &&
      e.text === example.text &&
      e.highlight?.start === example.highlight!.start &&
      e.highlight?.end === example.highlight!.end,
  );
  if (have) return { word, created };

  const now = Date.now();
  const copy: Example = {
    id: createId(),
    dictionaryId: example.dictionaryId,
    text: example.text,
    targetConceptId: word.id,
    highlight: { ...example.highlight },
    attributes: { ...example.attributes },
    attributesStatus: example.attributesStatus,
    note: example.note,
    verification: 'unverified',
    createdAt: now,
    updatedAt: now,
  };
  await exampleRepository.add(copy);
  return { word, created, example: copy };
}
