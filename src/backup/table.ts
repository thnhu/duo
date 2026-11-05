import { importFields, MEANING_SEPARATOR, type ImportFieldId } from '../import/fields';
import type { Concept, Example, WordSet } from '../db/types';

// xlsx export (spec E3): the columns are exactly the import columns
// (importFields, the same list the template uses), so an exported file can
// be imported again. One row per concept + example; a concept without a real
// sentence gets one row with an empty `example`.
//
// This is a readable archive, not a full backup: inbox sentences with no
// concept and details that have no import column (dictionary-lookup data,
// schedules, review history) are only in the JSON backup.

export function exportTable(concepts: Concept[], examples: Example[], sets: WordSet[] = []): string[][] {
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
        pos: concept.pos,
        meaning: concept.meanings.join(`${MEANING_SEPARATOR} `),
        lesson: concept.source.lesson,
        // Word sets by name, in the same `a; b` form the import reads.
        set: (concept.setIds ?? [])
          .map((id) => setName.get(id))
          .filter((n): n is string => !!n)
          .join(`${MEANING_SEPARATOR} `),
        gender: concept.grammar?.gender,
        plural: concept.grammar?.plural,
        infinitiv: concept.grammar?.verbForms?.infinitiv,
        praeteritum: concept.grammar?.verbForms?.praeteritum,
        partizip2: concept.grammar?.verbForms?.partizip2,
      };
      if (example) {
        cells.example = example.text;
        if (example.highlight) {
          const phrase = example.text.slice(example.highlight.start, example.highlight.end);
          // Only needed when the sentence uses another form (swallowed/swallow).
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

export async function exportXlsx(concepts: Concept[], examples: Example[], sets: WordSet[] = []): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/universal');
  const data = exportTable(concepts, examples, sets).map((row) => row.map((value) => ({ value })));
  return writeXlsxFile(data).toBlob();
}
