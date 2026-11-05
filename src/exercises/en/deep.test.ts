import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { SETTINGS_ID, createDefaultSettings } from '../../db/defaults';
import { conceptRepository, reviewLogRepository, settingsRepository } from '../../db/repositories';
import type { ExampleAttributes } from '../../db/types';
import { saveExampleEdits } from '../../features/example/actions';
import { addExpression as addExpressionRaw, createDepthConcept, linkExample } from '../../depth';
import { refreshAcquisition, recomputeAcquisition } from '../../acquisition/update';
import { exerciseModules } from '../index';
import { loadLibrary } from '../library';
import { loadReviewItems } from '../review';
import { loadPairs, recordAnswer } from '../session';
import { buildSceneChoice, englishDeepLabel, englishDeepSituation, labelCount, pickLabelKeys } from './deep';

const DICT = 'dict-en';
const attrs = (patch: Partial<ExampleAttributes>): ExampleAttributes => ({
  tone: 'Neutral',
  mode: 'Neutral',
  register: 'Neutral',
  nuance: 'Neutral',
  dialect: 'Neutral',
  ...patch,
});

// Same-millisecond examples would tie on createdAt (flaky on fast machines).
const addExpression: typeof addExpressionRaw = async (concept, text) => {
  const example = await addExpressionRaw(concept, text);
  await new Promise((resolve) => setTimeout(resolve, 3));
  return example;
};

async function labelled(conceptId: string, text: string, patch: Partial<ExampleAttributes> | null) {
  const concept = (await conceptRepository.getById(conceptId))!;
  const e = await addExpression(concept, text);
  if (patch) await saveExampleEdits(e, { attributes: attrs(patch), note: '' });
  return (await db.examples.get(e.id))!;
}

async function quantity() {
  const c = await createDepthConcept(DICT, 'large quantity', 'số lượng nhiều');
  const lot = await labelled(c.id, 'a lot of', {});
  const bunch = await labelled(c.id, 'a bunch of', { tone: 'Informal' });
  const deal = await labelled(c.id, 'a great deal of', { register: 'Academic' });
  return { c, lot, bunch, deal };
}

const first = () => 0;

beforeEach(async () => {
  await db.delete();
  await db.open();
  await settingsRepository.add(createDefaultSettings());
});

describe('en.deep-situation (S2)', () => {
  it('is a depth, English-only drill', () => {
    expect(englishDeepSituation).toMatchObject({ mode: 'depth', languages: ['en'] });
    expect(exerciseModules.get('en.deep-situation')).toBeDefined();
  });

  it('builds a scene from a label only the right way has, and offers all the ways', async () => {
    const { c, bunch } = await quantity();
    const library = await loadLibrary();
    const choice = buildSceneChoice(c, bunch, library, first)!;
    expect(choice.options.map((e) => e.text).sort()).toEqual(['a bunch of', 'a great deal of', 'a lot of']);
    expect(choice).toMatchObject({ key: 'tone', value: 'Informal' });
    expect(choice.scene).toMatch(/bạn thân/);
    // Exactly one choice fits the scene: nobody else is Informal.
    const informal = choice.options.filter((e) => e.attributes.tone === 'Informal');
    expect(informal.map((e) => e.text)).toEqual(['a bunch of']);
  });

  it('picks a different label when Tone cannot single the target out', async () => {
    const c = await createDepthConcept(DICT, 'quantity', '');
    await labelled(c.id, 'loads of', { tone: 'Informal' });
    const deal = await labelled(c.id, 'a great deal of', { tone: 'Informal', register: 'Academic' });
    const choice = buildSceneChoice(c, deal, await loadLibrary(), first)!;
    expect(choice).toMatchObject({ key: 'register', value: 'Academic' });
  });

  it('generates a question whose right answer is the target and grades choices', async () => {
    const { c, deal } = await quantity();
    const library = await loadLibrary();
    const exercise = englishDeepSituation.generate(c, deal, { rng: Math.random, options: {}, library });
    expect(exercise.fields[0].type).toBe('choice');
    expect([...exercise.fields[0].options!].sort()).toEqual(['a bunch of', 'a great deal of', 'a lot of']);
    expect(exercise.detail).toContain('large quantity');
    expect(englishDeepSituation.grade({ answer: 'A GREAT DEAL OF' }, exercise).correct).toBe(true);
    expect(englishDeepSituation.grade({ answer: 'a lot of' }, exercise).correct).toBe(false);
  });

  it('needs at least two ways told apart by a label; otherwise it is skipped', async () => {
    const lonely = await createDepthConcept(DICT, 'lonely idea', '');
    const only = await labelled(lonely.id, 'only way', {});
    expect(englishDeepSituation.isEligible(lonely, only, await loadLibrary())).toBe(false);

    const same = await createDepthConcept(DICT, 'same labels', '');
    const a = await labelled(same.id, 'way a', { tone: 'Informal' });
    await labelled(same.id, 'way b', { tone: 'Informal' }); // identical labels: indistinguishable
    expect(englishDeepSituation.isEligible(same, a, await loadLibrary())).toBe(false);

    const unlabelled = await createDepthConcept(DICT, 'unlabelled', '');
    const x = await labelled(unlabelled.id, 'way x', {});
    await labelled(unlabelled.id, 'way y', null); // no verified labels: never an answer or a choice
    expect(englishDeepSituation.isEligible(unlabelled, x, await loadLibrary())).toBe(false);

    expect(await loadPairs(englishDeepSituation, { lang: 'en' })).toEqual([]);
  });

  it('never builds a scene from a value that has no scene text (e.g. "Other")', async () => {
    const c = await createDepthConcept(DICT, 'idea', '');
    const a = await labelled(c.id, 'way a', { register: 'Other' });
    await labelled(c.id, 'way b', {});
    // Register "Other" has no scene; the target only differs on that label.
    expect(buildSceneChoice(c, a, await loadLibrary(), first)).toBeNull();
  });

  it('also offers ways linked in from another concept as choices, but only asks about its own', async () => {
    const { c, bunch } = await quantity();
    const other = await createDepthConcept(DICT, 'formal speech', '');
    const formal = await labelled(other.id, 'a considerable amount of', { tone: 'Formal' });
    await linkExample(formal.id, c.id);
    const library = await loadLibrary();
    const choice = buildSceneChoice(c, bunch, library, first)!;
    expect(choice.options.map((e) => e.text)).toContain('a considerable amount of');
    // The linked way belongs to another concept, so it is not a question for `c`.
    const pairs = await loadPairs(englishDeepSituation, { lang: 'en' });
    expect(pairs.filter((p) => p.concept.id === c.id).every((p) => p.example.targetConceptId === c.id)).toBe(true);
  });

  it('is a drill only for depth concepts: breadth words are not offered it', async () => {
    const { c } = await quantity();
    const pairs = await loadPairs(englishDeepSituation, { lang: 'en' });
    expect(pairs.map((p) => p.concept.id)).toEqual([c.id]);
  });
});

describe('answers to depth drills', () => {
  it('are logged and scheduled per example but never make the concept acquired', async () => {
    const { c, bunch } = await quantity();
    const library = await loadLibrary();
    // Plenty of fast, correct answers on several ways and days would acquire a breadth word.
    await settingsRepository.update(SETTINGS_ID, {
      acquisitionCriteria: { minCorrect: 1, minDistinctContexts: 1, minDistinctDays: 1, maxResponseTimeMsDefault: 100000, maxResponseTimeMsByExerciseType: {} },
    });
    const exercise = englishDeepSituation.generate(c, bunch, { rng: Math.random, options: {}, library });
    const record = await recordAnswer(englishDeepSituation, exercise, { answer: 'a bunch of' }, 800);
    expect(record.result.correct).toBe(true);
    expect(record.statusChange).toBeUndefined();
    expect((await conceptRepository.getById(c.id))!.status).toBe('loaded');
    expect(await reviewLogRepository.listByExampleId(bunch.id)).toHaveLength(1);
    expect(await db.scheduleStates.get(bunch.id)).toBeDefined();
    expect(await refreshAcquisition(c.id)).toBeNull();
    expect(await recomputeAcquisition()).toEqual({ promoted: 0, demoted: 0 });
  });

  it('come back through review/flash sessions like other drills', async () => {
    const { c } = await quantity();
    const items = await loadReviewItems({ kind: 'flash', count: 10, rng: first });
    const depth = items.filter((i) => i.concept.id === c.id);
    expect(depth).toHaveLength(1);
    expect(depth[0].module.id).toBe('en.deep-situation');
  });
});

describe('en.deep-label (S1)', () => {
  const ask = async (conceptId: string, example: Awaited<ReturnType<typeof labelled>>, count?: string) =>
    englishDeepLabel.generate((await conceptRepository.getById(conceptId))!, example, {
      rng: first,
      options: count ? { count } : {},
      library: await loadLibrary(),
    });

  it('is a depth, English-only drill with a configurable number of labels', () => {
    expect(englishDeepLabel).toMatchObject({ mode: 'depth', languages: ['en'] });
    expect(englishDeepLabel.options?.[0].default).toBe('2');
    expect(labelCount('3')).toBe(3);
    expect(labelCount('7')).toBe(2); // not offered: default
    expect(labelCount(undefined)).toBe(2);
  });

  it('only expressions with verified labels, of their own concept, can be asked', async () => {
    const c = await createDepthConcept(DICT, 'quantity', '');
    const done = await labelled(c.id, 'a bunch of', { tone: 'Informal' });
    const raw = await labelled(c.id, 'loads of', null); // no verified labels
    const library = await loadLibrary();
    expect(englishDeepLabel.isEligible(c, done, library)).toBe(true);
    expect(englishDeepLabel.isEligible(c, raw, library)).toBe(false);

    // A suggested (unverified) label is never an answer either.
    await db.examples.update(raw.id, { attributes: attrs({ tone: 'Formal' }), attributesStatus: 'suggested' });
    expect(englishDeepLabel.isEligible(c, (await db.examples.get(raw.id))!, await loadLibrary())).toBe(false);

    // A way linked in from another concept is asked under its own concept only.
    const other = await createDepthConcept(DICT, 'other idea', '');
    expect(englishDeepLabel.isEligible(other, done, library)).toBe(false);

    expect((await loadPairs(englishDeepLabel, { lang: 'en' })).map((p) => p.example.id)).toEqual([done.id]);
  });

  it('asks the chosen number of labels and the right answers are the verified labels', async () => {
    const c = await createDepthConcept(DICT, 'quantity', 'số lượng nhiều');
    const e = await labelled(c.id, 'a great deal of', { register: 'Academic', tone: 'Formal' });
    for (const n of [1, 2, 3, 5]) {
      const exercise = await ask(c.id, e, String(n));
      expect(exercise.fields).toHaveLength(n);
      expect(exercise.prompt).toBe('a great deal of');
      expect(exercise.detail).toContain('quantity');
      for (const f of exercise.fields) {
        expect(f.type).toBe('choice');
        expect(exercise.expected[f.key]).toEqual([e.attributes[f.key as keyof ExampleAttributes]]);
        expect(f.options).toContain(exercise.expected[f.key][0]);
      }
    }
  });

  it('always asks at least one marked label when the expression has one', () => {
    const marked = attrs({ register: 'Academic' });
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(pickLabelKeys(marked, 1, () => r)).toEqual(['register']);
      expect(pickLabelKeys(marked, 2, () => r)).toContain('register');
    }
    // All Neutral: nothing to force, any labels do.
    expect(pickLabelKeys(attrs({}), 2, first)).toHaveLength(2);
  });

  it('grades each label, and the answer is right only when every label is', async () => {
    const c = await createDepthConcept(DICT, 'quantity', '');
    const e = await labelled(c.id, 'a bunch of', { tone: 'Informal' });
    const exercise = await ask(c.id, e, '5');
    const right = Object.fromEntries(exercise.fields.map((f) => [f.key, exercise.expected[f.key][0]]));
    expect(englishDeepLabel.grade(right, exercise).correct).toBe(true);
    const wrong = { ...right, tone: 'Formal' };
    const graded = englishDeepLabel.grade(wrong, exercise);
    expect(graded.correct).toBe(false);
    expect(graded.perField.tone).toBe(false);
    expect(graded.perField.mode).toBe(true);
    expect(graded.expected.tone).toBe('Informal');
  });

  it('offers the value sets PO configured, and still includes a right answer missing from them', async () => {
    const c = await createDepthConcept(DICT, 'quantity', '');
    const e = await labelled(c.id, 'a bunch of', { tone: 'Informal' });
    const library = {
      ...(await loadLibrary()),
      valueSets: { ...createDefaultSettings().attributeValueSets, tone: ['Neutral', 'Formal'] as never },
    };
    const exercise = englishDeepLabel.generate(c, e, { rng: first, options: { count: '5' }, library });
    const tone = exercise.fields.find((f) => f.key === 'tone')!;
    expect(tone.options).toEqual(['Neutral', 'Formal', 'Informal']);
  });

  it('logs the answer by example and never makes the concept acquired', async () => {
    const c = await createDepthConcept(DICT, 'quantity', '');
    const e = await labelled(c.id, 'a bunch of', { tone: 'Informal' });
    await settingsRepository.update(SETTINGS_ID, {
      acquisitionCriteria: { minCorrect: 1, minDistinctContexts: 1, minDistinctDays: 1, maxResponseTimeMsDefault: 100000, maxResponseTimeMsByExerciseType: {} },
    });
    const exercise = await ask(c.id, e, '1');
    const right = Object.fromEntries(exercise.fields.map((f) => [f.key, exercise.expected[f.key][0]]));
    const record = await recordAnswer(englishDeepLabel, exercise, right, 900);
    expect(record.result.correct).toBe(true);
    expect(record.statusChange).toBeUndefined();
    expect((await conceptRepository.getById(c.id))!.status).toBe('loaded');
    const logs = await reviewLogRepository.listByExampleId(e.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ exerciseType: 'en.deep-label', conceptId: c.id, correct: true });
  });
});

