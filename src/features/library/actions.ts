import { db } from '../../db/schema';
import { listExamplesForConcept } from '../../db/queries';
import {
  conceptLinkRepository,
  conceptRepository,
  exampleLinkRepository,
  exampleRepository,
  passageRepository,
  wordSetRepository,
} from '../../db/repositories';
import { deleteLinksOfConcept, deleteLinksOfExample } from '../../depth';
import { deleteLinksOfConceptNode } from '../../links';

// Everything a delete soft-deleted, so "Hoàn tác" can bring it back. Deletes
// are soft (principle 9), which is what makes undo safe instead of asking
// "are you sure?" first.
export interface DeletedRows {
  concepts: string[];
  examples: string[];
  exampleLinks: string[];
  conceptLinks: string[];
  // Only a deck delete sets these: the deck, passages left with no gap, and
  // the previous deck labels of concepts that were kept.
  sets?: string[];
  passages?: string[];
  labels?: Array<{ conceptId: string; setIds: string[] }>;
}

// Soft-deleting a concept also soft-deletes its linked examples, otherwise
// the library/inbox would keep showing examples pointing at a deleted concept.
export async function deleteConceptCascade(conceptId: string): Promise<DeletedRows> {
  const examples = await listExamplesForConcept(conceptId);
  const exampleIds = examples.map((e) => e.id);
  // What is alive right now is exactly what this delete takes away.
  const [byConcept, byExample, asChild, asParent] = await Promise.all([
    db.exampleLinks.where('conceptId').equals(conceptId).toArray(),
    db.exampleLinks.where('exampleId').anyOf(exampleIds).toArray(),
    db.conceptLinks.where('childId').equals(conceptId).toArray(),
    db.conceptLinks.where('parentId').equals(conceptId).toArray(),
  ]);
  const alive = <T extends { id: string; deletedAt?: number }>(rows: T[]) =>
    [...new Set(rows.filter((r) => r.deletedAt === undefined).map((r) => r.id))];
  const deleted: DeletedRows = {
    concepts: [conceptId],
    examples: exampleIds,
    exampleLinks: alive([...byConcept, ...byExample]),
    conceptLinks: alive([...asChild, ...asParent]),
  };

  await Promise.all(examples.map((example) => exampleRepository.softDelete(example.id)));
  await deleteLinksOfConcept(conceptId);
  await deleteLinksOfConceptNode(conceptId);
  await Promise.all(examples.map((example) => deleteLinksOfExample(example.id)));
  await conceptRepository.softDelete(conceptId);
  return deleted;
}

export async function deleteExample(exampleId: string): Promise<DeletedRows> {
  const links = (await db.exampleLinks.where('exampleId').equals(exampleId).toArray()).filter(
    (l) => l.deletedAt === undefined,
  );
  await deleteLinksOfExample(exampleId);
  await exampleRepository.softDelete(exampleId);
  return { concepts: [], examples: [exampleId], exampleLinks: links.map((l) => l.id), conceptLinks: [] };
}

// Undo of the two deletes above: the rows come back (through the repositories,
// so the restore syncs like any other edit).
export async function restoreDeleted(rows: DeletedRows): Promise<void> {
  for (const id of rows.concepts) await conceptRepository.update(id, { deletedAt: undefined });
  for (const id of rows.examples) await exampleRepository.update(id, { deletedAt: undefined });
  for (const id of rows.exampleLinks) await exampleLinkRepository.update(id, { deletedAt: undefined });
  for (const id of rows.conceptLinks) await conceptLinkRepository.update(id, { deletedAt: undefined });
  for (const id of rows.sets ?? []) await wordSetRepository.update(id, { deletedAt: undefined });
  for (const id of rows.passages ?? []) await passageRepository.update(id, { deletedAt: undefined });
  for (const label of rows.labels ?? []) await conceptRepository.update(label.conceptId, { setIds: label.setIds });
}
