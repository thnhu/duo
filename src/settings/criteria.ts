import { defaultAcquisitionCriteria } from '../db/defaults';
import type { AcquisitionCriteria } from '../db/types';

// Form <-> AcquisitionCriteria for the Settings screen. The form works with
// strings (what the text boxes hold) and seconds (what PO thinks in); the
// stored criteria use numbers and milliseconds.

export interface CriteriaForm {
  minCorrect: string;
  minDistinctContexts: string;
  minDistinctDays: string;
  // Seconds.
  maxSeconds: string;
  // Per drill type, seconds; empty = use the general limit.
  secondsByType: Record<string, string>;
}

export const LIMITS = {
  minCorrect: { min: 1, max: 30, label: 'Số lần đúng tối thiểu' },
  minDistinctContexts: { min: 1, max: 10, label: 'Số example khác nhau tối thiểu' },
  minDistinctDays: { min: 1, max: 30, label: 'Số ngày khác nhau tối thiểu' },
} as const;

export const SECONDS_RANGE = { min: 1, max: 60 };

const toSeconds = (ms: number) => String(Math.round((ms / 1000) * 10) / 10);

export function toForm(criteria: AcquisitionCriteria): CriteriaForm {
  return {
    minCorrect: String(criteria.minCorrect),
    minDistinctContexts: String(criteria.minDistinctContexts),
    minDistinctDays: String(criteria.minDistinctDays),
    maxSeconds: toSeconds(criteria.maxResponseTimeMsDefault),
    secondsByType: Object.fromEntries(
      Object.entries(criteria.maxResponseTimeMsByExerciseType).map(([id, ms]) => [id, toSeconds(ms)]),
    ),
  };
}

export type ParseResult =
  | { ok: true; criteria: AcquisitionCriteria }
  | { ok: false; errors: string[] };

function wholeNumber(text: string, min: number, max: number, label: string, errors: string[]): number {
  const value = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`${label}: nhập số nguyên từ ${min} đến ${max}.`);
    return min;
  }
  return value;
}

function seconds(text: string, label: string, errors: string[]): number {
  const value = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(value) || value < SECONDS_RANGE.min || value > SECONDS_RANGE.max) {
    errors.push(`${label}: nhập số giây từ ${SECONDS_RANGE.min} đến ${SECONDS_RANGE.max}.`);
    return SECONDS_RANGE.min;
  }
  return Math.round(value * 1000);
}

// `labels` names the drill types in error messages (id -> label).
export function parseForm(form: CriteriaForm, labels: Record<string, string> = {}): ParseResult {
  const errors: string[] = [];
  const criteria: AcquisitionCriteria = {
    minCorrect: wholeNumber(form.minCorrect, LIMITS.minCorrect.min, LIMITS.minCorrect.max, LIMITS.minCorrect.label, errors),
    minDistinctContexts: wholeNumber(
      form.minDistinctContexts,
      LIMITS.minDistinctContexts.min,
      LIMITS.minDistinctContexts.max,
      LIMITS.minDistinctContexts.label,
      errors,
    ),
    minDistinctDays: wholeNumber(
      form.minDistinctDays,
      LIMITS.minDistinctDays.min,
      LIMITS.minDistinctDays.max,
      LIMITS.minDistinctDays.label,
      errors,
    ),
    maxResponseTimeMsDefault: seconds(form.maxSeconds, 'Thời gian phản xạ tối đa', errors),
    maxResponseTimeMsByExerciseType: {},
  };
  for (const [id, text] of Object.entries(form.secondsByType)) {
    if (text.trim() === '') continue;
    criteria.maxResponseTimeMsByExerciseType[id] = seconds(text, `Thời gian tối đa — ${labels[id] ?? id}`, errors);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, criteria };
}

export function defaultForm(): CriteriaForm {
  return toForm(defaultAcquisitionCriteria);
}
