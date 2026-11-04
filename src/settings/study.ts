import { SETTINGS_ID } from '../db/defaults';
import { settingsRepository } from '../db/repositories';
import type { StudySettings } from '../db/types';

export const defaultStudySettings: StudySettings = { sessionCount: 10 };

export const SESSION_COUNT_RANGE = { min: 3, max: 50 };

// Stored values are re-checked on every read: a hand-edited or restored
// value that makes no sense falls back to the default instead of breaking
// the session screens.
export function sanitizeStudy(value: Partial<StudySettings> | undefined): StudySettings {
  const n = value?.sessionCount;
  const ok =
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= SESSION_COUNT_RANGE.min &&
    n <= SESSION_COUNT_RANGE.max;
  return { sessionCount: ok ? n : defaultStudySettings.sessionCount };
}

export async function loadStudy(): Promise<StudySettings> {
  const settings = await settingsRepository.getById(SETTINGS_ID);
  return sanitizeStudy(settings?.study);
}

export async function saveStudy(study: StudySettings): Promise<void> {
  await settingsRepository.update(SETTINGS_ID, { study: sanitizeStudy(study) });
}
