import { GENERAL_SCOPE_DECK, conceptsInScope, isWholeKit, normalizeScope, scopeLabel, type ExportScope } from './scope';

// A backup of one scope (Bản 9, M16c): the concepts inside it and everything
// that belongs with them, so restoring the file puts each thing back where it
// was. Pure: it only picks rows out of the tables it is given.
//
// What goes in:
//  - the concepts in the scope, with all their examples;
//  - the passages of the scope (no passages for a lesson scope), their gap
//    examples, and the words of those gaps (a gap word outside the scope comes
//    along with just its gap examples, so the passage is whole again);
//  - links where both ends are in the file; schedules and logs of those examples;
//  - the decks and lessons they point at, and the dictionaries.
// What stays out: Settings (a partial restore must not overwrite the learning
// thresholds), import mappings and import batches.

type Row = Record<string, unknown>;
export type TableRows = Record<string, Row[]>;

export interface BackupScopeInfo {
  lang?: ExportScope['lang'];
  deck?: string;
  lessonId?: string;
  // Readable names, so a file says what it holds without the ids.
  deckName?: string;
  lessonName?: string;
  label: string;
  conceptCount: number;
}

export interface ScopedBackup {
  tables: TableRows;
  scope: BackupScopeInfo;
}

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export function buildScopedBackup(all: TableRows, scopeIn: ExportScope): ScopedBackup {
  const scope = normalizeScope(scopeIn);
  const rows = (name: string) => all[name] ?? [];
  const alive = (r: Row) => r.deletedAt === undefined;

  const liveDecks = rows('wordSets').filter(alive);
  const liveDeckIds = new Set(liveDecks.map((d) => d.id as string));
  const concepts = conceptsInScope(rows('concepts') as never, scope, liveDeckIds) as unknown as Row[];
  const conceptIds = new Set(concepts.map((c) => c.id as string));

  // Passages of the scope (a lesson is about words, not passages).
  const passages = scope.lessonId
    ? []
    : rows('passages').filter((p) => {
        if (!alive(p)) return false;
        if (scope.lang && p.lang !== scope.lang) return false;
        const setId = asString(p.setId);
        if (!scope.deck) return true;
        return scope.deck === GENERAL_SCOPE_DECK ? !setId || !liveDeckIds.has(setId) : setId === scope.deck;
      });
  const passageIds = new Set(passages.map((p) => p.id as string));
  const gapExamples = rows('examples').filter((e) => alive(e) && passageIds.has(asString(e.passageId) ?? ''));

  // Gap words outside the scope come along, with only their gap examples.
  const allConcepts = new Map(rows('concepts').filter(alive).map((c) => [c.id as string, c]));
  const extraConcepts: Row[] = [];
  for (const gap of gapExamples) {
    const id = asString(gap.targetConceptId);
    const concept = id ? allConcepts.get(id) : undefined;
    if (concept && !conceptIds.has(id!) && !extraConcepts.includes(concept)) extraConcepts.push(concept);
  }
  const fileConcepts = [...concepts, ...extraConcepts];
  const fileConceptIds = new Set(fileConcepts.map((c) => c.id as string));

  const examples = rows('examples').filter(
    (e) =>
      alive(e) &&
      (conceptIds.has(asString(e.targetConceptId) ?? '') || passageIds.has(asString(e.passageId) ?? '')),
  );
  const exampleIds = new Set(examples.map((e) => e.id as string));

  const exampleLinks = rows('exampleLinks').filter(
    (l) => alive(l) && exampleIds.has(asString(l.exampleId) ?? '') && fileConceptIds.has(asString(l.conceptId) ?? ''),
  );
  const conceptLinks = rows('conceptLinks').filter(
    (l) => alive(l) && fileConceptIds.has(asString(l.childId) ?? '') && fileConceptIds.has(asString(l.parentId) ?? ''),
  );
  const scheduleStates = rows('scheduleStates').filter((s) => exampleIds.has(asString(s.exampleId) ?? ''));
  const reviewLogs = rows('reviewLogs').filter((l) => exampleIds.has(asString(l.exampleId) ?? ''));

  // The decks and lessons the file points at.
  const deckIds = new Set<string>();
  for (const c of fileConcepts) for (const id of (c.setIds as string[] | undefined) ?? []) if (liveDeckIds.has(id)) deckIds.add(id);
  for (const p of passages) {
    const id = asString(p.setId);
    if (id && liveDeckIds.has(id)) deckIds.add(id);
  }
  if (scope.deck && scope.deck !== GENERAL_SCOPE_DECK && liveDeckIds.has(scope.deck)) deckIds.add(scope.deck);
  const lessonIds = new Set<string>();
  for (const c of fileConcepts) {
    const id = asString(c.lessonId);
    if (id) lessonIds.add(id);
  }
  const lessons = rows('lessons').filter((l) => alive(l) && lessonIds.has(l.id as string));

  const tables: TableRows = {
    dictionaries: rows('dictionaries'),
    concepts: fileConcepts,
    examples,
    exampleLinks,
    conceptLinks,
    wordSets: liveDecks.filter((d) => deckIds.has(d.id as string)),
    lessons,
    passages,
    choiceSets: rows('choiceSets').filter(
      (s) => alive(s) && passages.some((p) => asString(p.choiceSetId) === (s.id as string)),
    ),
    scheduleStates,
    reviewLogs,
    importMappings: [],
    importBatches: [],
    settings: [],
  };

  const deckName = scope.deck && scope.deck !== GENERAL_SCOPE_DECK ? asString(liveDecks.find((d) => d.id === scope.deck)?.name) : undefined;
  const lessonName = scope.lessonId ? asString(rows('lessons').find((l) => l.id === scope.lessonId)?.name) : undefined;
  const info: BackupScopeInfo = {
    ...scope,
    ...(deckName ? { deckName } : {}),
    ...(lessonName ? { lessonName } : {}),
    label: scopeLabel(scope, { deckName, lessonName }),
    conceptCount: concepts.length,
  };
  return { tables, scope: info };
}

export { isWholeKit };
