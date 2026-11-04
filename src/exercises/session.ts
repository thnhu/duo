import { refreshAcquisition, type StatusChange } from '../acquisition/update';
import { createId } from '../core/id';
import { conceptRepository, exampleRepository, reviewLogRepository } from '../db/repositories';
import type { Concept, Example, Lang, ReviewLog } from '../db/types';
import type { Answer, Exercise, ExerciseModule, GradeResult } from './types';

// Runner side of an exercise session: choosing what to ask, and recording
// each answer. Independent of any particular exercise type.

export interface Pair {
  concept: Concept;
  example: Example;
}

export interface PairFilter {
  lang: Lang;
  // Only words of this lesson (spec A1d), if set.
  lesson?: string;
}

// Concepts that can be drilled with this module, each with one of its
// eligible examples. Words already `acquired` are left out; depth-only
// words are not part of the "Rộng" drills.
export async function loadPairs(
  module: ExerciseModule,
  filter: PairFilter,
  rng: () => number = Math.random,
): Promise<Pair[]> {
  const [concepts, examples] = await Promise.all([
    conceptRepository.listActive(),
    exampleRepository.listActive(),
  ]);
  const byConcept = new Map<string, Example[]>();
  for (const example of examples) {
    if (!example.targetConceptId) continue; // inbox sentences have no concept yet
    const list = byConcept.get(example.targetConceptId) ?? [];
    list.push(example);
    byConcept.set(example.targetConceptId, list);
  }

  const pairs: Pair[] = [];
  for (const concept of concepts) {
    if (!module.languages.includes(concept.lang) || concept.lang !== filter.lang) continue;
    if ((concept.mode ?? 'breadth') !== module.mode) continue;
    if (concept.status === 'acquired') continue;
    if (filter.lesson && concept.source.lesson !== filter.lesson) continue;
    const usable = (byConcept.get(concept.id) ?? []).filter((e) => module.isEligible(concept, e));
    if (usable.length === 0) continue;
    // Real sentences make better drills than the auto-created minimal one.
    const real = usable.filter((e) => !e.isMinimal);
    const choices = real.length > 0 ? real : usable;
    pairs.push({ concept, example: choices[Math.floor(rng() * choices.length)] });
  }
  return pairs;
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// A session asks each word at most once; when PO wants more questions than
// there are words, the list is simply shorter.
export function buildSession(pairs: Pair[], count: number, rng: () => number): Pair[] {
  return shuffle(pairs, rng).slice(0, Math.max(0, count));
}

export interface AnswerRecord {
  exercise: Exercise;
  answer: Answer;
  result: GradeResult;
  responseTimeMs: number;
  // Set when this answer moved the word between `loaded` and `acquired`.
  statusChange?: StatusChange;
}

// Grades an answer and stores it (spec D1): correct/incorrect, reaction
// time, drill type and the example used. Then re-evaluates the word's
// `acquired` status from its logs (spec section 2, M5).
export async function recordAnswer(
  module: ExerciseModule,
  exercise: Exercise,
  answer: Answer,
  responseTimeMs: number,
  now: () => number = Date.now,
): Promise<AnswerRecord> {
  const result = module.grade(answer, exercise);
  const log: ReviewLog = {
    id: createId(),
    conceptId: exercise.conceptId,
    exampleId: exercise.exampleId,
    exerciseType: exercise.moduleId,
    correct: result.correct,
    responseTimeMs,
    timestamp: now(),
  };
  await reviewLogRepository.add(log);
  const statusChange = (await refreshAcquisition(exercise.conceptId)) ?? undefined;
  return { exercise, answer, result, responseTimeMs, statusChange };
}

export interface SessionSummary {
  answered: number;
  correct: number;
  averageMs: number;
  // Words that became `acquired` in this session; shown only at the end so
  // the drill is never interrupted (journey G5).
  newlyAcquired: Array<{ conceptId: string; prompt: string }>;
  // Words answered wrong, for the "từ yếu" list.
  weak: Array<{ conceptId: string; prompt: string }>;
}

export function summarize(records: AnswerRecord[]): SessionSummary {
  const correct = records.filter((r) => r.result.correct).length;
  const total = records.reduce((sum, r) => sum + r.responseTimeMs, 0);
  return {
    answered: records.length,
    correct,
    averageMs: records.length ? Math.round(total / records.length) : 0,
    newlyAcquired: records
      .filter((r) => r.statusChange?.after === 'acquired')
      .map((r) => ({ conceptId: r.exercise.conceptId, prompt: r.exercise.prompt })),
    weak: records
      .filter((r) => !r.result.correct)
      .map((r) => ({ conceptId: r.exercise.conceptId, prompt: r.exercise.prompt })),
  };
}
