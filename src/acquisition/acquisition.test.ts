import { beforeEach, describe, expect, it } from 'vitest';
import { computeProgress, isQualifying, nextStatus } from './index';
import { refreshAcquisition } from './update';
import { db } from '../db/schema';
import { createDefaultAttributes, defaultAcquisitionCriteria } from '../db/defaults';
import { conceptRepository, exampleRepository, settingsRepository } from '../db/repositories';
import { createDefaultSettings } from '../db/defaults';
import type { AcquisitionCriteria, Concept, ReviewLog } from '../db/types';
import { recordAnswer, summarize } from '../exercises/session';
import { exerciseModules } from '../exercises';

const DAY = 24 * 60 * 60 * 1000;
// Noon, so adding whole days never crosses a calendar day by accident.
const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
const criteria: AcquisitionCriteria = { ...defaultAcquisitionCriteria };

function log(day: number, exampleId: string, overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: `l-${day}-${exampleId}-${Math.random()}`,
    conceptId: 'c1',
    exampleId,
    exerciseType: 'de.dictation',
    correct: true,
    responseTimeMs: 1500,
    timestamp: T0 + day * DAY,
    ...overrides,
  };
}

// 5 good answers over 3 examples and 3 days: exactly meets the defaults.
const enough = [log(0, 'a'), log(0, 'b'), log(1, 'c'), log(1, 'a'), log(2, 'b')];

describe('acquisition criteria', () => {
  it('counts only correct answers within the time limit', () => {
    expect(isQualifying(log(0, 'a'), criteria)).toBe(true);
    expect(isQualifying(log(0, 'a', { correct: false }), criteria)).toBe(false);
    expect(isQualifying(log(0, 'a', { responseTimeMs: 9000 }), criteria)).toBe(false);
  });

  it('ignores time for passage gaps', () => {
    const slowGap = log(0, 'a', { exerciseType: 'de.passage-cloze', responseTimeMs: 600000 });
    expect(isQualifying(slowGap, criteria)).toBe(true);
    expect(isQualifying({ ...slowGap, exerciseType: 'en.passage-cloze' }, criteria)).toBe(true);
    expect(isQualifying({ ...slowGap, correct: false }, criteria)).toBe(false);
  });

  it('uses a per-drill-type time limit when configured', () => {
    const custom = { ...criteria, maxResponseTimeMsByExerciseType: { 'de.dictation': 10000 } };
    const slow = log(0, 'a', { responseTimeMs: 9000 });
    expect(isQualifying(slow, custom)).toBe(true);
    expect(isQualifying({ ...slow, exerciseType: 'de.verb-conjugation' }, custom)).toBe(false);
  });

  it('is met only when count, examples and days all reach the thresholds', () => {
    expect(computeProgress(enough, criteria)).toEqual({ correct: 5, contexts: 3, days: 3, met: true });
    // Many answers but a single example: not acquired.
    const oneExample = [0, 1, 2, 3, 4, 5].map((d) => log(d, 'a'));
    expect(computeProgress(oneExample, criteria)).toMatchObject({ contexts: 1, met: false });
    // Many answers, all the same day: not acquired.
    const oneDay = ['a', 'b', 'c', 'a', 'b', 'c'].map((e) => log(0, e));
    expect(computeProgress(oneDay, criteria)).toMatchObject({ days: 1, met: false });
    // Not enough correct answers.
    expect(computeProgress(enough.slice(0, 4), criteria).met).toBe(false);
  });

  it('wrong or slow answers do not count towards the target', () => {
    const mixed = [...enough.slice(0, 4), log(2, 'b', { correct: false })];
    expect(computeProgress(mixed, criteria)).toMatchObject({ correct: 4, met: false });
  });

  it('simulated sessions move loaded -> acquired exactly when the criteria are met', () => {
    const logs: ReviewLog[] = [];
    let status: Concept['status'] = 'loaded';
    const history: string[] = [];
    for (const entry of enough) {
      logs.push(entry);
      status = nextStatus(status, logs, criteria).status;
      history.push(status);
    }
    expect(history).toEqual(['loaded', 'loaded', 'loaded', 'loaded', 'acquired']);
  });

  it('treats an `unknown` word with answers as loaded', () => {
    expect(nextStatus('unknown', [log(0, 'a')], criteria).status).toBe('loaded');
  });

  it('drops an acquired word back to loaded after a wrong answer, and it must earn it again', () => {
    const slip = log(5, 'a', { correct: false });
    const demoted = nextStatus('acquired', [...enough, slip], criteria);
    expect(demoted).toEqual({ status: 'loaded', resetAt: slip.timestamp });

    // Old answers no longer count: the word is not re-acquired by one good answer.
    const later = [...enough, slip, log(6, 'a')];
    expect(nextStatus('loaded', later, criteria, slip.timestamp).status).toBe('loaded');
    // A fresh run of good answers re-acquires it.
    const fresh = [...enough, slip, ...enough.map((l, i) => ({ ...l, id: `f${i}`, timestamp: l.timestamp + 10 * DAY }))];
    expect(nextStatus('loaded', fresh, criteria, slip.timestamp).status).toBe('acquired');
  });

  it('keeps an acquired word acquired while its latest answer is good', () => {
    expect(nextStatus('acquired', [...enough, log(6, 'a')], criteria).status).toBe('acquired');
  });
});

describe('acquisition with the database', () => {
  beforeEach(async () => {
    await db.concepts.clear();
    await db.examples.clear();
    await db.reviewLogs.clear();
    await db.settings.clear();
    await settingsRepository.add(createDefaultSettings());
    await conceptRepository.add({
      id: 'c1', dictionaryId: 'd', lang: 'de', text: 'Apfel', meanings: [],
      grammar: { gender: 'der', plural: 'Äpfel' },
      verification: 'unverified', source: { type: 'import' }, status: 'loaded',
      createdAt: 1, updatedAt: 1,
    });
    for (const id of ['a', 'b', 'c']) {
      await exampleRepository.add({
        id, dictionaryId: 'd', text: 'Der Apfel', targetConceptId: 'c1',
        attributes: createDefaultAttributes(), attributesStatus: 'empty',
        verification: 'unverified', createdAt: 1, updatedAt: 1,
      });
    }
  });

  it('recordAnswer promotes the word and reports it in the session summary', async () => {
    const module = exerciseModules.get('de.noun-gender-plural')!;
    const exercise = (exampleId: string) => ({
      moduleId: module.id, conceptId: 'c1', exampleId, title: '', prompt: 'Apfel',
      fields: [], expected: { gender: 'der', plural: 'Äpfel' },
    });
    const answer = { gender: 'der', plural: 'Äpfel' };
    const base = T0;
    const records = [];
    // 5 good answers on 3 days and 3 examples (clock injected).
    const plan: Array<[string, number]> = [['a', 0], ['b', 0], ['c', 1], ['a', 1], ['b', 2]];
    for (const [exampleId, day] of plan) {
      records.push(
        await recordAnswer(module, exercise(exampleId) as never, answer as never, 1000, () => base + day * DAY),
      );
    }
    expect(records.map((r) => r.statusChange?.after)).toEqual([undefined, undefined, undefined, undefined, 'acquired']);
    expect((await conceptRepository.getById('c1'))?.status).toBe('acquired');
    expect(summarize(records).newlyAcquired).toHaveLength(1);
  });

  it('refreshAcquisition does nothing when the status would not change', async () => {
    expect(await refreshAcquisition('c1')).toBeNull();
    expect(await refreshAcquisition('missing')).toBeNull();
  });
});
