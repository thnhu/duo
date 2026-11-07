import type { Lesson } from '../db/types';

// A lesson lives inside one deck (or General). A concept keeps its lesson only
// while it is still in that deck: General = in no live deck.
export function lessonFitsDecks(lesson: Pick<Lesson, 'setId'>, liveSetIds: string[]): boolean {
  return lesson.setId ? liveSetIds.includes(lesson.setId) : liveSetIds.length === 0;
}

// Empty selection = no restriction; otherwise the concept must be in one of the
// selected lessons (used by Learn and Review).
export function inSelectedLessons(
  concept: { lessonId?: string },
  selectedIds: string[] | undefined,
): boolean {
  if (!selectedIds || selectedIds.length === 0) return true;
  return !!concept.lessonId && selectedIds.includes(concept.lessonId);
}
