import { SETTINGS_ID } from '../db/defaults';
import { settingsRepository } from '../db/repositories';
import type { StudySettings } from '../db/types';

export const defaultStudySettings: Required<StudySettings> = {
  sessionCount: 10,
  passagePassPercent: 90,
  passageMaxRetries: 2,
};

export const SESSION_COUNT_RANGE = { min: 3, max: 50 };
export const PASS_PERCENT_RANGE = { min: 1, max: 100 };
// 0 retries = never ask to repeat a passage.
export const MAX_RETRIES_RANGE = { min: 0, max: 10 };

function inRange(n: unknown, range: { min: number; max: number }): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= range.min && n <= range.max;
}

// Stored values are re-checked on every read: a hand-edited or restored
// value that makes no sense falls back to the default instead of breaking
// the session screens.
export function sanitizeStudy(value: Partial<StudySettings> | undefined): Required<StudySettings> {
  const d = defaultStudySettings;
  return {
    sessionCount: inRange(value?.sessionCount, SESSION_COUNT_RANGE) ? value!.sessionCount! : d.sessionCount,
    passagePassPercent: inRange(value?.passagePassPercent, PASS_PERCENT_RANGE)
      ? value!.passagePassPercent!
      : d.passagePassPercent,
    passageMaxRetries: inRange(value?.passageMaxRetries, MAX_RETRIES_RANGE)
      ? value!.passageMaxRetries!
      : d.passageMaxRetries,
  };
}

export async function loadStudy(): Promise<Required<StudySettings>> {
  const settings = await settingsRepository.getById(SETTINGS_ID);
  return sanitizeStudy(settings?.study);
}

export async function saveStudy(study: Partial<StudySettings>): Promise<void> {
  await settingsRepository.update(SETTINGS_ID, { study: sanitizeStudy(study) });
}

// Share of right gaps, 0–1.
export function gapAccuracy(perField: Record<string, boolean>): number {
  const values = Object.values(perField);
  return values.length === 0 ? 1 : values.filter(Boolean).length / values.length;
}

// A passage must be repeated when it scored under the pass mark and repeats
// are still allowed.
export function needsRetry(accuracy: number, retriesDone: number, study: Required<StudySettings>): boolean {
  return (
    study.passageMaxRetries > retriesDone &&
    Math.round(accuracy * 100 * 1000) / 1000 < study.passagePassPercent
  );
}
