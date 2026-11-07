import type { Concept, Example, Passage } from './types';

// Passages made before `Passage.setId` existed have no deck. This guesses it
// from the words the passage teaches: the deck that most of its gap words are
// in. A tie goes to the smaller deck id so every device decides the same way;
// a passage whose words are in no deck stays in General. Pure, so it can be
// tested without a database.
export function guessPassageDecks(
  passages: Passage[],
  examples: Example[],
  concepts: Concept[],
  liveSetIds: Set<string>,
): Map<string, string> {
  const conceptById = new Map(concepts.filter((c) => c.deletedAt === undefined).map((c) => [c.id, c]));
  const gapsByPassage = new Map<string, Example[]>();
  for (const e of examples) {
    if (!e.passageId || e.deletedAt !== undefined) continue;
    const list = gapsByPassage.get(e.passageId) ?? [];
    list.push(e);
    gapsByPassage.set(e.passageId, list);
  }

  const result = new Map<string, string>();
  for (const passage of passages) {
    if (passage.deletedAt !== undefined || passage.setId) continue;
    const votes = new Map<string, number>();
    for (const gap of gapsByPassage.get(passage.id) ?? []) {
      const concept = gap.targetConceptId ? conceptById.get(gap.targetConceptId) : undefined;
      for (const id of new Set(concept?.setIds ?? [])) {
        if (liveSetIds.has(id)) votes.set(id, (votes.get(id) ?? 0) + 1);
      }
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best) result.set(passage.id, best[0]);
  }
  return result;
}
