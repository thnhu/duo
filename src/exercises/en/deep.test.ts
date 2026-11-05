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
import { buildSceneChoice, englishDeepSituation } from './deep';

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

