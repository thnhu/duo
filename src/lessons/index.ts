import { createId } from '../core/id';
import { db } from '../db/schema';
import { conceptRepository, lessonRepository, wordSetRepository } from '../db/repositories';
import type { Concept, Lang, Lesson } from '../db/types';
import { lessonFitsDecks } from './rules';

// Lessons (Bản 8): a named topic inside one deck, or inside General when
// `setId` is undefined. A concept is in at most one lesson and only while it
// is still in that lesson's deck (see rules.ts). The lesson is picked from a
// list, never typed on a word, so one topic cannot turn into two by a typo.

const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

const clean = (name: string) => name.trim().replace(/\s+/g, ' ');

export type LessonResult =
  | { ok: true; lesson: Lesson }
  | { ok: false; reason: 'empty' | 'duplicate' | 'missing' };

// The lessons of one deck (General when `setId` is undefined), in order.
export async function listLessons(lang: Lang, setId: string | undefined): Promise<Lesson[]> {
  const all = await lessonRepository.listActive();
  return all
    .filter((l) => l.lang === lang && l.setId === setId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function createLesson(lang: Lang, setId: string | undefined, name: string): Promise<LessonResult> {
  const trimmed = clean(name);
  if (!trimmed) return { ok: false, reason: 'empty' };
  const existing = await listLessons(lang, setId);
  if (existing.some((l) => sameName(l.name, trimmed))) return { ok: false, reason: 'duplicate' };
  const order = existing.reduce((max, l) => Math.max(max, l.order), -1) + 1;
  const lesson: Lesson = {
    id: createId(),
    lang,
    name: trimmed,
    order,
    ...(setId ? { setId } : {}),
    updatedAt: Date.now(),
  };
  await lessonRepository.add(lesson);
  return { ok: true, lesson };
}

// The lesson of that name in the deck, made if it is not there yet (used by the
// file import, so a second import does not repeat the lesson).
export async function findOrCreateLesson(
  lang: Lang,
  setId: string | undefined,
  name: string,
): Promise<Lesson | null> {
  const trimmed = clean(name);
  if (!trimmed) return null;
  const found = (await listLessons(lang, setId)).find((l) => sameName(l.name, trimmed));
  if (found) return found;
  const created = await createLesson(lang, setId, trimmed);
  return created.ok ? created.lesson : null;
}

// Renames in one place: every word of the lesson follows, as they only point at it.
export async function renameLesson(id: string, name: string): Promise<LessonResult> {
  const lesson = await lessonRepository.getById(id);
  if (!lesson || lesson.deletedAt !== undefined) return { ok: false, reason: 'missing' };
  const trimmed = clean(name);
  if (!trimmed) return { ok: false, reason: 'empty' };
  const siblings = await listLessons(lesson.lang, lesson.setId);
  if (siblings.some((l) => l.id !== id && sameName(l.name, trimmed))) return { ok: false, reason: 'duplicate' };
  await lessonRepository.update(id, { name: trimmed });
  return { ok: true, lesson: { ...lesson, name: trimmed } };
}

// Moves a lesson one place up (-1) or down (+1) among its deck's lessons.
export async function moveLesson(id: string, direction: -1 | 1): Promise<void> {
  const lesson = await lessonRepository.getById(id);
  if (!lesson || lesson.deletedAt !== undefined) return;
  const list = await listLessons(lesson.lang, lesson.setId);
  const at = list.findIndex((l) => l.id === id);
  const to = at + direction;
  if (at === -1 || to < 0 || to >= list.length) return;
  const moved = [...list];
  [moved[at], moved[to]] = [moved[to], moved[at]];
  // Renumber 0..n-1 so equal or gappy orders cannot make the move do nothing.
  for (const [index, item] of moved.entries()) {
    if (item.order !== index) await lessonRepository.update(item.id, { order: index });
  }
}

// Words currently in each lesson of the deck (live words only).
export async function countByLesson(lang: Lang, setId: string | undefined): Promise<Map<string, number>> {
  const ids = new Set((await listLessons(lang, setId)).map((l) => l.id));
  const counts = new Map<string, number>([...ids].map((id) => [id, 0]));
  await db.concepts.where('lang').equals(lang).each((c) => {
    if (c.deletedAt === undefined && c.lessonId && counts.has(c.lessonId)) {
      counts.set(c.lessonId, (counts.get(c.lessonId) ?? 0) + 1);
    }
  });
  return counts;
}

export interface LessonUndo {
  lessonId: string;
  conceptIds: string[];
}

export async function previewLessonDelete(id: string): Promise<{ concepts: number }> {
  const concepts = await db.concepts.filter((c) => c.deletedAt === undefined && c.lessonId === id).count();
  return { concepts };
}

// Deleting a lesson never deletes words: they only lose the lesson. The undo
// brings the lesson and its words back.
export async function deleteLesson(id: string): Promise<LessonUndo> {
  const members = await db.concepts.filter((c) => c.lessonId === id).toArray();
  for (const c of members) await conceptRepository.update(c.id, { lessonId: undefined });
  await lessonRepository.softDelete(id);
  return { lessonId: id, conceptIds: members.map((c) => c.id) };
}

export async function restoreLesson(undo: LessonUndo): Promise<void> {
  await lessonRepository.update(undo.lessonId, { deletedAt: undefined });
  for (const id of undo.conceptIds) await conceptRepository.update(id, { lessonId: undo.lessonId });
}

// The decks a concept is in right now (live decks only).
async function liveDeckIdsOf(concept: Concept): Promise<string[]> {
  const live = new Set((await wordSetRepository.listActive()).map((s) => s.id));
  return (concept.setIds ?? []).filter((id) => live.has(id));
}

export type AssignResult = { ok: true } | { ok: false; reason: 'missing' | 'other-deck' };

// Puts a word in a lesson (or takes it out with `undefined`). The lesson must
// belong to one of the word's decks.
export async function assignLesson(conceptId: string, lessonId: string | undefined): Promise<AssignResult> {
  const concept = await conceptRepository.getById(conceptId);
  if (!concept || concept.deletedAt !== undefined) return { ok: false, reason: 'missing' };
  if (lessonId === undefined) {
    if (concept.lessonId !== undefined) await conceptRepository.update(conceptId, { lessonId: undefined });
    return { ok: true };
  }
  const lesson = await lessonRepository.getById(lessonId);
  if (!lesson || lesson.deletedAt !== undefined || lesson.lang !== concept.lang) return { ok: false, reason: 'missing' };
  if (!lessonFitsDecks(lesson, await liveDeckIdsOf(concept))) return { ok: false, reason: 'other-deck' };
  if (concept.lessonId !== lessonId) await conceptRepository.update(conceptId, { lessonId });
  return { ok: true };
}
