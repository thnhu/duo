import { createId } from '../core/id';
import { createDefaultAttributes } from '../db/defaults';
import { dictionaryIdForLang } from '../db/queries';
import { db } from '../db/schema';
import type { Concept, ConceptGrammar, Example, ImportBatch, Lang, StudyMode } from '../db/types';
import { conceptRepository, wordSetRepository } from '../db/repositories';
import { LINK_FAILURE_TEXT, linkConcepts } from '../links';
import { createConceptWithDescription } from '../features/quick-add/actions';
import { createWordFromHighlight } from '../features/example/actions';
import { ensureLesson } from '../lessons';
import { createWordSet, listWordSets } from '../wordsets';
import type { ExampleDraft } from './build';
import type { DuplicateAction, ImportGroup } from './plan';

export interface CommitOptions {
  fileName: string;
  mode: StudyMode;
  duplicateAction: DuplicateAction;
  // Put every imported word of the set's language in this existing set.
  targetSetId?: string;
  // Or put every imported word in a set of this name (found by name or
  // created, one per language). Both are added to any sets named in the
  // file's `set` column.
  targetSetName?: string;
}

export interface CommitResult {
  batchId?: string;
  createdConcepts: number;
  mergedConcepts: number;
  updatedConcepts: number;
  skippedDuplicates: number;
  examplesAdded: number;
  // Sentences that went to the Hộp chờ duyệt for highlighting later.
  inboxExamples: number;
  // Existing words that gained a word set label.
  addedToSets: number;
  // Lessons the file made, and words put in a lesson (new or existing).
  lessonsCreated: number;
  lessonsAssigned: number;
  // Parent links (file columns `parent` + `relation`): made, changed in type,
  // blank parent concepts created for names not in the library, and the ones
  // that could not be made (with the reason, in words).
  linksCreated: number;
  linksChanged: number;
  parentsCreated: number;
  linkProblems: string[];
  // Words made from the highlighted phrases of a concept's examples.
  wordsCreated: number;
}

function lower(s: string): string {
  return s.trim().toLowerCase();
}

function toExample(
  dictionaryId: string,
  conceptText: string,
  draft: ExampleDraft,
  conceptId: string | undefined,
  now: number,
): Example {
  return {
    id: createId(),
    dictionaryId,
    text: draft.isMinimal ? conceptText : draft.text,
    targetConceptId: conceptId,
    highlight: conceptId ? draft.highlight : undefined,
    highlightExtra: conceptId ? draft.highlightExtra : undefined,
    attributes: { ...createDefaultAttributes(), ...draft.attributes },
    // The PO wrote these labels into their own file: treated as their own
    // decision. Content stays `unverified` until reviewed (principle 8).
    attributesStatus: draft.attributes ? 'verified' : 'empty',
    note: draft.note,
    verification: 'unverified',
    isMinimal: draft.isMinimal ? true : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

// Writes the whole import in one transaction, so a failure leaves the
// library untouched. Idempotent: importing the same file again finds the
// existing words/examples and adds nothing (spec M3 "Xong khi").
export async function commitImport(
  groups: ImportGroup[],
  options: CommitOptions,
): Promise<CommitResult> {
  const result: CommitResult = {
    createdConcepts: 0,
    mergedConcepts: 0,
    updatedConcepts: 0,
    skippedDuplicates: 0,
    examplesAdded: 0,
    inboxExamples: 0,
    addedToSets: 0,
    lessonsCreated: 0,
    lessonsAssigned: 0,
    linksCreated: 0,
    linksChanged: 0,
    parentsCreated: 0,
    linkProblems: [],
    wordsCreated: 0,
  };
  // Examples of `concept` rows whose highlighted phrase also becomes a Word (below).
  const wordSources: Array<{ example: Example; lang: Lang; meaning?: string }> = [];
  // The library concept each imported word ended up as (new or existing).
  const conceptIdOf = new Map<ImportGroup, string>();

  const selected = groups.filter((g) => g.included);
  const dictionaryIds = new Map<Lang, string>();
  for (const group of selected) {
    if (!dictionaryIds.has(group.lang)) {
      dictionaryIds.set(group.lang, await dictionaryIdForLang(group.lang));
    }
  }

  // Word sets named in the file or chosen as target: found by name (ignoring
  // case) or created, once per language, before the single write below.
  const targetSet = options.targetSetId ? await wordSetRepository.getById(options.targetSetId) : undefined;
  const pickedSet = targetSet && targetSet.deletedAt === undefined ? targetSet : undefined;
  const setIds = new Map<string, string>(); // `${lang}|${lowercased name}` -> set id
  const setKey = (lang: Lang, name: string) => `${lang}|${lower(name)}`;
  for (const group of selected) {
    const names = [...group.setNames, ...(options.targetSetName?.trim() ? [options.targetSetName.trim()] : [])];
    for (const name of names) {
      const key = setKey(group.lang, name);
      if (setIds.has(key)) continue;
      const found = (await listWordSets(group.lang)).find((s) => lower(s.name) === lower(name));
      if (found) setIds.set(key, found.id);
      else {
        const created = await createWordSet(group.lang, name);
        if (created.ok) setIds.set(key, created.set.id);
      }
    }
  }
  const groupSetIds = (group: ImportGroup): string[] => {
    const names = [...group.setNames, ...(options.targetSetName?.trim() ? [options.targetSetName.trim()] : [])];
    const ids = names.map((n) => setIds.get(setKey(group.lang, n))).filter((id): id is string => !!id);
    // The chosen existing set only takes words of its own language.
    if (pickedSet && pickedSet.lang === group.lang) ids.push(pickedSet.id);
    return [...new Set(ids)];
  };

  // Lessons named in the file (`lesson` column): the lesson of that name in the
  // word's first deck (General when it has none), found or made, in file order.
  // A word picks no lesson when it is skipped as a duplicate.
  const liveDecks = new Set((await wordSetRepository.listActive()).map((s) => s.id));
  const lessonOf = new Map<ImportGroup, string>();
  const createdLessonIds: string[] = [];
  for (const group of selected) {
    const name = group.lesson?.trim();
    if (!name) continue;
    if (group.existing && options.duplicateAction === 'skip') continue;
    const decks = [...(group.existing?.setIds ?? []), ...groupSetIds(group)].filter((id) => liveDecks.has(id));
    const ensured = await ensureLesson(group.lang, decks[0], name);
    if (!ensured) continue;
    lessonOf.set(group, ensured.lesson.id);
    if (ensured.created) createdLessonIds.push(ensured.lesson.id);
  }
  result.lessonsCreated = createdLessonIds.length;

  const batch: ImportBatch = {
    id: createId(),
    fileName: options.fileName,
    createdConceptIds: [],
    createdExampleIds: [],
    createdLessonIds,
    updatedConcepts: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.transaction('rw', [db.concepts, db.examples, db.importBatches], async () => {
    const now = Date.now();
    const activeExamples = (await db.examples.toArray()).filter((e) => e.deletedAt === undefined);
    // Texts already present per concept, and in the inbox per dictionary.
    const textsByConcept = new Map<string, Set<string>>();
    const inboxTexts = new Map<string, Set<string>>();
    for (const e of activeExamples) {
      const bucket = e.targetConceptId
        ? textsByConcept.get(e.targetConceptId) ?? textsByConcept.set(e.targetConceptId, new Set()).get(e.targetConceptId)!
        : inboxTexts.get(e.dictionaryId) ?? inboxTexts.set(e.dictionaryId, new Set()).get(e.dictionaryId)!;
      bucket.add(lower(e.text));
    }

    for (const group of selected) {
      const dictionaryId = dictionaryIds.get(group.lang)!;
      const inbox = inboxTexts.get(dictionaryId) ?? inboxTexts.set(dictionaryId, new Set()).get(dictionaryId)!;
      const newExamples: Example[] = [];

      if (!group.existing) {
        const concept: Concept = {
          id: createId(),
          dictionaryId,
          lang: group.lang,
          text: group.text,
          pos: group.pos,
          meanings: group.meanings,
          grammar: group.grammar,
          // Spec 5.1/5.2: German has Rộng only for now. An English concept is a
          // depth concept, like the "Add concept" screen makes.
          mode: group.lang === 'de' ? 'breadth' : group.kind === 'concept' ? 'depth' : options.mode,
          kind: group.kind === 'concept' ? 'concept' : undefined,
          setIds: groupSetIds(group).length > 0 ? groupSetIds(group) : undefined,
          lessonId: lessonOf.get(group),
          verification: 'unverified',
          source: {
            type: 'import',
            fileName: options.fileName,
            lesson: group.lesson,
            row: group.rowNumbers[0],
          },
          status: 'loaded',
          createdAt: now,
          updatedAt: now,
        };
        await db.concepts.add(concept);
        conceptIdOf.set(group, concept.id);
        batch.createdConceptIds.push(concept.id);
        result.createdConcepts++;
        if (concept.lessonId) result.lessonsAssigned++;

        let linked = 0;
        for (const draft of group.examples) {
          if (draft.needsHighlight && !draft.highlight) {
            if (inbox.has(lower(draft.text))) continue;
            newExamples.push(toExample(dictionaryId, group.text, draft, undefined, now));
            inbox.add(lower(draft.text));
            result.inboxExamples++;
          } else {
            newExamples.push(toExample(dictionaryId, group.text, draft, concept.id, now));
            linked++;
          }
        }
        // Spec C4: every concept has at least one linked example.
        if (linked === 0 && group.kind !== 'concept') {
          newExamples.push(
            toExample(
              dictionaryId,
              group.text,
              { text: group.text, isMinimal: true, needsHighlight: false },
              concept.id,
              now,
            ),
          );
        }
      } else {
        const existing = group.existing;
        conceptIdOf.set(group, existing.id);
        // A word that already exists can still join a set: that is how one
        // word ends up in several sets without a second copy.
        const wantedSets = groupSetIds(group);
        const nextSets = [...new Set([...(existing.setIds ?? []), ...wantedSets])];
        const setsChanged = nextSets.length !== (existing.setIds ?? []).length;
        if (options.duplicateAction === 'skip') {
          if (setsChanged) {
            batch.updatedConcepts.push({ id: existing.id, before: { setIds: existing.setIds } });
            await db.concepts.update(existing.id, { setIds: nextSets, updatedAt: now });
            result.addedToSets++;
          } else {
            result.skippedDuplicates++;
          }
          continue;
        }

        // merge: only fill what is empty / add meanings. update: the
        // file's non-empty values win.
        const patch: Partial<Concept> = {};
        if (setsChanged) {
          patch.setIds = nextSets;
          result.addedToSets++;
        }
        const overwrite = options.duplicateAction === 'update';
        const wantedLesson = lessonOf.get(group);
        if (wantedLesson && existing.lessonId !== wantedLesson && (overwrite || !existing.lessonId)) {
          patch.lessonId = wantedLesson;
          result.lessonsAssigned++;
        }
        if (group.pos && (overwrite || !existing.pos) && group.pos !== existing.pos) {
          patch.pos = group.pos;
        }
        const meanings = overwrite && group.meanings.length > 0 ? [...group.meanings] : [...existing.meanings];
        for (const m of group.meanings) {
          if (!meanings.some((x) => lower(x) === lower(m))) meanings.push(m);
        }
        if (JSON.stringify(meanings) !== JSON.stringify(existing.meanings)) patch.meanings = meanings;
        if (group.grammar) {
          const merged = overwrite
            ? mergeGrammar(existing.grammar, group.grammar)
            : mergeGrammar(group.grammar, existing.grammar);
          if (JSON.stringify(merged) !== JSON.stringify(existing.grammar)) patch.grammar = merged;
        }

        const known = textsByConcept.get(existing.id) ?? new Set<string>();
        for (const draft of group.examples) {
          if (draft.isMinimal) continue;
          if (draft.needsHighlight && !draft.highlight) {
            if (inbox.has(lower(draft.text))) continue;
            newExamples.push(toExample(dictionaryId, group.text, draft, undefined, now));
            inbox.add(lower(draft.text));
            result.inboxExamples++;
          } else {
            if (known.has(lower(draft.text))) continue;
            newExamples.push(toExample(dictionaryId, group.text, draft, existing.id, now));
            known.add(lower(draft.text));
          }
        }

        if (Object.keys(patch).length === 0 && newExamples.length === 0) {
          result.skippedDuplicates++;
          continue;
        }
        if (Object.keys(patch).length > 0) {
          const before: Partial<Concept> = {};
          for (const key of Object.keys(patch) as Array<keyof Concept>) {
            (before as Record<string, unknown>)[key] = existing[key];
          }
          batch.updatedConcepts.push({ id: existing.id, before });
          await db.concepts.update(existing.id, { ...patch, updatedAt: now });
        }
        if (overwrite) result.updatedConcepts++;
        else result.mergedConcepts++;
      }

      if (group.kind === 'concept') {
        // newExamples and group.examples line up for the draft that has a real sentence.
        const drafts = group.examples.filter((d) => !d.isMinimal && !(d.needsHighlight && !d.highlight));
        for (const example of newExamples) {
          if (!example.targetConceptId || !example.highlight) continue;
          const draft = drafts.find((d) => d.text === example.text);
          wordSources.push({ example, lang: group.lang, meaning: draft?.highlightMeaning });
        }
      }

      if (newExamples.length > 0) {
        await db.examples.bulkAdd(newExamples);
        for (const e of newExamples) batch.createdExampleIds.push(e.id);
        result.examplesAdded += newExamples.length;
      }
    }

    const changed =
      batch.createdConceptIds.length > 0 ||
      batch.createdExampleIds.length > 0 ||
      batch.updatedConcepts.length > 0;
    if (changed) {
      await db.importBatches.add(batch);
      result.batchId = batch.id;
    }
  });

  await applyParentLinks(selected, conceptIdOf, dictionaryIds, groupSetIds, batch, result);
  await applyHighlightWords(wordSources, batch, result);
  return result;
}

// Parent links named in the file. The parent is found by name in the same
// language; a name not in the library becomes a blank concept (just the name,
// in the child's decks) so one file can describe a whole chain. Runs after the
// main write because linking has its own rules (no cycles) and transactions.
async function applyParentLinks(
  selected: ImportGroup[],
  conceptIdOf: Map<ImportGroup, string>,
  dictionaryIds: Map<Lang, string>,
  groupSetIds: (group: ImportGroup) => string[],
  batch: ImportBatch,
  result: CommitResult,
): Promise<void> {
  const withLinks = selected.filter((g) => g.links.length > 0 && conceptIdOf.has(g));
  if (withLinks.length === 0) return;

  const live = await conceptRepository.listActive();
  const createdLinkIds: string[] = [];
  for (const group of withLinks) {
    const childId = conceptIdOf.get(group)!;
    for (const link of group.links) {
      let parent = live.find((c) => c.id !== childId && c.lang === group.lang && lower(c.text) === lower(link.parent));
      if (!parent) {
        const made = await createConceptWithDescription(dictionaryIds.get(group.lang)!, group.lang, link.parent, '');
        parent = made.concept;
        if (made.outcome === 'created') {
          const decks = groupSetIds(group);
          if (decks.length > 0) {
            await conceptRepository.update(parent.id, { setIds: decks });
            parent = { ...parent, setIds: decks };
          }
          batch.createdConceptIds.push(parent.id);
          result.parentsCreated++;
        }
        live.push(parent);
      }
      const before = (await db.conceptLinks.where('childId').equals(childId).toArray()).find(
        (l) => l.parentId === parent!.id && l.deletedAt === undefined,
      );
      const outcome = await linkConcepts(childId, parent.id, link.type);
      if (!outcome.ok) {
        result.linkProblems.push(`"${group.text}" → "${link.parent}": ${LINK_FAILURE_TEXT[outcome.reason]}`);
      } else if (!before) {
        createdLinkIds.push(outcome.link.id);
        result.linksCreated++;
      } else if (before.type !== link.type) {
        result.linksChanged++;
      }
    }
  }

  if (createdLinkIds.length > 0) batch.createdLinkIds = createdLinkIds;
  if (createdLinkIds.length === 0 && result.parentsCreated === 0 && result.linksChanged === 0) return;
  // The batch was saved inside the main write only when it changed something
  // there; links and blank parents may be all this import did.
  if (await db.importBatches.get(batch.id)) await db.importBatches.put({ ...batch, updatedAt: Date.now() });
  else await db.importBatches.add({ ...batch, updatedAt: Date.now() });
  result.batchId = batch.id;
}

// "Also learn the highlighted phrase as a Word" for the examples of concept rows
// (PO 2026-11-11): each single-part phrase becomes, or is matched to, a Word that
// keeps its own copy of the example. The Vietnamese meaning from the file is set
// only on a Word that has none. Runs after the main write like the links, and the
// batch records what it made so the undo takes it away too.
async function applyHighlightWords(
  sources: Array<{ example: Example; lang: Lang; meaning?: string }>,
  batch: ImportBatch,
  result: CommitResult,
): Promise<void> {
  if (sources.length === 0) return;
  let changed = false;
  for (const { example, lang, meaning } of sources) {
    const made = await createWordFromHighlight(example, lang);
    if (!made) continue;
    if (made.created) {
      batch.createdConceptIds.push(made.word.id);
      result.wordsCreated++;
      changed = true;
    }
    if (made.example) {
      batch.createdExampleIds.push(made.example.id);
      changed = true;
    }
    const text = meaning?.trim();
    if (text && made.word.meanings.length === 0) {
      await conceptRepository.update(made.word.id, { meanings: [text] });
      if (!made.created) {
        batch.updatedConcepts.push({ id: made.word.id, before: { meanings: [] } });
        changed = true;
      }
    }
  }
  if (!changed) return;
  await db.importBatches.put({ ...batch, updatedAt: Date.now() });
  result.batchId = batch.id;
}

// The most recent import that hasn't been undone (spec: "hoàn tác lần nhập
// gần nhất").
export async function getLatestUndoableBatch(): Promise<ImportBatch | undefined> {
  const batches = await db.importBatches.orderBy('createdAt').reverse().toArray();
  return batches.find((b) => b.undoneAt === undefined && b.deletedAt === undefined);
}

export async function undoImport(batchId: string): Promise<boolean> {
  const latest = await getLatestUndoableBatch();
  if (!latest || latest.id !== batchId) return false;
  const now = Date.now();

  await db.transaction('rw', [db.concepts, db.examples, db.importBatches, db.lessons, db.conceptLinks], async () => {
    for (const id of latest.createdLinkIds ?? []) {
      await db.conceptLinks.update(id, { deletedAt: now, updatedAt: now });
    }
    for (const id of latest.createdExampleIds) {
      await db.examples.update(id, { deletedAt: now, updatedAt: now });
    }
    for (const id of latest.createdConceptIds) {
      await db.concepts.update(id, { deletedAt: now, updatedAt: now });
    }
    for (const { id, before } of latest.updatedConcepts) {
      await db.concepts.update(id, { ...before, updatedAt: now });
    }
    // Lessons this import made go too; a word put in one since then leaves it.
    for (const id of latest.createdLessonIds ?? []) {
      const members = await db.concepts.filter((c) => c.lessonId === id).toArray();
      for (const c of members) await db.concepts.update(c.id, { lessonId: undefined, updatedAt: now });
      await db.lessons.update(id, { deletedAt: now, updatedAt: now });
    }
    await db.importBatches.update(latest.id, { undoneAt: now, updatedAt: now });
  });
  return true;
}

// `over` wins field by field, also inside the verb forms: importing a file that
// adds only Präsens er/sie/es to a word keeps the forms it already had. Empty
// values never win (a stored form can be an explicit `undefined`).
function mergeGrammar(base: ConceptGrammar | undefined, over: ConceptGrammar | undefined): ConceptGrammar {
  const filled = <T extends object>(o: T | undefined): Partial<T> =>
    Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
  const merged: ConceptGrammar = { ...filled(base), ...filled(over) };
  const forms = { ...filled(base?.verbForms), ...filled(over?.verbForms) };
  if (Object.keys(forms).length > 0) merged.verbForms = forms;
  else delete merged.verbForms;
  return merged;
}
