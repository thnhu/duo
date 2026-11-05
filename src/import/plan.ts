import type { Concept, ConceptGrammar, Lang } from '../db/types';
import type { ExampleDraft, ImportRow } from './build';

// What to do with a word that already exists in the library (spec A1c).
export type DuplicateAction = 'skip' | 'merge' | 'update';

// One word to import. Rows of the file that share the same text are folded
// into a single group (spec 6.4: "mỗi dòng = một concept kèm tối đa một
// example, thêm dòng cùng text để gắn thêm example").
export interface ImportGroup {
  key: string;
  lang: Lang;
  text: string;
  pos?: string;
  meanings: string[];
  lesson?: string;
  // Word set names from the file's `set` column (merged over the rows).
  setNames: string[];
  grammar?: ConceptGrammar;
  examples: ExampleDraft[];
  rowNumbers: number[];
  // Library concept this word duplicates, if any.
  existing?: Concept;
  // Whether the word goes into the import. Words already `acquired` start
  // unchecked (spec A6).
  included: boolean;
  hiddenAsAcquired: boolean;
}

function samePos(a?: string, b?: string): boolean {
  return !a || !b || a.toLowerCase() === b.toLowerCase();
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function mergeGrammar(a?: ConceptGrammar, b?: ConceptGrammar): ConceptGrammar | undefined {
  if (!a && !b) return undefined;
  return {
    ...a,
    ...Object.fromEntries(Object.entries(b ?? {}).filter(([k]) => (a as Record<string, unknown> | undefined)?.[k] === undefined)),
  } as ConceptGrammar;
}

export function planGroups(rows: ImportRow[], existingConcepts: Concept[]): ImportGroup[] {
  const groups: ImportGroup[] = [];

  for (const row of rows) {
    let group = groups.find(
      (g) => g.lang === row.lang && sameText(g.text, row.text) && samePos(g.pos, row.pos),
    );
    if (!group) {
      group = {
        key: `${row.lang}|${row.text.toLowerCase()}|${row.pos?.toLowerCase() ?? ''}|${groups.length}`,
        lang: row.lang,
        text: row.text,
        pos: row.pos,
        meanings: [],
        setNames: [],
        examples: [],
        rowNumbers: [],
        included: true,
        hiddenAsAcquired: false,
      };
      groups.push(group);
    }
    group.rowNumbers.push(row.rowNumber);
    group.pos ??= row.pos;
    group.lesson ??= row.lesson;
    for (const name of row.setNames) {
      if (!group.setNames.some((n) => sameText(n, name))) group.setNames.push(name);
    }
    for (const meaning of row.meanings) {
      if (!group.meanings.some((m) => sameText(m, meaning))) group.meanings.push(meaning);
    }
    group.grammar = mergeGrammar(group.grammar, row.grammar);
    if (!group.examples.some((e) => sameText(e.text, row.example.text))) {
      group.examples.push(row.example);
    }
  }

  for (const group of groups) {
    // A real sentence makes the bare "minimal" example redundant.
    if (group.examples.some((e) => !e.isMinimal)) {
      group.examples = group.examples.filter((e) => !e.isMinimal);
    }
    const candidates = existingConcepts.filter(
      (c) => c.lang === group.lang && sameText(c.text, group.text) && samePos(c.pos, group.pos),
    );
    group.existing =
      candidates.find((c) => c.pos && group.pos && sameText(c.pos, group.pos)) ?? candidates[0];
    if (group.existing?.status === 'acquired') {
      group.hiddenAsAcquired = true;
      group.included = false;
    }
  }

  return groups;
}
