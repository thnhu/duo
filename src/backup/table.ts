import { highlightParts, phraseForFile } from '../core/highlights';
import { importFields, MEANING_SEPARATOR, type ImportFieldId } from '../import/fields';
import { conceptKind } from '../wordsets';
import type { Concept, ConceptLink, Example, Lesson, WordSet } from '../db/types';

// xlsx export (spec E3): the columns are exactly the import columns
// (importFields, the same list the template uses), so an exported file can
// be imported again. One row per concept + example; a concept without a real
// sentence gets one row with an empty `example`.
//
// This is a readable archive, not a full backup: inbox sentences with no
// concept and details that have no import column (dictionary-lookup data,
// schedules, review history) are only in the JSON backup.

// Deck ids with `first` (when it is one of them) moved to the front.
function orderedDecks(ids: string[], first: string | undefined): string[] {
  return first && ids.includes(first) ? [first, ...ids.filter((id) => id !== first)] : ids;
}

export function exportTable(
  concepts: Concept[],
  examples: Example[],
  sets: WordSet[] = [],
  lessons: Lesson[] = [],
  links: ConceptLink[] = [],
  // Every concept (parents may sit outside the exported scope); defaults to `concepts`.
  allConcepts: Concept[] = concepts,
): string[][] {
  const nameOf = new Map(allConcepts.filter((c) => c.deletedAt === undefined).map((c) => [c.id, c.text]));
  // child id -> its parent links, by parent name (links to a deleted concept are left out).
  const parentsOf = new Map<string, Array<{ name: string; type: string }>>();
  for (const link of links) {
    const name = nameOf.get(link.parentId);
    if (link.deletedAt !== undefined || !name) continue;
    const list = parentsOf.get(link.childId) ?? [];
    list.push({ name, type: link.type });
    parentsOf.set(link.childId, list);
  }
  const liveLessons = lessons.filter((l) => l.deletedAt === undefined);
  const lessonName = new Map(liveLessons.map((l) => [l.id, l.name]));
  const lessonDeck = new Map(liveLessons.map((l) => [l.id, l.setId]));
  const setName = new Map(sets.filter((s) => s.deletedAt === undefined).map((s) => [s.id, s.name]));
  const header = importFields.map((f) => f.id as string);
  const byConcept = new Map<string, Example[]>();
  for (const example of examples) {
    if (example.deletedAt !== undefined || !example.targetConceptId) continue;
    const list = byConcept.get(example.targetConceptId) ?? [];
    list.push(example);
    byConcept.set(example.targetConceptId, list);
  }

  const rows: string[][] = [];
  const live = concepts
    .filter((c) => c.deletedAt === undefined)
    .sort((a, b) => a.lang.localeCompare(b.lang) || a.text.localeCompare(b.text));
  for (const concept of live) {
    const real = (byConcept.get(concept.id) ?? []).filter((e) => !e.isMinimal);
    const sources: Array<Example | undefined> = real.length > 0 ? real : [undefined];
    for (const example of sources) {
      const cells: Partial<Record<ImportFieldId, string>> = {
        text: concept.text,
        lang: concept.lang,
        kind: conceptKind(concept) === 'concept' ? 'concept' : '',
        pos: concept.pos,
        meaning: concept.meanings.join(`${MEANING_SEPARATOR} `),
        // The lesson as it is now; the file's old text only when the word has none.
        lesson: (concept.lessonId ? lessonName.get(concept.lessonId) : undefined) ?? concept.source.lesson,
        // Decks by name, in the same `a; b` form the import reads.
        // The deck of the word's lesson goes first: the import puts the lesson in
        // the first deck, so the file puts it back where it was.
        deck: orderedDecks(concept.setIds ?? [], concept.lessonId ? lessonDeck.get(concept.lessonId) : undefined)
          .map((id) => setName.get(id))
          .filter((n): n is string => !!n)
          .join(`${MEANING_SEPARATOR} `),
        // Parent concepts and the relation to each, in the same `a; b` form the import reads.
        parent: (parentsOf.get(concept.id) ?? []).map((p) => p.name).join(`${MEANING_SEPARATOR} `),
        relation: (parentsOf.get(concept.id) ?? []).map((p) => p.type).join(`${MEANING_SEPARATOR} `),
        gender: concept.grammar?.gender,
        plural: concept.grammar?.plural,
        infinitiv: concept.grammar?.verbForms?.infinitiv,
        praesens3sg: concept.grammar?.verbForms?.praesens3sg,
        praeteritum: concept.grammar?.verbForms?.praeteritum,
        partizip2: concept.grammar?.verbForms?.partizip2,
      };
      if (example) {
        cells.example = example.text;
        const parts = highlightParts(example);
        if (parts.length > 0) {
          const phrase = phraseForFile(example.text, parts);
          // Only needed when the sentence uses another form (swallowed/swallow),
          // and always for a split phrase ("fahren … ab").
          if (phrase !== concept.text) cells.highlight = phrase;
        }
        // Labels only count once PO accepted them (verified); suggestions
        // stay out of the file.
        if (example.attributesStatus === 'verified') {
          cells.tone = example.attributes.tone;
          cells.mode = example.attributes.mode;
          cells.register = example.attributes.register;
          cells.nuance = example.attributes.nuance;
          cells.dialect = example.attributes.dialect;
        }
        cells.note = example.note;
      }
      rows.push(header.map((id) => cells[id as ImportFieldId] ?? ''));
    }
  }
  return [header, ...rows];
}

export async function exportXlsx(
  concepts: Concept[],
  examples: Example[],
  sets: WordSet[] = [],
  lessons: Lesson[] = [],
  links: ConceptLink[] = [],
  allConcepts: Concept[] = concepts,
): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/universal');
  const data = exportTable(concepts, examples, sets, lessons, links, allConcepts).map((row) => row.map((value) => ({ value })));
  return writeXlsxFile(data).toBlob();
}
