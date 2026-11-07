import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { ensureDefaultDictionaries } from '../db/seed';
import { conceptLinkRepository, exampleLinkRepository, exampleRepository } from '../db/repositories';
import { createExample } from '../features/example/actions';
import { saveQuickWord } from '../features/quick-add/actions';
import { assignLesson, createLesson } from '../lessons';
import { createPassage } from '../passages';
import { recordSchedule } from '../scheduling/store';
import { createWordSet, setConceptSets } from '../wordsets';
import { exportBackup, restoreBackup } from './json';

const DE = 'dict-de';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureDefaultDictionaries();
});

async function build() {
  const a1 = await createWordSet('de', 'Goethe A1');
  const a2 = await createWordSet('de', 'Goethe A2');
  if (!a1.ok || !a2.ok) throw new Error('decks');
  const family = await createLesson('de', a1.set.id, 'Family');
  if (!family.ok) throw new Error('lesson');
  const word = async (text: string, decks: string[]) => {
    const c = (await saveQuickWord(DE, 'de', text)).concept;
    await setConceptSets(c.id, decks);
    return c;
  };
  const mutter = await word('Mutter', [a1.set.id]);
  const vater = await word('Vater', [a1.set.id]);
  const haus = await word('Haus', [a2.set.id]);
  const tisch = await word('Tisch', []);
  await assignLesson(mutter.id, family.lesson.id);
  await createExample({ dictionaryId: DE, text: 'Meine Mutter kocht.', highlight: { start: 6, end: 12 }, conceptId: mutter.id });
  await createExample({ dictionaryId: DE, text: 'Das Haus ist gross.', highlight: { start: 4, end: 8 }, conceptId: haus.id });
  const mutterExample = (await exampleRepository.listActive()).find((e) => e.targetConceptId === mutter.id && !e.isMinimal)!;
  await recordSchedule(mutterExample.id, true, Date.now());
  await db.reviewLogs.add({
    id: 'log1',
    conceptId: mutter.id,
    exampleId: mutterExample.id,
    exerciseType: 'de.dictation',
    correct: true,
    responseTimeMs: 900,
    timestamp: 5,
  });
  await conceptLinkRepository.add({ id: 'cl-in', childId: mutter.id, parentId: vater.id, type: 'association', updatedAt: 1 });
  await conceptLinkRepository.add({ id: 'cl-out', childId: mutter.id, parentId: haus.id, type: 'association', updatedAt: 1 });
  await exampleLinkRepository.add({ id: 'el-out', exampleId: mutterExample.id, conceptId: haus.id, type: 'otherPhrase', updatedAt: 1 });
  // A passage of deck A1 whose gap word (Tisch) is in no deck.
  const text = 'Der Tisch steht hier.';
  const made = await createPassage({ dictionaryId: DE, lang: 'de', text, gaps: [{ start: 4, end: 9 }], setId: a1.set.id });
  if (!made.ok) throw new Error('passage');
  // Creating the passage put its gap word in the deck; take Tisch out again so the
  // passage (still in A1) has a gap word that is outside the deck.
  await setConceptSets(tisch.id, []);
  return { a1: a1.set, a2: a2.set, family: family.lesson, mutter, vater, haus, tisch, passage: made.passage };
}

const texts = (rows: Array<Record<string, unknown>>) => rows.map((r) => r.text as string).sort();

describe('JSON backup of one scope', () => {
  it('the whole kit has no scope and is unchanged', async () => {
    await build();
    const full = await exportBackup(1);
    expect(full.scope).toBeUndefined();
    expect(full.tables.concepts.length).toBeGreaterThanOrEqual(4);
    const empty = await exportBackup(1, {});
    expect(empty.scope).toBeUndefined();
    expect(empty.tables.concepts).toHaveLength(full.tables.concepts.length);
  });

  it('a deck holds its words with what goes with them, and nothing of the other deck', async () => {
    const { a1, family, mutter } = await build();
    const backup = await exportBackup(1, { lang: 'de', deck: a1.id });
    expect(backup.scope).toMatchObject({ lang: 'de', deck: a1.id, deckName: 'Goethe A1', conceptCount: 2 });

    // Words of the deck, plus the gap word of its passage.
    expect(texts(backup.tables.concepts)).toEqual(['Mutter', 'Tisch', 'Vater']);
    expect(backup.tables.concepts.find((c) => c.id === mutter.id)?.lessonId).toBe(family.id);
    expect(backup.tables.wordSets.map((d) => d.name)).toEqual(['Goethe A1']);
    expect(backup.tables.lessons.map((l) => l.name)).toEqual(['Family']);
    // The examples of the deck's words and the passage's gap, not Haus's.
    expect(backup.tables.examples.some((e) => e.text === 'Das Haus ist gross.')).toBe(false);
    expect(backup.tables.examples.some((e) => e.text === 'Meine Mutter kocht.')).toBe(true);
    expect(backup.tables.passages).toHaveLength(1);
    // One link has both ends in the file; the one to Haus is left out.
    expect(backup.tables.conceptLinks.map((l) => l.id)).toEqual(['cl-in']);
    expect(backup.tables.exampleLinks).toEqual([]);
    // Schedule and log of the deck's example.
    expect(backup.tables.scheduleStates).toHaveLength(1);
    expect(backup.tables.reviewLogs.map((l) => l.id)).toEqual(['log1']);
    // Not in a partial file.
    expect(backup.tables.settings).toEqual([]);
    expect(backup.tables.importMappings).toEqual([]);
  });

  it('a lesson holds only its words and no passages', async () => {
    const { a1, family } = await build();
    const backup = await exportBackup(1, { lang: 'de', deck: a1.id, lessonId: family.id });
    expect(texts(backup.tables.concepts)).toEqual(['Mutter']);
    expect(backup.tables.passages).toEqual([]);
    expect(backup.scope?.lessonName).toBe('Family');
  });

  it('General holds the words in no deck', async () => {
    await build();
    const backup = await exportBackup(1, { lang: 'de', deck: 'general' });
    expect(texts(backup.tables.concepts)).toContain('Tisch');
    expect(texts(backup.tables.concepts)).not.toContain('Mutter');
    expect(backup.tables.wordSets).toEqual([]);
  });

  it('restoring it into an empty library puts everything back in the right deck and lesson', async () => {
    const { a1 } = await build();
    const backup = await exportBackup(1, { lang: 'de', deck: a1.id });
    const json = JSON.parse(JSON.stringify(backup));

    await db.delete();
    await db.open();
    await ensureDefaultDictionaries();
    const summary = await restoreBackup(json);
    expect(summary.added).toBeGreaterThan(0);

    const concepts = (await db.concepts.toArray()).filter((c) => c.deletedAt === undefined);
    expect(texts(concepts as never)).toEqual(['Mutter', 'Tisch', 'Vater']);
    const mutter = concepts.find((c) => c.text === 'Mutter')!;
    const decks = await db.wordSets.toArray();
    expect(decks.map((d) => d.name)).toEqual(['Goethe A1']);
    expect(mutter.setIds).toEqual([decks[0].id]);
    const lesson = await db.lessons.get(mutter.lessonId!);
    expect(lesson).toMatchObject({ name: 'Family', setId: decks[0].id });
    expect(await db.passages.count()).toBe(1);
    expect((await db.passages.toArray())[0].setId).toBe(decks[0].id);
    expect(await db.scheduleStates.count()).toBe(1);
    expect(await db.reviewLogs.count()).toBe(1);
    // Nothing of deck A2 came.
    expect(concepts.some((c) => c.text === 'Haus')).toBe(false);
  });
});

describe('restoring a partial backup (M16d)', () => {
  it('says it is partial, counts the concepts, merges into what is there and deletes nothing', async () => {
    const { a1, mutter, haus } = await build();
    const backup = await exportBackup(1, { lang: 'de', deck: a1.id });
    const json = JSON.parse(JSON.stringify(backup));

    // Later the library changed: Mutter was edited (newer than the file), a new word was added.
    await db.concepts.update(mutter.id, { text: 'Mutter (neu)', updatedAt: Date.now() + 10_000 });
    const extra = (await saveQuickWord(DE, 'de', 'Brot')).concept;

    const summary = await restoreBackup(json);
    expect(summary.partial).toEqual({ label: 'tiếng Đức · Goethe A1', conceptCount: 2 });
    // Concepts in the file: Mutter (older than here: kept), Vater and the gap word Tisch (same: kept).
    expect(summary.concepts.added).toBe(0);
    expect(summary.concepts.updated).toBe(0);
    expect(summary.concepts.kept).toBe(3);
    // The newer local edit won; nothing else was removed.
    expect((await db.concepts.get(mutter.id))?.text).toBe('Mutter (neu)');
    expect((await db.concepts.get(extra.id))?.deletedAt).toBeUndefined();
    expect((await db.concepts.get(haus.id))?.deletedAt).toBeUndefined();
  });

  it('counts new and updated concepts when the file is newer or brings words that are missing', async () => {
    const { a1, vater } = await build();
    const backup = await exportBackup(1, { lang: 'de', deck: a1.id });
    const json = JSON.parse(JSON.stringify(backup));
    // The copy in the file is newer than the one here for Vater, and Mutter is gone from here.
    json.tables.concepts.find((c: { id: string }) => c.id === vater.id).updatedAt = Date.now() + 10_000;
    json.tables.concepts.find((c: { id: string }) => c.id === vater.id).text = 'Vater (file)';
    await db.concepts.delete(json.tables.concepts.find((c: { text: string }) => c.text === 'Mutter').id);

    const summary = await restoreBackup(json);
    expect(summary.concepts).toEqual({ added: 1, updated: 1, kept: 1 });
    expect((await db.concepts.get(vater.id))?.text).toBe('Vater (file)');
  });

  it('a full backup is not partial, and a damaged scope header does not stop the restore', async () => {
    const { a1 } = await build();
    const full = JSON.parse(JSON.stringify(await exportBackup(1)));
    expect((await restoreBackup(full)).partial).toBeUndefined();

    const scoped = JSON.parse(JSON.stringify(await exportBackup(1, { lang: 'de', deck: a1.id })));
    scoped.scope = 'broken';
    const summary = await restoreBackup(scoped);
    expect(summary.partial).toBeUndefined();
    expect(summary.concepts.kept).toBeGreaterThan(0);
  });
});
