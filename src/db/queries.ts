import { db } from './schema';
import { conceptRepository, dictionaryRepository, exampleRepository } from './repositories';
import type { Concept, Example, Lang } from './types';

export async function findConceptByExactText(
  dictionaryId: string,
  text: string,
): Promise<Concept | undefined> {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return undefined;
  const concepts = await conceptRepository.listActive();
  return concepts.find(
    (c) => c.dictionaryId === dictionaryId && c.text.trim().toLowerCase() === normalized,
  );
}

export async function listConceptsByDictionary(dictionaryId: string): Promise<Concept[]> {
  const concepts = await conceptRepository.listActive();
  return concepts
    .filter((c) => c.dictionaryId === dictionaryId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Examples with no targetConceptId are "câu chưa gắn concept" — spec C7 — and
// sit in the Hộp chờ duyệt (inbox) until PO highlights a phrase in them.
export async function listInboxExamples(dictionaryId: string): Promise<Example[]> {
  const examples = await exampleRepository.listActive();
  return examples
    .filter((e) => e.dictionaryId === dictionaryId && e.targetConceptId === undefined)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function listExamplesForConcept(conceptId: string): Promise<Example[]> {
  const examples = await db.examples
    .where('targetConceptId')
    .equals(conceptId)
    .toArray();
  return examples
    .filter((e) => e.deletedAt === undefined)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// MVP: one dictionary per language (spec section C6), seeded in src/db/seed.ts.
export async function dictionaryIdForLang(lang: Lang): Promise<string> {
  const dictionaries = await dictionaryRepository.listActive();
  const match = dictionaries.find((d) => d.lang === lang);
  if (!match) throw new Error(`No dictionary found for language "${lang}"`);
  return match.id;
}
