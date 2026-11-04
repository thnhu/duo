import { createId } from '../core/id';
import { createDefaultAttributes } from '../db/defaults';
import { db } from '../db/schema';
import type { ConceptGrammar, Example, LookupExample } from '../db/types';

// What PO picked in the review screen (spec J3 step 3-4). Everything here
// may have been edited by PO before pressing "duyệt".
export interface ReviewSelection {
  pos?: string;
  meanings: string[];
  grammar?: ConceptGrammar;
  examples: LookupExample[];
}

function lower(s: string): string {
  return s.trim().toLowerCase();
}

function findHighlight(sentence: string, word: string): { start: number; end: number } | undefined {
  const s = sentence.toLowerCase();
  const w = word.toLowerCase();
  if (s.length !== sentence.length || w.length !== word.length) return undefined;
  const start = s.indexOf(w);
  return start === -1 ? undefined : { start, end: start + w.length };
}

function mergeGrammar(existing: ConceptGrammar | undefined, picked: ConceptGrammar | undefined) {
  if (!picked) return existing;
  const merged: ConceptGrammar = { ...existing, ...stripEmpty(picked) };
  const forms = { ...existing?.verbForms, ...stripEmpty(picked.verbForms) };
  if (Object.keys(forms).length > 0) merged.verbForms = forms;
  else delete merged.verbForms;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function stripEmpty<T extends object>(value: T | undefined): Partial<T> {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, v]) => v !== undefined && v !== '' && typeof v !== 'object'),
  ) as Partial<T>;
}

// Moves the reviewed data into the concept, marks it `verified` and drops
// the pending suggestion. Chosen example sentences become Examples; ones
// where the word can't be located go to the Hộp chờ duyệt for highlighting.
export async function applyReview(
  conceptId: string,
  selection: ReviewSelection,
): Promise<{ examplesAdded: number; inboxExamples: number }> {
  const result = { examplesAdded: 0, inboxExamples: 0 };

  await db.transaction('rw', [db.concepts, db.examples], async () => {
    const concept = await db.concepts.get(conceptId);
    if (!concept || concept.deletedAt !== undefined) return;
    const now = Date.now();

    const meanings = [...concept.meanings];
    for (const m of selection.meanings.map((x) => x.trim()).filter(Boolean)) {
      if (!meanings.some((x) => lower(x) === lower(m))) meanings.push(m);
    }

    await db.concepts.update(conceptId, {
      pos: selection.pos?.trim() || concept.pos,
      meanings,
      grammar: mergeGrammar(concept.grammar, selection.grammar),
      verification: 'verified',
      lookup: undefined,
      updatedAt: now,
    });

    const active = (await db.examples.toArray()).filter((e) => e.deletedAt === undefined);
    const known = new Set(
      active
        .filter((e) => e.targetConceptId === conceptId || e.targetConceptId === undefined)
        .map((e) => lower(e.text)),
    );

    const added: Example[] = [];
    for (const picked of selection.examples) {
      const text = picked.text.trim();
      if (!text || known.has(lower(text))) continue;
      known.add(lower(text));
      const highlight = findHighlight(text, concept.text);
      added.push({
        id: createId(),
        dictionaryId: concept.dictionaryId,
        text,
        targetConceptId: highlight ? conceptId : undefined,
        highlight,
        attributes: createDefaultAttributes(),
        attributesStatus: 'empty',
        note: picked.translation,
        verification: 'verified',
        createdAt: now,
        updatedAt: now,
      });
      if (highlight) result.examplesAdded++;
      else result.inboxExamples++;
    }
    if (added.length > 0) await db.examples.bulkAdd(added);
  });

  return result;
}

// PO decided the suggestion is useless: keep the concept as it was.
export async function dismissSuggestion(conceptId: string): Promise<void> {
  await db.concepts.update(conceptId, { lookup: undefined, updatedAt: Date.now() });
}

// Marks a concept as reviewed without any lookup (PO checked it by hand).
export async function markVerified(conceptId: string): Promise<void> {
  await db.concepts.update(conceptId, { verification: 'verified', updatedAt: Date.now() });
}
