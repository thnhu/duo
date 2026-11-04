import type { AcquisitionCriteria, AcquisitionStatus, ReviewLog } from '../db/types';

// Spec section 2: when does a concept count as `acquired`?
// A concept is acquired once PO answered correctly AND fast enough (per drill
// type), in enough different examples, over enough different days. All the
// thresholds come from Settings.acquisitionCriteria — nothing is hard-coded.

export function maxResponseTimeFor(criteria: AcquisitionCriteria, exerciseType: string): number {
  return criteria.maxResponseTimeMsByExerciseType[exerciseType] ?? criteria.maxResponseTimeMsDefault;
}

// "Good" answer = correct and within the time limit of its drill type.
export function isQualifying(log: ReviewLog, criteria: AcquisitionCriteria): boolean {
  return log.correct && log.responseTimeMs <= maxResponseTimeFor(criteria, log.exerciseType);
}

// Local calendar day, so "3 different days" matches PO's own days.
function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export interface AcquisitionProgress {
  correct: number;
  contexts: number;
  days: number;
  met: boolean;
}

// Progress towards the criteria (journey J8). `since` ignores older logs: it
// is set when an acquired word slipped and went back to `loaded` (G6), so it
// has to earn its way up again.
export function computeProgress(
  logs: ReviewLog[],
  criteria: AcquisitionCriteria,
  since?: number,
): AcquisitionProgress {
  const good = logs.filter(
    (log) => (since === undefined || log.timestamp > since) && isQualifying(log, criteria),
  );
  const contexts = new Set(good.map((log) => log.exampleId)).size;
  const days = new Set(good.map((log) => dayKey(log.timestamp))).size;
  return {
    correct: good.length,
    contexts,
    days,
    met:
      good.length >= criteria.minCorrect &&
      contexts >= criteria.minDistinctContexts &&
      days >= criteria.minDistinctDays,
  };
}

export interface AcquisitionResult {
  status: AcquisitionStatus;
  // New value for Concept.progressResetAt (undefined = leave as is).
  resetAt?: number;
}

// Next status of a concept given all its logs.
//   unknown/loaded -> acquired  when the criteria are met
//   acquired -> loaded          when the latest answer is wrong or too slow (G6)
export function nextStatus(
  current: AcquisitionStatus,
  logs: ReviewLog[],
  criteria: AcquisitionCriteria,
  resetAt?: number,
): AcquisitionResult {
  if (logs.length === 0) return { status: current };
  if (current === 'acquired') {
    const latest = logs.reduce((a, b) => (b.timestamp >= a.timestamp ? b : a));
    if (!isQualifying(latest, criteria)) return { status: 'loaded', resetAt: latest.timestamp };
    return { status: 'acquired' };
  }
  return { status: computeProgress(logs, criteria, resetAt).met ? 'acquired' : 'loaded' };
}
