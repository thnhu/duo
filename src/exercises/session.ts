import { refreshAcquisition, type StatusChange } from '../acquisition/update';
import { createId } from '../core/id';
import { loadLibrary } from './library';
import { reviewLogRepository } from '../db/repositories';
import type { Concept, Example, Lang, ReviewLog } from '../db/types';
import { recordSchedule } from '../scheduling/store';
import { inSelectedSets } from '../wordsets';
import type { Answer, Exercise, ExerciseModule, GradeResult } from './types';

// Runner side of an exercise session: choosing what to ask, and recording
// each answer. Independent of any particular exercise type.

export interface Pair {
  concept: Concept;
  example: Example;
}

// A question to ask: a word, one of its examples and the drill to use.
// Review and flash rounds mix drills, so the module travels with the item.
export interface SessionItem extends Pair {
  module: ExerciseModule;
}

// Passage gaps are only for the passage drill, and the passage drill only
// takes passage gaps: a gap is not a standalone sentence for the other drills.
export function acceptsExample(module: ExerciseModule, example: Example): boolean {
  return Boolean(module.passage) === (example.passageId !== undefined);
}

export function defaultOptions(module: ExerciseModule): Record<string, string> {
  return Object.fromEntries((module.options ?? []).map((o) => [o.id, o.default]));
}

export interface PairFilter {
  lang: Lang;
  // Only words of this lesson (spec A1d), if set.
  lesson?: string;
  // Only words in one of these word sets (M13); empty/undefined = all.
  setIds?: string[];
}

// Concepts that can be drilled with this module, each with one of its
// eligible examples. Words already `acquired` are left out; depth-only
// words are not part of the "Rộng" drills.
export async function loadPairs(
  module: ExerciseModule,
  filter: PairFilter,
  rng: () => number = Math.random,
): Promise<Pair[]> {
  const library = await loadLibrary();
  const { concepts, examples } = { concepts: library.concepts, examples: library.examples! };
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
    if (!inSelectedSets(concept, filter.setIds)) continue;
    const usable = (byConcept.get(concept.id) ?? []).filter(
      (e) => acceptsExample(module, e) && module.isEligible(concept, e, library),
    );
    if (usable.length === 0) continue;
    // Real sentences make better drills than the auto-created minimal one.
    const real = usable.filter((e) => !e.isMinimal);
    const choices = real.length > 0 ? real : usable;
    const pair = { concept, example: choices[Math.floor(rng() * choices.length)] };
    // One question per passage, however many of its words are due.
    if (module.passage && pairs.some((p) => p.example.passageId === pair.example.passageId)) continue;
    pairs.push(pair);
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
  if (exercise.parts && exercise.parts.length > 0) {
    // A passage: every gap is its own answer on its own example, and the time
    // is shared out so a long passage is not judged "slow" per word.
    const each = Math.round(responseTimeMs / exercise.parts.length);
    let statusChange: StatusChange | undefined;
    for (const part of exercise.parts) {
      const right = result.perField[part.field] === true;
      await reviewLogRepository.add({ ...log, id: createId(), conceptId: part.conceptId, exampleId: part.exampleId, correct: right, responseTimeMs: each });
      await recordSchedule(part.exampleId, right, log.timestamp);
      const change = (await refreshAcquisition(part.conceptId)) ?? undefined;
      if (change && (part.conceptId === exercise.conceptId || !statusChange)) statusChange = change;
    }
    return { exercise, answer, result, responseTimeMs, statusChange };
  }
  await reviewLogRepository.add(log);
  // The example's own schedule moves with every answer (spec D4).
  await recordSchedule(exercise.exampleId, result.correct, log.timestamp);
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
