import { createId } from '../core/id';
import { createDefaultAttributes } from '../db/defaults';
import { dictionaryIdForLang } from '../db/queries';
import { db } from '../db/schema';
import type { Concept, Example, ImportBatch, Lang, StudyMode } from '../db/types';
import type { ExampleDraft } from './build';
import type { DuplicateAction, ImportGroup } from './plan';

export interface CommitOptions {
  fileName: string;
  mode: StudyMode;
  duplicateAction: DuplicateAction;
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
  };

  const selected = groups.filter((g) => g.included);
  const dictionaryIds = new Map<Lang, string>();
  for (const group of selected) {
    if (!dictionaryIds.has(group.lang)) {
      dictionaryIds.set(group.lang, await dictionaryIdForLang(group.lang));
    }
  }

  const batch: ImportBatch = {
    id: createId(),
    fileName: options.fileName,
    createdConceptIds: [],
    createdExampleIds: [],
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
          // Spec 5.1/5.2: German has Rộng only for now.
          mode: group.lang === 'de' ? 'breadth' : options.mode,
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
        batch.createdConceptIds.push(concept.id);
        result.createdConcepts++;

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
        if (linked === 0) {
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
        if (options.duplicateAction === 'skip') {
          result.skippedDuplicates++;
          continue;
        }

        // merge: only fill what is empty / add meanings. update: the
        // file's non-empty values win.
        const patch: Partial<Concept> = {};
        const overwrite = options.duplicateAction === 'update';
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
            ? { ...existing.grammar, ...group.grammar }
            : { ...group.grammar, ...existing.grammar };
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

  return result;
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

  await db.transaction('rw', [db.concepts, db.examples, db.importBatches], async () => {
    for (const id of latest.createdExampleIds) {
      await db.examples.update(id, { deletedAt: now, updatedAt: now });
    }
    for (const id of latest.createdConceptIds) {
      await db.concepts.update(id, { deletedAt: now, updatedAt: now });
    }
    for (const { id, before } of latest.updatedConcepts) {
      await db.concepts.update(id, { ...before, updatedAt: now });
    }
    await db.importBatches.update(latest.id, { undoneAt: now, updatedAt: now });
  });
  return true;
}
