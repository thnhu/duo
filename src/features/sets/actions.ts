import { db } from '../../db/schema';
import { conceptRepository, passageRepository, wordSetRepository } from '../../db/repositories';
import type { Concept } from '../../db/types';
import { deleteConceptCascade, type DeletedRows } from '../library/actions';

// Deleting a deck deletes what is in it: the concepts (words and ideas) that
// belong to no other deck, together with their examples and links. A concept
// that is also in another deck is kept and only loses this deck's label (it
// still has a home). Everything is a soft delete, so "Hoàn tác" restores it.

export interface DeckDeletePreview {
  // Concepts that go away with the deck, and their examples.
  concepts: number;
  examples: number;
  // Concepts also in another deck: kept, only unlabelled.
  shared: number;
}

async function splitDeckContents(setId: string): Promise<{ own: Concept[]; shared: Concept[] }> {
  const liveSets = new Set((await wordSetRepository.listActive()).map((s) => s.id));
  const inDeck = (await db.concepts.toArray()).filter(
    (c) => c.deletedAt === undefined && c.setIds?.includes(setId),
  );
  const own: Concept[] = [];
  const shared: Concept[] = [];
  for (const c of inDeck) {
    const others = (c.setIds ?? []).filter((id) => id !== setId && liveSets.has(id));
    (others.length > 0 ? shared : own).push(c);
  }
  return { own, shared };
}

// What the confirm box tells the PO before anything is deleted.
export async function previewDeckDelete(setId: string): Promise<DeckDeletePreview> {
  const { own, shared } = await splitDeckContents(setId);
  const ownIds = new Set(own.map((c) => c.id));
  const examples = (await db.examples.toArray()).filter(
    (e) => e.deletedAt === undefined && e.targetConceptId !== undefined && ownIds.has(e.targetConceptId),
  );
  return { concepts: own.length, examples: examples.length, shared: shared.length };
}

export async function deleteDeckWithContents(setId: string): Promise<DeletedRows> {
  const { own, shared } = await splitDeckContents(setId);
  const rows: DeletedRows = { concepts: [], examples: [], exampleLinks: [], conceptLinks: [], sets: [setId], passages: [], labels: [] };

  for (const c of own) {
    const part = await deleteConceptCascade(c.id);
    rows.concepts.push(...part.concepts);
    rows.examples.push(...part.examples);
    rows.exampleLinks.push(...part.exampleLinks);
    rows.conceptLinks.push(...part.conceptLinks);
  }

  // A passage whose gaps all went away has nothing left to ask.
  const goneExamples = new Set(rows.examples);
  const examples = await db.examples.toArray();
  const passageIds = new Set(examples.filter((e) => e.passageId && goneExamples.has(e.id)).map((e) => e.passageId!));
  for (const passageId of passageIds) {
    const alive = examples.some((e) => e.passageId === passageId && !goneExamples.has(e.id) && e.deletedAt === undefined);
    if (!alive) {
      await passageRepository.softDelete(passageId);
      rows.passages!.push(passageId);
    }
  }

  // Shared concepts stay; only this deck's label goes.
  for (const c of shared) {
    rows.labels!.push({ conceptId: c.id, setIds: c.setIds ?? [] });
    await conceptRepository.update(c.id, { setIds: (c.setIds ?? []).filter((id) => id !== setId) });
  }

  await wordSetRepository.softDelete(setId);
  return rows;
}
