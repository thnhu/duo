import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createDefaultSettings, defaultAcquisitionCriteria } from '../db/defaults';
import { conceptRepository, settingsRepository } from '../db/repositories';
import type { Concept, ReviewLog } from '../db/types';
import { loadCriteria, recomputeAcquisition, refreshAcquisition, saveCriteria } from '../acquisition/update';
import { defaultForm, parseForm, toForm } from './criteria';
import { defaultStudySettings, loadStudy, sanitizeStudy, saveStudy } from './study';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 0, 10, 12).getTime();

describe('criteria form', () => {
  it('shows the stored criteria in seconds and gives them back unchanged', () => {
    const stored = {
      ...defaultAcquisitionCriteria,
      maxResponseTimeMsDefault: 2500,
      maxResponseTimeMsByExerciseType: { 'de.dictation': 9000 },
    };
    const form = toForm(stored);
    expect(form).toMatchObject({ maxSeconds: '2.5', secondsByType: { 'de.dictation': '9' } });
    expect(parseForm(form)).toEqual({ ok: true, criteria: stored });
  });

  it('the default form parses back to the default criteria', () => {
    expect(parseForm(defaultForm())).toEqual({ ok: true, criteria: defaultAcquisitionCriteria });
  });

  it('an empty per-drill time means "use the general limit"', () => {
    const form = { ...defaultForm(), secondsByType: { 'de.dictation': '', 'en.cloze': ' 8,5 ' } };
    const parsed = parseForm(form);
    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) expect(parsed.criteria.maxResponseTimeMsByExerciseType).toEqual({ 'en.cloze': 8500 });
  });

  it('rejects empty, fractional or out-of-range values and names the drill', () => {
    const bad = {
      ...defaultForm(),
      minCorrect: '0',
      minDistinctContexts: '2.5',
      minDistinctDays: '',
      maxSeconds: '-1',
      secondsByType: { 'en.cloze': 'abc' },
    };
    const parsed = parseForm(bad, { 'en.cloze': 'Điền cụm vào câu' });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors).toHaveLength(5);
      expect(parsed.errors.join(' ')).toContain('Điền cụm vào câu');
    }
  });
});

describe('study settings', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await settingsRepository.add(createDefaultSettings());
  });

  it('defaults to 10 questions and survives a save', async () => {
    expect(await loadStudy()).toEqual(defaultStudySettings);
    await saveStudy({ sessionCount: 15 });
    expect(await loadStudy()).toEqual({ sessionCount: 15 });
  });

  it('settings saved before M9c (no study field) get the default', async () => {
    const stored = await settingsRepository.getById('default');
    expect(stored?.study).toBeUndefined();
    expect(await loadStudy()).toEqual(defaultStudySettings);
  });

  it('a nonsense stored value falls back instead of breaking sessions', () => {
    for (const bad of [0, 2, 51, 7.5, NaN, '10' as unknown as number]) {
      expect(sanitizeStudy({ sessionCount: bad })).toEqual(defaultStudySettings);
    }
    expect(sanitizeStudy(undefined)).toEqual(defaultStudySettings);
    expect(sanitizeStudy({ sessionCount: 3 })).toEqual({ sessionCount: 3 });
  });

  it('saving criteria changes what the rest of the app reads', async () => {
    await saveCriteria({ ...defaultAcquisitionCriteria, minDistinctContexts: 1 });
    expect((await loadCriteria()).minDistinctContexts).toBe(1);
  });
});

function word(id: string, overrides: Partial<Concept> = {}): Concept {
  return {
    id, dictionaryId: 'd', lang: 'de', text: id, meanings: [], verification: 'verified',
    source: { type: 'import' }, status: 'loaded', createdAt: 1, updatedAt: 1, ...overrides,
  };
}

function log(conceptId: string, day: number, exampleId: string, overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: `${conceptId}-${day}-${exampleId}`, conceptId, exampleId, exerciseType: 'de.dictation',
    correct: true, responseTimeMs: 1000, timestamp: T0 + day * DAY, ...overrides,
  };
}

describe('changing the thresholds', () => {
  beforeEach(async () => {
    for (const t of [db.concepts, db.reviewLogs, db.settings]) await t.clear();
    await settingsRepository.add(createDefaultSettings());
    // "one": one example only, 5 good answers on 5 days. "none": no answers.
    await conceptRepository.add(word('one'));
    await conceptRepository.add(word('none'));
    for (let d = 0; d < 5; d++) await db.reviewLogs.add(log('one', d, 'only'));
  });

  it('a word with a single example is not acquired under the default (3 examples)', async () => {
    expect(await refreshAcquisition('one')).toBeNull();
    expect((await conceptRepository.getById('one'))?.status).toBe('loaded');
  });

  it('lowering the examples needed acquires it at once; raising it takes it back', async () => {
    const lowered = { ...defaultAcquisitionCriteria, minDistinctContexts: 1 };
    await saveCriteria(lowered);
    expect(await recomputeAcquisition(lowered)).toEqual({ promoted: 1, demoted: 0 });
    expect((await conceptRepository.getById('one'))?.status).toBe('acquired');
    // Words with no answers are never touched.
    expect((await conceptRepository.getById('none'))?.status).toBe('loaded');

    // Same thresholds again: nothing to change.
    expect(await recomputeAcquisition(lowered)).toEqual({ promoted: 0, demoted: 0 });

    const stricter = { ...lowered, minCorrect: 8 };
    expect(await recomputeAcquisition(stricter)).toEqual({ promoted: 0, demoted: 1 });
    expect((await conceptRepository.getById('one'))?.status).toBe('loaded');
  });

  it('a tighter time limit stops slow answers from counting', async () => {
    const lowered = { ...defaultAcquisitionCriteria, minDistinctContexts: 1 };
    // 1 s answers pass a 4 s limit but not a 0.5 s limit.
    expect(await recomputeAcquisition(lowered)).toMatchObject({ promoted: 1 });
    const strictTime = { ...lowered, maxResponseTimeMsDefault: 500 };
    expect(await recomputeAcquisition(strictTime)).toEqual({ promoted: 0, demoted: 1 });
    // ...but a per-drill allowance for dictation brings it back.
    const allowance = { ...strictTime, maxResponseTimeMsByExerciseType: { 'de.dictation': 2000 } };
    expect(await recomputeAcquisition(allowance)).toEqual({ promoted: 1, demoted: 0 });
  });

  it('a word that slipped only counts answers after the slip', async () => {
    const lowered = { ...defaultAcquisitionCriteria, minDistinctContexts: 1 };
    await conceptRepository.update('one', { progressResetAt: T0 + 3 * DAY });
    // Only days 4 (one answer) are after the slip: 1 < 5 needed.
    expect(await recomputeAcquisition(lowered)).toEqual({ promoted: 0, demoted: 0 });
  });

  it('soft-deleted words are ignored', async () => {
    await conceptRepository.softDelete('one');
    const lowered = { ...defaultAcquisitionCriteria, minDistinctContexts: 1 };
    expect(await recomputeAcquisition(lowered)).toEqual({ promoted: 0, demoted: 0 });
  });
});
