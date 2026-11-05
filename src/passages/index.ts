import { createId } from '../core/id';
import { createDefaultAttributes } from '../db/defaults';
import { findConceptByExactText } from '../db/queries';
import { conceptRepository, exampleRepository, passageRepository } from '../db/repositories';
import { db } from '../db/schema';
import type { Concept, Example, Lang, Passage } from '../db/types';
import { normalizeSelection, textForSelection, type Selection } from '../features/quick-add/highlight';
import { addConceptToSet } from '../wordsets';

// Passages (a text studied as a gap-fill). The PO pastes a short text and
// marks the words to learn; the drill hides them and asks for them back.
//
// Each gap is an Example: text = the whole passage, highlight = the gap,
// passageId = the passage, targetConceptId = the word it teaches. So the
// review schedule, the log and "acquired" keep working per example (spec
// rules 6-7); the passage only groups gaps and supplies the context.

export interface PassageInput {
  dictionaryId: string;
  lang: Lang;
  title?: string;
  text: string;
  // The words to hide, as selections on `text`. Overlaps are dropped.
  gaps: Selection[];
  // Deck the new words go into ('' or undefined = General).
  setId?: string;
}

export type PassageResult =
  | { ok: true; passage: Passage; gaps: number; createdWords: number }
  | { ok: false; reason: 'empty' | 'no-gaps' };

// A gap in the editor: a selection, plus the example that stores it once the
// passage has been saved (so editing keeps its schedule and history).
export type PassageGap = Selection & { exampleId?: string };

// Pure. Trims the selections, orders them and drops any that overlap.
export function cleanGaps<T extends Selection>(text: string, gaps: T[]): T[] {
  const normalized = gaps
    .map((g) => {
      const n = normalizeSelection(text, g);
      return n ? { ...g, start: n.start, end: n.end } : null;
    })
    .filter((g): g is T => g !== null)
    .sort((a, b) => a.start - b.start);
  const kept: T[] = [];
  for (const gap of normalized) {
    const last = kept[kept.length - 1];
    if (last && gap.start < last.end) continue;
    kept.push(gap);
  }
  return kept;
}

// Pure. The text changed from `oldText` to `newText` (one contiguous edit, as
// typing or pasting makes): keep every gap where it still belongs. Gaps before
// the edit stay, gaps after it shift, an edit inside a gap resizes it (fixing
// a typo in a gap word), and an edit that cuts across a gap's edge drops it.
export function remapGaps<T extends Selection>(oldText: string, newText: string, gaps: T[]): T[] {
  if (oldText === newText) return gaps;
  const max = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < max && oldText[prefix] === newText[prefix]) prefix++;
  let suffix = 0;
  while (suffix < max - prefix && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]) suffix++;
  const oldEnd = oldText.length - suffix;
  const delta = newText.length - suffix - oldEnd;
  const out: T[] = [];
  for (const g of gaps) {
    if (g.end <= prefix) out.push(g);
    else if (g.start >= oldEnd) out.push({ ...g, start: g.start + delta, end: g.end + delta });
    else if (g.start <= prefix && oldEnd <= g.end && g.end + delta > g.start) out.push({ ...g, end: g.end + delta });
  }
  return out;
}

// Trims the passage and moves the gaps with the trim (the editor keeps the
// raw text so positions stay exact while typing).
function prepare<T extends Selection>(rawText: string, rawGaps: T[]): { body: string; gaps: T[] } {
  const text = rawText.replace(/\s+$/u, '');
  const lead = text.length - text.trimStart().length;
  const body = text.trimStart();
  const shifted = rawGaps
    .map((g) => ({ ...g, start: g.start - lead, end: g.end - lead }))
    .filter((g) => g.start >= 0 && g.end <= body.length);
  return { body, gaps: cleanGaps(body, shifted) };
}

async function wordFor(dictionaryId: string, lang: Lang, text: string, setId?: string): Promise<{ concept: Concept; created: boolean }> {
  const existing = await findConceptByExactText(dictionaryId, text);
  if (existing) {
    if (setId) await addConceptToSet(existing.id, setId);
    return { concept: existing, created: false };
  }
  const now = Date.now();
  const concept: Concept = {
    id: createId(),
    dictionaryId,
    lang,
    text,
    meanings: [],
    kind: 'word',
    verification: 'unverified',
    source: { type: 'quick-add' },
    status: 'loaded',
    createdAt: now,
    updatedAt: now,
  };
  await conceptRepository.add(concept);
  // A word always keeps at least one example (spec C4): its own text.
  await exampleRepository.add(minimalExample(dictionaryId, concept));
  if (setId) await addConceptToSet(concept.id, setId);
  return { concept, created: true };
}

function minimalExample(dictionaryId: string, concept: Concept): Example {
  const now = Date.now();
  return {
    id: createId(),
    dictionaryId,
    text: concept.text,
    targetConceptId: concept.id,
    attributes: createDefaultAttributes(),
    attributesStatus: 'empty',
    verification: 'unverified',
    isMinimal: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createPassage(input: PassageInput): Promise<PassageResult> {
  const { body, gaps } = prepare(input.text, input.gaps);
  if (!body.trim()) return { ok: false, reason: 'empty' };
  if (gaps.length === 0) return { ok: false, reason: 'no-gaps' };

  const now = Date.now();
  const passage: Passage = {
    id: createId(),
    dictionaryId: input.dictionaryId,
    lang: input.lang,
    title: input.title?.trim() || undefined,
    text: body,
    updatedAt: now,
  };
  await passageRepository.add(passage);

  let createdWords = 0;
  for (const gap of gaps) {
    const { created } = await addGapExample(passage, gap, input.setId);
    if (created) createdWords++;
  }
  return { ok: true, passage, gaps: gaps.length, createdWords };
}

async function addGapExample(passage: Passage, gap: Selection, setId?: string): Promise<{ created: boolean }> {
  const now = Date.now();
  const word = textForSelection(passage.text, gap);
  const { concept, created } = await wordFor(passage.dictionaryId, passage.lang, word, setId);
  await exampleRepository.add({
    id: createId(),
    dictionaryId: passage.dictionaryId,
    text: passage.text,
    targetConceptId: concept.id,
    highlight: { start: gap.start, end: gap.end },
    passageId: passage.id,
    attributes: createDefaultAttributes(),
    attributesStatus: 'empty',
    verification: 'unverified',
    createdAt: now,
    updatedAt: now,
  });
  return { created };
}

export interface PassageEdit {
  title?: string;
  text: string;
  // The gaps as the editor has them; those with an `exampleId` are existing
  // gaps (kept, with their schedule and history), the rest are new.
  gaps: PassageGap[];
  setId?: string;
}

export type PassageUpdateResult =
  | { ok: true; kept: number; added: number; removed: number; createdWords: number }
  | { ok: false; reason: 'missing' | 'empty' | 'no-gaps' };

// Saves an edited passage. Kept gaps keep their example (and so their review
// schedule and log); removed gaps' examples are deleted; new gaps get a word
// and an example like a fresh passage.
export async function updatePassage(passageId: string, edit: PassageEdit): Promise<PassageUpdateResult> {
  const current = await passageRepository.getById(passageId);
  if (!current || current.deletedAt !== undefined) return { ok: false, reason: 'missing' };
  const { body, gaps } = prepare(edit.text, edit.gaps);
  if (!body.trim()) return { ok: false, reason: 'empty' };
  if (gaps.length === 0) return { ok: false, reason: 'no-gaps' };

  await passageRepository.update(passageId, { text: body, title: edit.title?.trim() || undefined });
  const passage: Passage = { ...current, text: body };

  const existing = await listGaps(passageId);
  const existingIds = new Set(existing.map((e) => e.id));
  const keptIds = new Set(gaps.filter((g) => g.exampleId && existingIds.has(g.exampleId)).map((g) => g.exampleId!));
  let removed = 0;
  for (const e of existing) {
    if (!keptIds.has(e.id)) {
      await exampleRepository.softDelete(e.id);
      removed++;
    }
  }
  let added = 0;
  let createdWords = 0;
  for (const gap of gaps) {
    if (gap.exampleId && keptIds.has(gap.exampleId)) {
      await exampleRepository.update(gap.exampleId, { text: body, highlight: { start: gap.start, end: gap.end } });
    } else {
      const { created } = await addGapExample(passage, gap, edit.setId);
      added++;
      if (created) createdWords++;
    }
  }
  return { ok: true, kept: keptIds.size, added, removed, createdWords };
}

// For the edit screen: the passage and its gaps as editor gaps.
export async function loadPassageForEdit(passageId: string): Promise<{ passage: Passage; gaps: PassageGap[] } | null> {
  const passage = await passageRepository.getById(passageId);
  if (!passage || passage.deletedAt !== undefined) return null;
  const gaps = (await listGaps(passageId))
    .filter((e) => e.highlight)
    .map((e) => ({ start: e.highlight!.start, end: e.highlight!.end, exampleId: e.id }));
  return { passage, gaps };
}

export async function listPassages(lang: Lang): Promise<Passage[]> {
  const all = await passageRepository.listActive();
  return all.filter((p) => p.lang === lang).sort((a, b) => b.updatedAt - a.updatedAt);
}

// The gap examples of one passage, in reading order.
export async function listGaps(passageId: string): Promise<Example[]> {
  const rows = await db.examples.toArray();
  return rows
    .filter((e) => e.passageId === passageId && e.deletedAt === undefined)
    .sort((a, b) => (a.highlight?.start ?? 0) - (b.highlight?.start ?? 0));
}

// Deleting a passage removes its gaps; the words stay in the library.
export async function deletePassage(passageId: string): Promise<number> {
  const gaps = await listGaps(passageId);
  for (const gap of gaps) await exampleRepository.softDelete(gap.id);
  await passageRepository.softDelete(passageId);
  return gaps.length;
}

// Pure. Gap examples of one passage out of a bigger list, in reading order.
export function gapsIn(passageId: string, examples: Example[]): Example[] {
  return examples
    .filter((e) => e.passageId === passageId && e.highlight && e.deletedAt === undefined)
    .sort((a, b) => a.highlight!.start - b.highlight!.start);
}
