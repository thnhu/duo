import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { SETTINGS_ID, createDefaultSettings } from '../db/defaults';
import { exampleRepository, settingsRepository } from '../db/repositories';
import { deleteConceptCascade } from '../features/library/actions';
import { saveExampleEdits } from '../features/example/actions';
import type { Example, ExampleAttributes } from '../db/types';
import {
  addExpression as addExpressionRaw,
  createDepthConcept,
  groupExpressions,
  linkExample,
  listExpressions,
  listLinksOfExample,
  loadDepthSettings,
  sanitizeDepth,
  saveDepthSettings,
  triFoldProgress,
  unlinkExample,
} from './index';

const DICT = 'dict-en';

// Expressions are ordered by createdAt; two created in the same millisecond
// would tie (random ids then decide), which made these tests flaky on CI.
const addExpression: typeof addExpressionRaw = async (concept, text) => {
  const example = await addExpressionRaw(concept, text);
  await new Promise((resolve) => setTimeout(resolve, 3));
  return example;
};
const attrs = (patch: Partial<ExampleAttributes>): ExampleAttributes => ({
  tone: 'Neutral',
  mode: 'Neutral',
  register: 'Neutral',
  nuance: 'Neutral',
  dialect: 'Neutral',
  ...patch,
});

async function label(example: Example, patch: Partial<ExampleAttributes>) {
  await saveExampleEdits(example, { attributes: attrs(patch), note: '' });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await settingsRepository.add(createDefaultSettings());
});

describe('depth concept and its expressions', () => {
  it('creates an idea, not a word: depth mode, Vietnamese description, no pos', async () => {
    const c = await createDepthConcept(DICT, ' large quantity ', 'số lượng nhiều');
    expect(c).toMatchObject({ text: 'large quantity', mode: 'depth', lang: 'en', meanings: ['số lượng nhiều'] });
    expect(c.pos).toBeUndefined();
  });

  it('an expression belongs to the concept (home) and is not an inbox sentence', async () => {
    const c = await createDepthConcept(DICT, 'quantity', '');
    const e = await addExpression(c, ' a lot of ');
    expect(e).toMatchObject({ text: 'a lot of', targetConceptId: c.id, attributesStatus: 'empty' });
    expect(e.highlight).toBeUndefined();
  });

  it('tri-fold counts different verified label combinations only', async () => {
    const c = await createDepthConcept(DICT, 'quantity', 'số lượng nhiều');
    const a = await addExpression(c, 'a lot of');
    const b = await addExpression(c, 'a bunch of');
    const d = await addExpression(c, 'a great deal of');
    const same = await addExpression(c, 'plenty of');

    let progress = triFoldProgress(await listExpressions(c.id), 3);
    expect(progress.distinct).toBe(0);
    expect(progress.unlabelled).toHaveLength(4);

    await label(a, {});
    await label(b, { tone: 'Informal' });
    await label(same, { tone: 'Informal' }); // identical to "a bunch of"
    progress = triFoldProgress(await listExpressions(c.id), 3);
    expect(progress.distinct).toBe(2);
    expect(progress.complete).toBe(false);
    expect(progress.duplicates.map((e) => e.text)).toEqual(['plenty of']);
    expect(progress.unlabelled.map((e) => e.text)).toEqual(['a great deal of']);

    await label(d, { register: 'Academic' });
    progress = triFoldProgress(await listExpressions(c.id), 3);
    expect(progress.distinct).toBe(3);
    expect(progress.complete).toBe(true);
  });

  it('unverified (suggested) labels never count', async () => {
    const c = await createDepthConcept(DICT, 'quantity', '');
    const e = await addExpression(c, 'a bunch of');
    await exampleRepository.update(e.id, { attributes: attrs({ tone: 'Informal' }), attributesStatus: 'suggested' });
    expect(triFoldProgress(await listExpressions(c.id), 2).distinct).toBe(0);
  });
});

describe('ExampleLink (extra link, not the home concept)', () => {
  it('lists a linked example under the other concept too, once', async () => {
    const quantity = await createDepthConcept(DICT, 'quantity', '');
    const formal = await createDepthConcept(DICT, 'formal quantity', '');
    const e = await addExpression(quantity, 'a great deal of');
    expect(await linkExample(e.id, formal.id)).toMatchObject({ type: 'otherPhrase' });
    expect((await listExpressions(formal.id)).map((x) => x.id)).toEqual([e.id]);
    expect((await listExpressions(quantity.id)).map((x) => x.id)).toEqual([e.id]);
  });

  it('refuses a link to its own home concept and relinking does not duplicate', async () => {
    const quantity = await createDepthConcept(DICT, 'quantity', '');
    const other = await createDepthConcept(DICT, 'other', '');
    const e = await addExpression(quantity, 'a lot of');
    expect(await linkExample(e.id, quantity.id)).toBeNull();
    await linkExample(e.id, other.id, 'otherPhrase');
    await linkExample(e.id, other.id, 'idiom');
    const links = await listLinksOfExample(e.id);
    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('idiom');
  });

  it('unlinking is a soft delete and the example leaves the other concept', async () => {
    const quantity = await createDepthConcept(DICT, 'quantity', '');
    const other = await createDepthConcept(DICT, 'other', '');
    const e = await addExpression(quantity, 'a lot of');
    const link = (await linkExample(e.id, other.id))!;
    await unlinkExample(link.id);
    expect(await listExpressions(other.id)).toHaveLength(0);
    expect((await db.exampleLinks.get(link.id))?.deletedAt).toBeDefined();
  });

  it('deleting a concept soft-deletes the links pointing at it', async () => {
    const quantity = await createDepthConcept(DICT, 'quantity', '');
    const other = await createDepthConcept(DICT, 'other', '');
    const e = await addExpression(quantity, 'a lot of');
    await linkExample(e.id, other.id);
    await deleteConceptCascade(other.id);
    expect(await listLinksOfExample(e.id)).toHaveLength(0);
    expect((await listExpressions(quantity.id)).map((x) => x.id)).toEqual([e.id]);
  });
});

describe('depth settings', () => {
  it('defaults to 3 and rejects nonsense', async () => {
    expect((await loadDepthSettings()).minExpressions).toBe(3);
    expect(sanitizeDepth({ minExpressions: 1 }).minExpressions).toBe(3);
    expect(sanitizeDepth({ minExpressions: 2.5 }).minExpressions).toBe(3);
    await saveDepthSettings({ minExpressions: 4 });
    expect((await settingsRepository.getById(SETTINGS_ID))?.depth?.minExpressions).toBe(4);
    expect((await loadDepthSettings()).minExpressions).toBe(4);
  });
});

describe('grouping expressions on the shelf', () => {
  it('groups by one attribute in value-set order, unlabelled last', async () => {
    const c = await createDepthConcept(DICT, 'quantity', '');
    const a = await addExpression(c, 'a lot of');
    const b = await addExpression(c, 'a bunch of');
    const d = await addExpression(c, 'a great deal of');
    const e = await addExpression(c, 'loads of');
    await label(a, {});
    await label(b, { tone: 'Informal' });
    await label(e, { tone: 'Informal' });
    // d has no verified labels
    const order = ['Neutral', 'Informal', 'Formal'];
    const groups = groupExpressions(await listExpressions(c.id), 'tone', order);
    expect(groups.map((g) => [g.value, g.expressions.map((x) => x.text)])).toEqual([
      ['Neutral', ['a lot of']],
      ['Informal', ['a bunch of', 'loads of']],
      [null, ['a great deal of']],
    ]);
    expect(d.text).toBe('a great deal of');
  });

  it('keeps values missing from the configured set instead of dropping them', async () => {
    const c = await createDepthConcept(DICT, 'quantity', '');
    const a = await addExpression(c, 'a lot of');
    await label(a, { register: 'Academic' });
    const groups = groupExpressions(await listExpressions(c.id), 'register', ['Neutral']);
    expect(groups.map((g) => g.value)).toEqual(['Academic']);
  });
});

