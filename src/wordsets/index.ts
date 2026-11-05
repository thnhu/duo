import { createId } from '../core/id';
import { db } from '../db/schema';
import { conceptRepository, wordSetRepository } from '../db/repositories';
import type { Concept, Lang, WordSet } from '../db/types';

// Word sets (M13): named groups of concepts inside one language, e.g. "IT" or
// "From films". A concept can be in several sets; a set is only a label on the
// concept (`Concept.setIds`), so the word, its examples and its schedule stay
// one thing however many sets it is in.

// What the Library (and later Learn/Search) is showing:
// every concept, only those in no set, or one set.
export type SetFilter = { kind: 'all' } | { kind: 'none' } | { kind: 'set'; id: string };

export const ALL_SETS: SetFilter = { kind: 'all' };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function listWordSets(lang: Lang): Promise<WordSet[]> {
  const sets = await wordSetRepository.listActive();
  return sets.filter((s) => s.lang === lang).sort((a, b) => a.name.localeCompare(b.name));
}

export type SetResult = { ok: true; set: WordSet } | { ok: false; reason: 'empty' | 'duplicate' };

// A name is unique inside a language (ignoring case), so two "IT" sets never exist.
export async function createWordSet(lang: Lang, name: string): Promise<SetResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if ((await listWordSets(lang)).some((s) => sameName(s.name, trimmed))) return { ok: false, reason: 'duplicate' };
  const set: WordSet = { id: createId(), name: trimmed, lang, updatedAt: Date.now() };
  await wordSetRepository.add(set);
  return { ok: true, set };
}

export async function renameWordSet(id: string, name: string): Promise<SetResult> {
  const set = await wordSetRepository.getById(id);
  const trimmed = name.trim();
  if (!set || set.deletedAt !== undefined) return { ok: false, reason: 'empty' };
  if (!trimmed) return { ok: false, reason: 'empty' };
  if ((await listWordSets(set.lang)).some((s) => s.id !== id && sameName(s.name, trimmed))) {
    return { ok: false, reason: 'duplicate' };
  }
  await wordSetRepository.update(id, { name: trimmed });
  return { ok: true, set: { ...set, name: trimmed } };
}

// Deleting a set never deletes concepts: they only lose the label. The
// concepts are updated through the repository so the change syncs.
export async function deleteWordSet(id: string): Promise<void> {
  const concepts = await db.concepts.toArray();
  for (const c of concepts) {
    if (c.setIds?.includes(id)) {
      await conceptRepository.update(c.id, { setIds: c.setIds.filter((x) => x !== id) });
    }
  }
  await wordSetRepository.softDelete(id);
}

// Replaces the sets of one concept. Unknown or deleted set ids are dropped.
export async function setConceptSets(conceptId: string, setIds: string[]): Promise<void> {
  const concept = await conceptRepository.getById(conceptId);
  if (!concept || concept.deletedAt !== undefined) return;
  const live = new Set((await listWordSets(concept.lang)).map((s) => s.id));
  const next = [...new Set(setIds)].filter((id) => live.has(id));
  const current = (concept.setIds ?? []).filter((id) => live.has(id));
  if (next.length === current.length && next.every((id) => current.includes(id))) return;
  await conceptRepository.update(conceptId, { setIds: next });
}

// Adds a concept to a set, keeping the sets it is already in. Quick-add uses
// this, also for a word that already exists: that is how "ball" ends up in
// both "IT" and "Films" without a second concept.
export async function addConceptToSet(conceptId: string, setId: string): Promise<void> {
  const concept = await conceptRepository.getById(conceptId);
  if (!concept) return;
  await setConceptSets(conceptId, [...(concept.setIds ?? []), setId]);
}

// Pure. Concepts matching the filter; a deleted set id on a concept is ignored.
export function filterBySet(concepts: Concept[], filter: SetFilter, liveSetIds: Set<string>): Concept[] {
  const live = (c: Concept) => (c.setIds ?? []).filter((id) => liveSetIds.has(id));
  switch (filter.kind) {
    case 'all':
      return concepts;
    case 'none':
      return concepts.filter((c) => live(c).length === 0);
    case 'set':
      return concepts.filter((c) => live(c).includes(filter.id));
  }
}

export interface SetCounts {
  all: number;
  none: number;
  bySet: Map<string, number>;
}

// Pure. How many concepts each choice would show, for the filter chips.
export function countBySet(concepts: Concept[], sets: WordSet[]): SetCounts {
  const liveIds = new Set(sets.map((s) => s.id));
  const bySet = new Map<string, number>(sets.map((s) => [s.id, 0]));
  let none = 0;
  for (const c of concepts) {
    const own = (c.setIds ?? []).filter((id) => liveIds.has(id));
    if (own.length === 0) none++;
    for (const id of own) bySet.set(id, (bySet.get(id) ?? 0) + 1);
  }
  return { all: concepts.length, none, bySet };
}

// ---- Remembered choices (per device) ----

const filterKey = (lang: Lang) => `duo:set-filter:${lang}`;
const addKey = (lang: Lang) => `duo:add-set:${lang}`;

export function readSetFilter(lang: Lang): SetFilter {
  const raw = localStorage.getItem(filterKey(lang));
  if (raw === 'none') return { kind: 'none' };
  if (raw && raw !== 'all') return { kind: 'set', id: raw };
  return ALL_SETS;
}

export function writeSetFilter(lang: Lang, filter: SetFilter): void {
  localStorage.setItem(filterKey(lang), filter.kind === 'set' ? filter.id : filter.kind);
}

// The set Quick-add puts new words in ('' = none), remembered from last time.
export function readAddSet(lang: Lang): string {
  return localStorage.getItem(addKey(lang)) ?? '';
}

export function writeAddSet(lang: Lang, setId: string): void {
  localStorage.setItem(addKey(lang), setId);
}
