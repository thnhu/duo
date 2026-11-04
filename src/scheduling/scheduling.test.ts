import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createDefaultAttributes } from '../db/defaults';
import { conceptRepository, exampleRepository, scheduleStateRepository } from '../db/repositories';
import type { Concept, Example, ScheduleState } from '../db/types';
import { exerciseModules } from '../exercises';
import { countDueWords, loadReviewItems } from '../exercises/review';
import { recordAnswer } from '../exercises/session';
import { RETRY_DELAY_MS, sm2 } from './sm2';
import { activeScheduler, schedulers } from './index';
import { listDue, recordSchedule } from './store';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 0, 10, 12).getTime();

function step(prev: ScheduleState | undefined, correct: boolean, now: number) {
  return sm2.schedule(prev, { exampleId: 'e', correct, now });
}

describe('SM-2 scheduler', () => {
  it('is registered and is the active scheduler', () => {
    expect(schedulers.has('sm2')).toBe(true);
    expect(activeScheduler().id).toBe('sm2');
  });

  it('grows the interval 1 -> 6 -> x ease on right answers made when due', () => {
    const a = step(undefined, true, T0);
    expect(a.intervalDays).toBe(1);
    expect(a.due).toBe(T0 + DAY);
    const b = step(a, true, a.due);
    expect(b.intervalDays).toBe(6);
    const c = step(b, true, b.due);
    expect(c.intervalDays).toBe(15); // 6 x 2.5
    expect(c.lapses).toBe(0);
  });

  it('a wrong answer brings the example back soon and lowers the ease (G1)', () => {
    const grown = step(step(undefined, true, T0), true, T0 + DAY);
    const wrong = step(grown, false, T0 + 7 * DAY);
    expect(wrong.intervalDays).toBe(0);
    expect(wrong.due).toBe(T0 + 7 * DAY + RETRY_DELAY_MS);
    expect(wrong.lapses).toBe(1);
    expect(wrong.ease).toBe(2.3);
    // After the retry is right, it starts climbing again from 1 day.
    expect(step(wrong, true, wrong.due).intervalDays).toBe(1);
  });

  it('ease never drops below 1.3', () => {
    let state = step(undefined, false, T0);
    for (let i = 0; i < 10; i++) state = step(state, false, state.due);
    expect(state.ease).toBe(1.3);
  });

  it('extra practice before the due date does not push the schedule out', () => {
    const first = step(undefined, true, T0);
    const early = step(first, true, T0 + 1000);
    expect(early).toBe(first);
  });
});

function concept(id: string, overrides: Partial<Concept> = {}): Concept {
  return {
    id, dictionaryId: 'd', lang: 'de', text: id, meanings: [],
    grammar: {
      gender: 'der', plural: 'Xe',
      verbForms: { infinitiv: 'machen' },
    },
    verification: 'unverified', source: { type: 'import' }, status: 'loaded',
    createdAt: 1, updatedAt: 1, ...overrides,
  };
}

function example(id: string, conceptId: string | undefined, overrides: Partial<Example> = {}): Example {
  return {
    id, dictionaryId: 'd', text: `Der ${id}`, targetConceptId: conceptId,
    attributes: createDefaultAttributes(), attributesStatus: 'empty',
    verification: 'unverified', createdAt: 1, updatedAt: 1, ...overrides,
  };
}

async function setDue(exampleId: string, due: number) {
  await scheduleStateRepository.add({ exampleId, due, intervalDays: 1, ease: 2.5, lapses: 0, updatedAt: 1 });
}

describe('review sessions', () => {
  beforeEach(async () => {
    await db.concepts.clear();
    await db.examples.clear();
    await db.reviewLogs.clear();
    await db.scheduleStates.clear();
  });

  it('records a schedule for the example on every answer', async () => {
    await conceptRepository.add(concept('c1'));
    await exampleRepository.add(example('e1', 'c1'));
    const module = exerciseModules.get('de.noun-gender-plural')!;
    const exercise = {
      moduleId: module.id, conceptId: 'c1', exampleId: 'e1', title: '', prompt: 'x',
      fields: [
        { key: 'gender', label: 'g', type: 'choice' },
        { key: 'plural', label: 'p', type: 'text' },
      ],
      expected: { gender: ['der'], plural: ['Xe'] },
    };
    await recordAnswer(module, exercise as never, { gender: 'der', plural: 'Xe' }, 800, () => T0);
    const state = await scheduleStateRepository.getById('e1');
    expect(state?.due).toBe(T0 + DAY);
    await recordAnswer(module, exercise as never, { gender: 'das', plural: 'Xe' }, 800, () => T0 + 1000);
    expect((await scheduleStateRepository.getById('e1'))?.lapses).toBe(1);
  });

  it('lists only due examples that still exist', async () => {
    await conceptRepository.add(concept('c1'));
    await exampleRepository.add(example('due', 'c1'));
    await exampleRepository.add(example('later', 'c1'));
    await exampleRepository.add(example('gone', 'c1'));
    await setDue('due', T0 - 1);
    await setDue('later', T0 + DAY);
    await setDue('gone', T0 - 1);
    await exampleRepository.softDelete('gone');
    expect((await listDue(T0)).map((s) => s.exampleId)).toEqual(['due']);
    expect(await countDueWords(T0)).toBe(1);
    expect(await countDueWords(T0 - DAY)).toBe(0);
  });

  it('review asks only words with a due example, and includes acquired ones', async () => {
    await conceptRepository.add(concept('due1'));
    await conceptRepository.add(concept('acq', { status: 'acquired' }));
    await conceptRepository.add(concept('notdue'));
    for (const id of ['due1', 'acq', 'notdue']) await exampleRepository.add(example(`e-${id}`, id));
    await setDue('e-due1', T0 - 5);
    await setDue('e-acq', T0 - 1);
    await setDue('e-notdue', T0 + DAY);
    const items = await loadReviewItems({ kind: 'review', count: 10, now: T0 });
    expect(items.map((i) => i.concept.id).sort()).toEqual(['acq', 'due1']);
  });

  it('review respects the count and takes the most overdue words first', async () => {
    for (const [id, due] of [['a', T0 - 3], ['b', T0 - 1], ['c', T0 - 2]] as const) {
      await conceptRepository.add(concept(id));
      await exampleRepository.add(example(`e-${id}`, id));
      await setDue(`e-${id}`, due);
    }
    const items = await loadReviewItems({ kind: 'review', count: 2, now: T0 });
    expect(items.map((i) => i.concept.id).sort()).toEqual(['a', 'c']);
  });

  it('next time a word comes back through a different example and a different drill', async () => {
    await conceptRepository.add(concept('c1'));
    await exampleRepository.add(example('e1', 'c1'));
    await exampleRepository.add(example('e2', 'c1'));
    await setDue('e1', T0 - 1);
    await setDue('e2', T0 - 1);
    // Last time: e1 with the gender drill.
    await db.reviewLogs.add({
      id: 'l1', conceptId: 'c1', exampleId: 'e1', exerciseType: 'de.noun-gender-plural',
      correct: true, responseTimeMs: 900, timestamp: T0 - 10,
    });
    for (let seed = 0; seed < 20; seed++) {
      let n = seed + 1;
      const rng = () => ((n = (n * 16807) % 2147483647) / 2147483647);
      const [item] = await loadReviewItems({ kind: 'review', count: 1, now: T0, rng });
      expect(item.example.id).toBe('e2');
      expect(item.module.id).not.toBe('de.noun-gender-plural');
    }
  });

  it('falls back to the same example/drill when there is no other choice', async () => {
    await conceptRepository.add(concept('c1', { grammar: { gender: 'der', plural: 'Xe' } }));
    await exampleRepository.add(example('e1', 'c1', { isMinimal: true }));
    await setDue('e1', T0 - 1);
    await db.reviewLogs.add({
      id: 'l1', conceptId: 'c1', exampleId: 'e1', exerciseType: 'de.noun-gender-plural',
      correct: true, responseTimeMs: 900, timestamp: T0 - 10,
    });
    const items = await loadReviewItems({ kind: 'review', count: 1, now: T0 });
    expect(items).toHaveLength(1);
  });

  it('flash draws from words that are not due and skips inbox sentences', async () => {
    await conceptRepository.add(concept('c1'));
    await exampleRepository.add(example('e1', 'c1'));
    await exampleRepository.add(example('inbox', undefined));
    const flash = await loadReviewItems({ kind: 'flash', count: 5, now: T0 });
    expect(flash.map((i) => i.concept.id)).toEqual(['c1']);
    expect(await loadReviewItems({ kind: 'review', count: 5, now: T0 })).toEqual([]);
  });

  it('a wrong review answer makes the word due again within minutes', async () => {
    await recordSchedule('e1', true, T0);
    const wrong = await recordSchedule('e1', false, T0 + 2 * DAY);
    expect(wrong.due - (T0 + 2 * DAY)).toBe(RETRY_DELAY_MS);
  });
});
