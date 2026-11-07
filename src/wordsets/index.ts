import { createId } from '../core/id';
import { db } from '../db/schema';
import { conceptRepository, lessonRepository, wordSetRepository } from '../db/repositories';
import { lessonFitsDecks } from '../lessons/rules';
import type { Concept, ConceptKind, Lang, WordSet } from '../db/types';

// Word sets (M13): named groups of concepts inside one language, e.g. "IT" or
// "From films". A concept can be in several sets; a set is only a label on the
// concept (`Concept.setIds`), so the word, its examples and its schedule stay
// one thing however many sets it is in.

// What the Library (and later Learn/Search) is showing:
// every concept, only those in no set, or one set.
export type SetFilter = { kind: 'all' } | { kind: 'none' } | { kind: 'set'; id: string };

export const ALL_SETS: SetFilter = { kind: 'all' };

// "General" is the built-in deck of each language: a concept in no other deck
// is in General, so nothing is stored for it. This is the Library default, so
// opening it shows the General deck instead of every word.
export const GENERAL_DECK_NAME = 'General';
export const GENERAL_FILTER: SetFilter = { kind: 'none' };

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
      await setConceptSets(c.id, c.setIds.filter((x) => x !== id));
    }
  }
  // The deck's lessons go with it; the concepts only lose the lesson label.
  for (const lesson of await lessonRepository.listActive()) {
    if (lesson.setId === id) await lessonRepository.softDelete(lesson.id);
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
  // A lesson belongs to one deck: leaving that deck leaves the lesson too.
  const lesson = concept.lessonId ? await lessonRepository.getById(concept.lessonId) : undefined;
  const dropLesson = !!concept.lessonId && !(lesson && lesson.deletedAt === undefined && lessonFitsDecks(lesson, next));
  await conceptRepository.update(conceptId, { setIds: next, ...(dropLesson ? { lessonId: undefined } : {}) });
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

// ---- Library: deck cards first, words only when a deck is opened ----

// Counts for the deck cards. Reads the concept rows but keeps none of them, so
// the Library landing screen holds numbers, not the whole word list.
export async function countDecks(lang: Lang, sets: WordSet[]): Promise<SetCounts> {
  const liveIds = new Set(sets.map((s) => s.id));
  const bySet = new Map<string, number>(sets.map((s) => [s.id, 0]));
  let all = 0;
  let none = 0;
  await db.concepts
    .where('lang')
    .equals(lang)
    .each((c) => {
      if (c.deletedAt !== undefined) return;
      all++;
      const own = (c.setIds ?? []).filter((id) => liveIds.has(id));
      if (own.length === 0) none++;
      for (const id of own) bySet.set(id, (bySet.get(id) ?? 0) + 1);
    });
  return { all, none, bySet };
}

// Word or concept? Stored for new rows; older rows are derived (no migration).
export function conceptKind(c: Concept): ConceptKind {
  return c.kind ?? (c.mode === 'depth' ? 'concept' : 'word');
}

// Sizes of the two sub decks inside one deck (numbers only, no rows kept).
export async function countSubDecks(
  lang: Lang,
  filter: SetFilter,
  sets: WordSet[],
): Promise<Record<ConceptKind, number>> {
  const liveIds = new Set(sets.map((s) => s.id));
  const counts: Record<ConceptKind, number> = { word: 0, concept: 0 };
  await db.concepts
    .where('lang')
    .equals(lang)
    .each((c) => {
      if (c.deletedAt !== undefined) return;
      if (filterBySet([c], filter, liveIds).length === 0) return;
      counts[conceptKind(c)]++;
    });
  return counts;
}

// The rows of ONE sub deck (words or concepts) of a deck, newest first. The
// only place the Library loads rows, and only after a sub deck card is opened.
export async function listDeckConcepts(
  lang: Lang,
  filter: SetFilter,
  sets: WordSet[],
  sub: ConceptKind,
): Promise<Concept[]> {
  const liveIds = new Set(sets.map((s) => s.id));
  const rows = await db.concepts
    .where('lang')
    .equals(lang)
    .filter((c) => c.deletedAt === undefined)
    .toArray();
  return filterBySet(rows, filter, liveIds)
    .filter((c) => conceptKind(c) === sub)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Deck key used in the Library address: "general", "all" or a deck id.
export function deckToKey(filter: SetFilter): string {
  return filter.kind === 'none' ? 'general' : filter.kind === 'all' ? 'all' : filter.id;
}

export function deckFromKey(key: string | null): SetFilter | null {
  if (!key) return null;
  if (key === 'general') return GENERAL_FILTER;
  if (key === 'all') return ALL_SETS;
  return { kind: 'set', id: key };
}

// ---- Remembered choices (per device) ----

const filterKey = (lang: Lang) => `duo:set-filter:${lang}`;
const addKey = (lang: Lang) => `duo:add-set:${lang}`;

export function readSetFilter(lang: Lang): SetFilter {
  const raw = localStorage.getItem(filterKey(lang));
  if (raw === 'all') return ALL_SETS;
  if (raw && raw !== 'none') return { kind: 'set', id: raw };
  return GENERAL_FILTER;
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

// ---- Choosing sets to study (Learn, Review) ----

// Pure. Empty selection = no restriction; otherwise the concept must be in at
// least one of the selected sets.
export function inSelectedSets(concept: Concept, selectedIds: string[] | undefined): boolean {
  if (!selectedIds || selectedIds.length === 0) return true;
  return (concept.setIds ?? []).some((id) => selectedIds.includes(id));
}

// Which sets to study, remembered per device under a caller-chosen key
// (Learn keeps one list per language, Today one for both).
export function readStudySets(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeStudySets(key: string, ids: string[]): void {
  localStorage.setItem(key, JSON.stringify(ids));
}
