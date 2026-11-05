import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { conceptRepository } from '../db/repositories';
import { createDepthConcept } from '../depth';
import { saveQuickWord } from '../features/quick-add/actions';
import {
  addConceptToSet,
  countBySet,
  createWordSet,
  deleteWordSet,
  filterBySet,
  listWordSets,
  renameWordSet,
  setConceptSets,
} from './index';

const DICT = 'dict-en';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function word(text: string) {
  return (await saveQuickWord(DICT, 'en', text)).concept;
}

describe('word sets', () => {
  it('creates sets with unique names per language and trims them', async () => {
    const it1 = await createWordSet('en', '  IT ');
    expect(it1.ok && it1.set.name).toBe('IT');
    expect(await createWordSet('en', 'it')).toEqual({ ok: false, reason: 'duplicate' });
    expect((await createWordSet('de', 'IT')).ok).toBe(true); // other language: fine
    expect(await createWordSet('en', '   ')).toEqual({ ok: false, reason: 'empty' });
    expect((await listWordSets('en')).map((s) => s.name)).toEqual(['IT']);
  });

  it('renames, refusing a name already used by another set', async () => {
    const a = await createWordSet('en', 'IT');
    const b = await createWordSet('en', 'Films');
    if (!a.ok || !b.ok) throw new Error('setup');
    expect(await renameWordSet(b.set.id, 'it')).toEqual({ ok: false, reason: 'duplicate' });
    expect((await renameWordSet(b.set.id, 'Movies')).ok).toBe(true);
    expect((await renameWordSet(a.set.id, 'IT')).ok).toBe(true); // own name is fine
    expect((await listWordSets('en')).map((s) => s.name)).toEqual(['IT', 'Movies']);
  });

  it('puts one concept in several sets without duplicating it', async () => {
    const it1 = await createWordSet('en', 'IT');
    const films = await createWordSet('en', 'Films');
    if (!it1.ok || !films.ok) throw new Error('setup');
    const ball = await word('ball');
    await addConceptToSet(ball.id, it1.set.id);
    await addConceptToSet(ball.id, films.set.id);
    await addConceptToSet(ball.id, films.set.id); // twice: still once
    expect((await conceptRepository.getById(ball.id))?.setIds?.sort()).toEqual([it1.set.id, films.set.id].sort());
    expect(await db.concepts.count()).toBe(1);
  });

  it('drops unknown set ids when assigning', async () => {
    const it1 = await createWordSet('en', 'IT');
    if (!it1.ok) throw new Error('setup');
    const w = await word('cache');
    await setConceptSets(w.id, [it1.set.id, 'ghost']);
    expect((await conceptRepository.getById(w.id))?.setIds).toEqual([it1.set.id]);
    await setConceptSets(w.id, []);
    expect((await conceptRepository.getById(w.id))?.setIds).toEqual([]);
  });

  it('deleting a set keeps the concepts and removes only the label', async () => {
    const it1 = await createWordSet('en', 'IT');
    const films = await createWordSet('en', 'Films');
    if (!it1.ok || !films.ok) throw new Error('setup');
    const ball = await word('ball');
    await setConceptSets(ball.id, [it1.set.id, films.set.id]);
    await deleteWordSet(it1.set.id);
    expect((await conceptRepository.getById(ball.id))?.setIds).toEqual([films.set.id]);
    expect((await conceptRepository.getById(ball.id))?.deletedAt).toBeUndefined();
    expect((await listWordSets('en')).map((s) => s.name)).toEqual(['Films']);
    // soft delete: the row is still there for sync
    expect((await db.wordSets.get(it1.set.id))?.deletedAt).toBeDefined();
  });

  it('filters and counts: all / no set / one set (a deleted set is ignored)', async () => {
    const it1 = await createWordSet('en', 'IT');
    const films = await createWordSet('en', 'Films');
    if (!it1.ok || !films.ok) throw new Error('setup');
    const a = await word('cache');
    const b = await word('ball');
    const c = await createDepthConcept(DICT, 'idea', '');
    await setConceptSets(a.id, [it1.set.id]);
    await setConceptSets(b.id, [it1.set.id, films.set.id]);
    const all = await conceptRepository.listActive();
    const sets = await listWordSets('en');
    const live = new Set(sets.map((s) => s.id));

    expect(filterBySet(all, { kind: 'all' }, live)).toHaveLength(3);
    expect(filterBySet(all, { kind: 'none' }, live).map((x) => x.id)).toEqual([c.id]);
    expect(filterBySet(all, { kind: 'set', id: it1.set.id }, live).map((x) => x.text).sort()).toEqual(['ball', 'cache']);
    const counts = countBySet(all, sets);
    expect(counts.all).toBe(3);
    expect(counts.none).toBe(1);
    expect(counts.bySet.get(it1.set.id)).toBe(2);
    expect(counts.bySet.get(films.set.id)).toBe(1);

    // a label pointing at a deleted set counts as "no set"
    await deleteWordSet(films.set.id);
    const after = await conceptRepository.listActive();
    expect(filterBySet(after, { kind: 'none' }, new Set([it1.set.id])).map((x) => x.id)).toEqual([c.id]);
  });
});
