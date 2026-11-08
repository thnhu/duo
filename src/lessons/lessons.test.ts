import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { lessonRepository } from '../db/repositories';
import { migratedLessonId, planLessonMigration } from '../db/lessonMigration';
import type { Concept, Lesson, WordSet } from '../db/types';
import { exportBackup } from '../backup/json';
import { SYNC_TABLES } from '../sync/types';
import { saveQuickWord } from '../features/quick-add/actions';
import { deleteDeckWithContents } from '../features/sets/actions';
import { restoreDeleted } from '../features/library/actions';
import { createWordSet, deleteWordSet, setConceptSets } from '../wordsets';
import { lessonFitsDecks } from './rules';

function concept(id: string, lesson: string | undefined, over: Partial<Concept> = {}): Concept {
  return {
    id, dictionaryId: 'dict-de', lang: 'de', text: id, meanings: [], verification: 'unverified',
    source: { type: 'import', ...(lesson !== undefined ? { lesson } : {}) },
    status: 'loaded', createdAt: 1, updatedAt: 1, ...over,
  };
}

function deck(id: string, over: Partial<WordSet> = {}): WordSet {
  return { id, name: id, lang: 'de', updatedAt: 1, ...over };
}

describe('planLessonMigration (old free-text lesson -> lessons)', () => {
  it('puts a concept in the lesson of its first deck, or of General, in file order', () => {
    const plan = planLessonMigration(
      [
        concept('a', 'Family', { setIds: ['A1'], createdAt: 1 }),
        concept('b', 'Daily activities', { setIds: ['A1'], createdAt: 2 }),
        concept('c', ' family ', { setIds: ['A1'], createdAt: 3 }), // same lesson, spelled differently
        concept('d', 'Family', { createdAt: 4 }), // General: its own lesson
        concept('e', 'Family', { setIds: ['A2'], createdAt: 5 }), // another deck: its own lesson
      ],
      [deck('A1'), deck('A2')],
      99,
    );
    expect(plan.lessons.map((l) => [l.name, l.setId, l.order])).toEqual([
      ['Family', 'A1', 0],
      ['Daily activities', 'A1', 1],
      ['Family', undefined, 0],
      ['Family', 'A2', 0],
    ]);
    const lessonOf = Object.fromEntries(plan.assignments);
    expect(lessonOf.a).toBe(lessonOf.c);
    expect(lessonOf.a).not.toBe(lessonOf.b);
    expect(lessonOf.a).not.toBe(lessonOf.d);
    expect(lessonOf.a).not.toBe(lessonOf.e);
  });

  it('ignores concepts without a lesson, deleted concepts and deleted decks', () => {
    const plan = planLessonMigration(
      [
        concept('a', undefined),
        concept('b', '   '),
        concept('c', 'Travel', { deletedAt: 5 }),
        concept('d', 'Travel', { setIds: ['gone'] }), // its only deck was deleted: General
      ],
      [deck('gone', { deletedAt: 3 })],
      1,
    );
    expect(plan.assignments.map(([id]) => id)).toEqual(['d']);
    expect(plan.lessons).toHaveLength(1);
    expect(plan.lessons[0].setId).toBeUndefined();
  });

  it('makes the same ids on every device, so syncing does not duplicate lessons', () => {
    const rows = [concept('a', 'Family', { setIds: ['A1'] })];
    const one = planLessonMigration(rows, [deck('A1')], 1);
    const two = planLessonMigration(rows, [deck('A1')], 2);
    expect(one.lessons[0].id).toBe(two.lessons[0].id);
    expect(one.lessons[0].id).toBe(migratedLessonId('de', 'A1', 'FAMILY'));
  });

  it('copes with rows that miss fields', () => {
    const broken = { id: 'x', lang: 'de', text: 'x', meanings: [], createdAt: 1 } as unknown as Concept;
    expect(() => planLessonMigration([broken], [], 1)).not.toThrow();
  });
});

describe('schema v8 upgrade', () => {
  it('turns the old lesson text into lessons on a real v7 database, keeping the text', async () => {
    const { default: Dexie } = await import('dexie');
    const { DuoDB } = await import('../db/schema');
    const name = 'duo-migration-v7-to-v8';
    const v7 = new Dexie(name);
    v7.version(7).stores({
      dictionaries: 'id, lang',
      concepts: 'id, dictionaryId, lang, status, [dictionaryId+text], updatedAt, deletedAt',
      examples: 'id, dictionaryId, targetConceptId, attributesStatus, updatedAt, deletedAt',
      scheduleStates: 'exampleId, due, updatedAt',
      reviewLogs: 'id, conceptId, exampleId, timestamp',
      importMappings: 'id, name',
      settings: 'id',
      importBatches: 'id, createdAt',
      syncMeta: 'key',
      exampleLinks: 'id, exampleId, conceptId, updatedAt, deletedAt',
      conceptLinks: 'id, childId, parentId, updatedAt, deletedAt',
      wordSets: 'id, lang, updatedAt, deletedAt',
      passages: 'id, lang, updatedAt, deletedAt',
    });
    await v7.open();
    await v7.table('wordSets').add(deck('A1'));
    await v7.table('concepts').bulkAdd([
      concept('c1', 'Family', { setIds: ['A1'], createdAt: 1 }),
      concept('c2', 'Family', { setIds: ['A1'], createdAt: 2 }),
      concept('c3', undefined, { setIds: ['A1'], createdAt: 3 }),
    ]);
    await v7.table('settings').add({ id: 'default', schemaVersion: 7 });
    v7.close();

    const v8 = new DuoDB(name);
    await v8.open();
    const lessons = await v8.lessons.toArray();
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ name: 'Family', setId: 'A1', lang: 'de', order: 0 });
    const c1 = await v8.concepts.get('c1');
    expect(c1?.lessonId).toBe(lessons[0].id);
    expect(c1?.source.lesson).toBe('Family'); // the record of the file stays
    expect((await v8.concepts.get('c2'))?.lessonId).toBe(lessons[0].id);
    expect((await v8.concepts.get('c3'))?.lessonId).toBeUndefined();
    expect((await v8.settings.get('default'))?.schemaVersion).toBe(11);
    v8.close();
    await Dexie.delete(name);
  });
});

describe('lessons stay with their deck', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  async function setup() {
    const a1 = await createWordSet('de', 'A1');
    const a2 = await createWordSet('de', 'A2');
    if (!a1.ok || !a2.ok) throw new Error('decks');
    const lesson: Lesson = { id: 'l1', lang: 'de', name: 'Family', order: 0, setId: a1.set.id, updatedAt: 1 };
    await lessonRepository.add(lesson);
    const own = (await saveQuickWord('dict-de', 'de', 'Mutter')).concept;
    const shared = (await saveQuickWord('dict-de', 'de', 'Vater')).concept;
    await setConceptSets(own.id, [a1.set.id]);
    await setConceptSets(shared.id, [a1.set.id, a2.set.id]);
    await db.concepts.update(own.id, { lessonId: 'l1' });
    await db.concepts.update(shared.id, { lessonId: 'l1' });
    return { a1: a1.set, a2: a2.set, own, shared };
  }

  it('a word that leaves the deck leaves the lesson of that deck', async () => {
    const { a1, a2, shared } = await setup();
    await setConceptSets(shared.id, [a1.id, a2.id]); // unchanged: keeps the lesson
    expect((await db.concepts.get(shared.id))?.lessonId).toBe('l1');
    await setConceptSets(shared.id, [a2.id]);
    expect((await db.concepts.get(shared.id))?.lessonId).toBeUndefined();
    expect((await db.concepts.get(shared.id))?.setIds).toEqual([a2.id]);
  });

  it('deleting a deck takes its lessons, unlabels shared words, and undo brings them back', async () => {
    const { a1, own, shared } = await setup();
    const rows = await deleteDeckWithContents(a1.id);
    expect((await db.lessons.get('l1'))?.deletedAt).toBeDefined();
    expect((await db.concepts.get(shared.id))?.lessonId).toBeUndefined();
    expect((await db.concepts.get(shared.id))?.deletedAt).toBeUndefined();
    expect((await db.concepts.get(own.id))?.deletedAt).toBeDefined();

    await restoreDeleted(rows);
    expect((await db.lessons.get('l1'))?.deletedAt).toBeUndefined();
    expect((await db.concepts.get(shared.id))?.lessonId).toBe('l1');
    expect((await db.concepts.get(own.id))?.lessonId).toBe('l1');
    expect((await db.concepts.get(own.id))?.deletedAt).toBeUndefined();
  });

  it('removing only the deck label (deleteWordSet) also drops its lessons', async () => {
    const { a1, shared } = await setup();
    await deleteWordSet(a1.id);
    expect((await db.lessons.get('l1'))?.deletedAt).toBeDefined();
    expect((await db.concepts.get(shared.id))?.lessonId).toBeUndefined();
  });

  it('General lessons fit only words in no deck', () => {
    expect(lessonFitsDecks({ setId: undefined }, [])).toBe(true);
    expect(lessonFitsDecks({ setId: undefined }, ['A1'])).toBe(false);
    expect(lessonFitsDecks({ setId: 'A1' }, ['A1', 'A2'])).toBe(true);
    expect(lessonFitsDecks({ setId: 'A1' }, [])).toBe(false);
  });

  it('lessons are in the backup and in the sync', async () => {
    await setup();
    const backup = await exportBackup();
    expect(backup.tables.lessons).toHaveLength(1);
    expect(SYNC_TABLES.map(([name]) => name)).toContain('lessons');
  });
});

describe('lesson module (M15b)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  async function twoDecks() {
    const { createLesson } = await import('./index');
    const a1 = await createWordSet('de', 'A1');
    const a2 = await createWordSet('de', 'A2');
    if (!a1.ok || !a2.ok) throw new Error('decks');
    return { a1: a1.set, a2: a2.set, createLesson };
  }

  it('creates lessons in order; a name is unique inside a deck, ignoring case and spaces', async () => {
    const { a1, a2, createLesson } = await twoDecks();
    const { listLessons } = await import('./index');
    const family = await createLesson('de', a1.id, '  Family ');
    expect(family.ok && family.lesson.name).toBe('Family');
    expect(await createLesson('de', a1.id, 'family')).toEqual({ ok: false, reason: 'duplicate' });
    expect(await createLesson('de', a1.id, '  ')).toEqual({ ok: false, reason: 'empty' });
    await createLesson('de', a1.id, 'Daily   activities');
    // The same name in another deck, or in General, is a different lesson.
    expect((await createLesson('de', a2.id, 'Family')).ok).toBe(true);
    expect((await createLesson('de', undefined, 'Family')).ok).toBe(true);
    expect((await listLessons('de', a1.id)).map((l) => [l.name, l.order])).toEqual([
      ['Family', 0],
      ['Daily activities', 1],
    ]);
    expect((await listLessons('de', undefined)).map((l) => l.name)).toEqual(['Family']);
    expect(await listLessons('en', a1.id)).toEqual([]);
  });

  it('findOrCreateLesson reuses the lesson of that name', async () => {
    const { a1 } = await twoDecks();
    const { findOrCreateLesson, listLessons } = await import('./index');
    const first = await findOrCreateLesson('de', a1.id, 'Travel');
    const again = await findOrCreateLesson('de', a1.id, ' travel ');
    expect(again?.id).toBe(first?.id);
    expect(await listLessons('de', a1.id)).toHaveLength(1);
    expect(await findOrCreateLesson('de', a1.id, '   ')).toBeNull();
  });

  it('renames in one place (the words follow) and refuses a taken name', async () => {
    const { a1, createLesson } = await twoDecks();
    const { renameLesson, assignLesson } = await import('./index');
    const family = await createLesson('de', a1.id, 'Family');
    const travel = await createLesson('de', a1.id, 'Travel');
    if (!family.ok || !travel.ok) throw new Error('lessons');
    const word = (await saveQuickWord('dict-de', 'de', 'Mutter')).concept;
    await setConceptSets(word.id, [a1.id]);
    expect(await assignLesson(word.id, family.lesson.id)).toEqual({ ok: true });

    expect(await renameLesson(family.lesson.id, 'travel')).toEqual({ ok: false, reason: 'duplicate' });
    const renamed = await renameLesson(family.lesson.id, 'Familie');
    expect(renamed.ok).toBe(true);
    expect((await db.lessons.get(family.lesson.id))?.name).toBe('Familie');
    expect((await db.concepts.get(word.id))?.lessonId).toBe(family.lesson.id);
  });

  it('moves a lesson up and down and keeps the order tidy', async () => {
    const { a1, createLesson } = await twoDecks();
    const { moveLesson, listLessons } = await import('./index');
    for (const name of ['A', 'B', 'C']) await createLesson('de', a1.id, name);
    const ids = (await listLessons('de', a1.id)).map((l) => l.id);
    await moveLesson(ids[2], -1);
    expect((await listLessons('de', a1.id)).map((l) => l.name)).toEqual(['A', 'C', 'B']);
    await moveLesson(ids[0], -1); // already first: nothing happens
    await moveLesson(ids[1], 1); // B is already last
    expect((await listLessons('de', a1.id)).map((l) => [l.name, l.order])).toEqual([
      ['A', 0],
      ['C', 1],
      ['B', 2],
    ]);
  });

  it('assigns a word only to a lesson of one of its decks', async () => {
    const { a1, a2, createLesson } = await twoDecks();
    const { assignLesson, countByLesson, listLessons } = await import('./index');
    const inA1 = await createLesson('de', a1.id, 'Family');
    const inGeneral = await createLesson('de', undefined, 'Misc');
    if (!inA1.ok || !inGeneral.ok) throw new Error('lessons');
    const word = (await saveQuickWord('dict-de', 'de', 'Mutter')).concept;

    // In General for now: only a General lesson fits.
    expect(await assignLesson(word.id, inA1.lesson.id)).toEqual({ ok: false, reason: 'other-deck' });
    expect(await assignLesson(word.id, inGeneral.lesson.id)).toEqual({ ok: true });
    // Moving to A1 drops the General lesson; then the A1 lesson fits.
    await setConceptSets(word.id, [a1.id]);
    expect((await db.concepts.get(word.id))?.lessonId).toBeUndefined();
    expect(await assignLesson(word.id, inA1.lesson.id)).toEqual({ ok: true });
    expect((await countByLesson('de', a1.id)).get(inA1.lesson.id)).toBe(1);
    // A lesson of a deck the word is not in, and a missing lesson, are refused.
    await setConceptSets(word.id, [a1.id, a2.id]);
    expect(await assignLesson(word.id, 'nope')).toEqual({ ok: false, reason: 'missing' });
    // Taking it out of the lesson.
    expect(await assignLesson(word.id, undefined)).toEqual({ ok: true });
    expect((await db.concepts.get(word.id))?.lessonId).toBeUndefined();
    expect((await listLessons('de', a1.id)).map((l) => l.name)).toEqual(['Family']);
  });

  it('deleting a lesson keeps the words, and undo puts them back', async () => {
    const { a1, createLesson } = await twoDecks();
    const { assignLesson, deleteLesson, previewLessonDelete, restoreLesson, listLessons } = await import('./index');
    const family = await createLesson('de', a1.id, 'Family');
    if (!family.ok) throw new Error('lesson');
    const word = (await saveQuickWord('dict-de', 'de', 'Mutter')).concept;
    await setConceptSets(word.id, [a1.id]);
    await assignLesson(word.id, family.lesson.id);

    expect(await previewLessonDelete(family.lesson.id)).toEqual({ concepts: 1 });
    const undo = await deleteLesson(family.lesson.id);
    expect(await listLessons('de', a1.id)).toEqual([]);
    expect((await db.concepts.get(word.id))?.deletedAt).toBeUndefined();
    expect((await db.concepts.get(word.id))?.lessonId).toBeUndefined();

    await restoreLesson(undo);
    expect((await listLessons('de', a1.id)).map((l) => l.name)).toEqual(['Family']);
    expect((await db.concepts.get(word.id))?.lessonId).toBe(family.lesson.id);
  });
});

describe('library by lesson (M15e)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('lists the words of a lesson in entry order, and the words of the deck in no lesson', async () => {
    const { createLesson, assignLesson, listLessonConcepts, listUnassignedConcepts, deckOfFilter } = await import('./index');
    const a1 = await createWordSet('de', 'A1');
    if (!a1.ok) throw new Error('deck');
    const family = await createLesson('de', a1.set.id, 'Family');
    if (!family.ok) throw new Error('lesson');
    const make = async (text: string, createdAt: number) => {
      const c = (await saveQuickWord('dict-de', 'de', text)).concept;
      await db.concepts.update(c.id, { createdAt });
      await setConceptSets(c.id, [a1.set.id]);
      return c;
    };
    const vater = await make('Vater', 2);
    const mutter = await make('Mutter', 1);
    const haus = await make('Haus', 3); // in the deck, in no lesson
    const outside = (await saveQuickWord('dict-de', 'de', 'Tisch')).concept; // General
    await assignLesson(vater.id, family.lesson.id);
    await assignLesson(mutter.id, family.lesson.id);

    expect((await listLessonConcepts('de', family.lesson.id)).map((c) => c.text)).toEqual(['Mutter', 'Vater']);
    const filter = { kind: 'set', id: a1.set.id } as const;
    expect((await listUnassignedConcepts('de', filter, [a1.set])).map((c) => c.text)).toEqual(['Haus']);
    // General only sees the words in no deck.
    expect((await listUnassignedConcepts('de', { kind: 'none' }, [a1.set])).map((c) => c.text)).toEqual(['Tisch']);
    // "All decks" is not one deck: no lessons.
    expect(await listUnassignedConcepts('de', { kind: 'all' }, [a1.set])).toEqual([]);
    expect(deckOfFilter({ kind: 'all' })).toEqual({ ok: false });
    expect(deckOfFilter({ kind: 'none' })).toEqual({ ok: true, setId: undefined });
    expect(deckOfFilter(filter)).toEqual({ ok: true, setId: a1.set.id });
    expect(haus.id).not.toBe(outside.id);
  });

  it('a deleted word is not in the lesson list', async () => {
    const { createLesson, assignLesson, listLessonConcepts } = await import('./index');
    const lesson = await createLesson('de', undefined, 'Misc');
    if (!lesson.ok) throw new Error('lesson');
    const word = (await saveQuickWord('dict-de', 'de', 'Tisch')).concept;
    await assignLesson(word.id, lesson.lesson.id);
    await db.concepts.update(word.id, { deletedAt: 5 });
    expect(await listLessonConcepts('de', lesson.lesson.id)).toEqual([]);
  });
});

describe('choosing lessons to study (M15f)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('no lessons ticked means no restriction; ticked lessons narrow to their words', async () => {
    const { inSelectedLessons } = await import('./rules');
    expect(inSelectedLessons({ lessonId: 'a' }, undefined)).toBe(true);
    expect(inSelectedLessons({}, [])).toBe(true);
    expect(inSelectedLessons({ lessonId: 'a' }, ['a', 'b'])).toBe(true);
    expect(inSelectedLessons({ lessonId: 'c' }, ['a', 'b'])).toBe(false);
    expect(inSelectedLessons({}, ['a'])).toBe(false); // a word in no lesson is out
  });

  it('offers the lessons of the ticked decks, or of every deck when none is ticked', async () => {
    const { createLesson, listLessonGroups, effectiveLessonIds } = await import('./index');
    const a1 = await createWordSet('de', 'A1');
    const a2 = await createWordSet('de', 'A2');
    if (!a1.ok || !a2.ok) throw new Error('decks');
    const family = await createLesson('de', a1.set.id, 'Family');
    const travel = await createLesson('de', a2.set.id, 'Travel');
    const misc = await createLesson('de', undefined, 'Misc');
    if (!family.ok || !travel.ok || !misc.ok) throw new Error('lessons');
    const decks = [a1.set, a2.set];

    const all = await listLessonGroups(['de'], [], decks);
    expect(all.map((g) => [g.label, g.lessons.map((l) => l.name)])).toEqual([
      ['General', ['Misc']],
      ['A1', ['Family']],
      ['A2', ['Travel']],
    ]);
    const onlyA1 = await listLessonGroups(['de'], [a1.set.id], decks);
    expect(onlyA1.map((g) => g.label)).toEqual(['A1']);
    expect(await listLessonGroups(['en'], [], decks)).toEqual([]);

    // A lesson ticked earlier but no longer offered (deck unticked) is ignored.
    const picked = [family.lesson.id, travel.lesson.id];
    expect(effectiveLessonIds(picked, onlyA1)).toEqual([family.lesson.id]);
    expect(effectiveLessonIds(picked, all)).toEqual(picked);
  });
});
