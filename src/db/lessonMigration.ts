import type { Concept, Lesson, WordSet } from './types';

// Turns the old free-text `Concept.source.lesson` into real lessons (schema v8,
// Bản 8). Pure, so it can be tested without a database.
//
// - A concept goes to the lesson of that name in its first live deck, or in the
//   General deck (no `setId`) when it is in none.
// - Lesson order inside a deck follows the order the concepts were created,
//   which is the order of the file they came from.
// - The lesson id is derived from language + deck + name, so two devices that
//   migrate the same data make the same lessons instead of duplicates when
//   they sync.

export interface LessonMigrationPlan {
  now: number;
  lessons: Lesson[];
  // [conceptId, lessonId]
  assignments: Array<[string, string]>;
}

export function lessonKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function migratedLessonId(lang: string, setId: string | undefined, name: string): string {
  return `lesson-${lang}-${setId ?? 'general'}-${encodeURIComponent(lessonKey(name))}`;
}

export function planLessonMigration(concepts: Concept[], sets: WordSet[], now: number): LessonMigrationPlan {
  // Old or hand-made rows may miss fields: the upgrade must never fail on them.
  const liveSets = new Set(sets.filter((s) => s.deletedAt === undefined).map((s) => s.id));
  const lessons = new Map<string, Lesson>();
  const nextOrder = new Map<string, number>();
  const assignments: Array<[string, string]> = [];

  const ordered = concepts
    .filter((c) => c.deletedAt === undefined && (c.source?.lesson ?? '').trim() !== '')
    .sort((a, b) => a.createdAt - b.createdAt || (a.source?.row ?? 0) - (b.source?.row ?? 0));

  for (const concept of ordered) {
    const name = concept.source!.lesson!.trim().replace(/\s+/g, ' ');
    const setId = (concept.setIds ?? []).find((id) => liveSets.has(id));
    const id = migratedLessonId(concept.lang, setId, name);
    if (!lessons.has(id)) {
      const deckKey = `${concept.lang}|${setId ?? ''}`;
      const order = nextOrder.get(deckKey) ?? 0;
      nextOrder.set(deckKey, order + 1);
      lessons.set(id, { id, lang: concept.lang, name, order, ...(setId ? { setId } : {}), updatedAt: now });
    }
    assignments.push([concept.id, id]);
  }
  return { now, lessons: [...lessons.values()], assignments };
}
