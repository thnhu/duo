import { exampleRepository, scheduleStateRepository } from '../db/repositories';
import type { ScheduleState } from '../db/types';
import { activeScheduler } from './index';

// Applies an answer to the example's schedule and saves it.
export async function recordSchedule(
  exampleId: string,
  correct: boolean,
  now: number,
): Promise<ScheduleState> {
  const previous = await scheduleStateRepository.getById(exampleId);
  const next = activeScheduler().schedule(previous, { exampleId, correct, now });
  if (next === previous) return next;
  if (previous) await scheduleStateRepository.update(exampleId, next);
  else await scheduleStateRepository.add(next);
  return next;
}

// Schedules whose example is due now and still exists with a concept.
export async function listDue(now: number): Promise<ScheduleState[]> {
  const [states, examples] = await Promise.all([
    scheduleStateRepository.listAll(),
    exampleRepository.listActive(),
  ]);
  const live = new Set(examples.filter((e) => e.targetConceptId).map((e) => e.id));
  return states.filter((s) => s.due <= now && live.has(s.exampleId));
}
