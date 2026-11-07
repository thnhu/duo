import type { Lesson } from '../db/types';

// A lesson lives inside one deck (or General). A concept keeps its lesson only
// while it is still in that deck: General = in no live deck.
export function lessonFitsDecks(lesson: Pick<Lesson, 'setId'>, liveSetIds: string[]): boolean {
  return lesson.setId ? liveSetIds.includes(lesson.setId) : liveSetIds.length === 0;
}
