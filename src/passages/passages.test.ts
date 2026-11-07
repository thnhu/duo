import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { exampleRepository } from '../db/repositories';
import { listExpressions } from '../depth';
import { exerciseModules } from '../exercises';
import { englishPassage } from '../exercises/passage';
import { loadLibrary } from '../exercises/library';
import { loadReviewItems } from '../exercises/review';
import { loadPairs, recordAnswer } from '../exercises/session';
import { cleanGaps, createPassage, deletePassage, listGaps, listPassages, loadPassageForEdit, remapGaps, segmentText, toggleGap, updatePassage } from './index';

const DICT = 'dict-en';
const TEXT = 'He brushes his teeth, shaves, and takes a shower. He dries himself off with a towel.';

function at(word: string, from = 0) {
  const start = TEXT.indexOf(word, from);
  return { start, end: start + word.length };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('passages', () => {
  it('keeps clean, ordered, non-overlapping gaps', () => {
    const cleaned = cleanGaps(TEXT, [at('shaves'), { start: at('brushes').start - 1, end: at('brushes').end + 1 }, { start: 0, end: 0 }, at('shaves')]);
    expect(cleaned.map((g) => TEXT.slice(g.start, g.end))).toEqual(['brushes', 'shaves']);
  });

  it('creates a passage with one gap example and one word per gap', async () => {
    const result = await createPassage({
      dictionaryId: DICT,
      lang: 'en',
      title: 'Morning',
      text: `  ${TEXT}`,
      gaps: [at('brushes'), at('shaves'), at('towel')].map((g) => ({ start: g.start + 2, end: g.end + 2 })),
    });
    if (!result.ok) throw new Error('not created');
    expect(result).toMatchObject({ gaps: 3, createdWords: 3 });
    const gaps = await listGaps(result.passage.id);
    expect(gaps.map((g) => g.text.slice(g.highlight!.start, g.highlight!.end))).toEqual(['brushes', 'shaves', 'towel']);
    expect(gaps.every((g) => g.passageId === result.passage.id && g.targetConceptId)).toBe(true);
    expect((await listPassages('en')).map((p) => p.title)).toEqual(['Morning']);

    // A gap word already in the library is reused, not duplicated.
    const again = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('shaves')] });
    expect(again).toMatchObject({ ok: true, createdWords: 0 });
    expect(await createPassage({ dictionaryId: DICT, lang: 'en', text: '   ', gaps: [] })).toEqual({ ok: false, reason: 'empty' });
    expect(await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [] })).toEqual({ ok: false, reason: 'no-gaps' });
  });

  it('drill: whole passage, every gap logged on its own example, other drills ignore gaps', async () => {
    const created = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('brushes'), at('shaves'), at('towel')] });
    if (!created.ok) throw new Error('not created');

    // One question per passage, not one per word.
    const pairs = await loadPairs(englishPassage, { lang: 'en' });
    expect(pairs).toHaveLength(1);
    // Other drills never use a passage gap as their example.
    for (const id of ['en.cloze', 'en.dictation']) {
      for (const pair of await loadPairs(exerciseModules.get(id)!, { lang: 'en' })) {
        expect(pair.example.passageId, id).toBeUndefined();
      }
    }

    const library = await loadLibrary();
    const exercise = englishPassage.generate(pairs[0].concept, pairs[0].example, { rng: () => 0, library, options: {} });
    expect(exercise.fields).toHaveLength(3);
    expect(exercise.prompt).toContain('(1) _____');
    expect(exercise.prompt).not.toContain('brushes');
    expect(exercise.prompt).toContain('his teeth,');
    // The screen draws the boxes inside the text: text pieces and gap fields alternate in reading order.
    expect(exercise.segments?.filter((x) => 'field' in x).map((x) => (x as { field: string }).field)).toEqual(['g1', 'g2', 'g3']);
    expect(exercise.segments?.map((x) => ('text' in x ? x.text : '')).join('')).toBe(TEXT.replace('brushes', '').replace('shaves', '').replace('towel', ''));

    const right = await recordAnswer(englishPassage, exercise, { g1: 'BRUSHES', g2: 'shaves', g3: 'wrong' }, 9000);
    expect(right.result.perField).toEqual({ g1: true, g2: true, g3: false });
    expect(right.result.correct).toBe(false);
    const logs = await db.reviewLogs.toArray();
    expect(logs).toHaveLength(3);
    expect(logs.map((l) => l.correct).sort()).toEqual([false, true, true]);
    expect(new Set(logs.map((l) => l.exampleId)).size).toBe(3);
    expect(logs.every((l) => l.responseTimeMs === 3000)).toBe(true);
    expect((await db.scheduleStates.toArray()).length).toBe(3);
  });

  it('review asks a passage once even when several of its gaps are due', async () => {
    const created = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('brushes'), at('shaves')] });
    if (!created.ok) throw new Error('not created');
    const [pair] = await loadPairs(englishPassage, { lang: 'en' });
    const library = await loadLibrary();
    const exercise = englishPassage.generate(pair.concept, pair.example, { rng: () => 0, library, options: {} });
    await recordAnswer(englishPassage, exercise, { g1: 'x', g2: 'y' }, 4000); // wrong: both gaps come back soon
    const items = await loadReviewItems({ kind: 'review', count: 50, lang: 'en', now: Date.now() + 60 * 60 * 1000, rng: () => 0 });
    expect(items).toHaveLength(1);
    expect(items[0].module.id).toBe('en.passage-cloze');
  });

  it('deleting a passage removes its gaps but keeps the words; gaps are not expressions of a concept', async () => {
    const created = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('brushes'), at('towel')] });
    if (!created.ok) throw new Error('not created');
    const [first] = await listGaps(created.passage.id);
    expect((await listExpressions(first.targetConceptId!)).filter((e) => e.passageId)).toHaveLength(0);
    expect(await deletePassage(created.passage.id)).toBe(2);
    expect(await listPassages('en')).toHaveLength(0);
    expect((await exampleRepository.listActive()).filter((e) => e.passageId)).toHaveLength(0);
    expect((await db.concepts.toArray()).filter((c) => c.deletedAt === undefined)).toHaveLength(2);
  });
});

describe('editing a passage', () => {
  const OLD = 'He brushes his teeth, shaves, and takes a shower.';
  const g = (word: string) => ({ start: OLD.indexOf(word), end: OLD.indexOf(word) + word.length });
  const words = (text: string, gaps: Array<{ start: number; end: number }>) => gaps.map((x) => text.slice(x.start, x.end));

  it('remapGaps: gaps follow the edit instead of being lost', () => {
    const gaps = [g('brushes'), g('shaves'), g('shower')];
    // Insert before every gap: all shift.
    let text = 'Every day he brushes his teeth, shaves, and takes a shower.';
    let next = remapGaps(OLD, 'Every day h' + OLD.slice(1), gaps);
    expect(words('Every day h' + OLD.slice(1), next)).toEqual(['brushes', 'shaves', 'shower']);
    // Insert between gaps: only later gaps shift.
    text = 'He brushes his teeth, shaves, and then takes a shower.';
    next = remapGaps(OLD, text, gaps);
    expect(words(text, next)).toEqual(['brushes', 'shaves', 'shower']);
    // Typo fixed inside a gap word: the gap is kept and resized.
    text = 'He brushed his teeth, shaves, and takes a shower.';
    next = remapGaps(OLD, text, gaps);
    expect(words(text, next)).toEqual(['brushed', 'shaves', 'shower']);
    // An edit that cuts across a gap's edge drops only that gap.
    text = 'He brusxxes his teeth, shaves, and takes a shower.'.replace('brusxxes', 'brusAB');
    next = remapGaps(OLD, text, gaps);
    expect(words(text, next)).toContain('shaves');
    // Deleting a whole gap word removes it.
    text = 'He his teeth, shaves, and takes a shower.';
    next = remapGaps(OLD, text, gaps);
    expect(words(text, next)).toEqual(['shaves', 'shower']);
    expect(remapGaps(OLD, OLD, gaps)).toBe(gaps);
  });

  it('updatePassage keeps the schedule of kept gaps, deletes removed ones and adds new ones', async () => {
    const created = await createPassage({ dictionaryId: DICT, lang: 'en', text: OLD, gaps: [g('brushes'), g('shaves')] });
    if (!created.ok) throw new Error('not created');
    const loaded = (await loadPassageForEdit(created.passage.id))!;
    expect(loaded.gaps).toHaveLength(2);
    const [brushes, shaves] = loaded.gaps;

    // Answer once so "brushes" has a schedule worth keeping.
    const [pair] = await loadPairs(englishPassage, { lang: 'en' });
    const library = await loadLibrary();
    const exercise = englishPassage.generate(pair.concept, pair.example, { rng: () => 0, library, options: {} });
    await recordAnswer(englishPassage, exercise, { g1: 'brushes', g2: 'shaves' }, 2000);
    expect(await db.scheduleStates.count()).toBe(2);

    // Edit: add a sentence in front, drop "shaves", add "shower" as a new gap.
    const text = 'Every morning, ' + OLD;
    const shift = 'Every morning, '.length;
    const kept = remapGaps(OLD, text, [brushes]);
    const result = await updatePassage(created.passage.id, {
      title: 'Morning',
      text,
      gaps: [...kept, { start: text.indexOf('shower'), end: text.indexOf('shower') + 6 }],
    });
    expect(result).toEqual({ ok: true, kept: 1, added: 1, removed: 1, createdWords: 1 });
    expect(kept[0].start).toBe(brushes.start + shift);

    const gaps = await listGaps(created.passage.id);
    expect(gaps.map((x) => x.text.slice(x.highlight!.start, x.highlight!.end))).toEqual(['brushes', 'shower']);
    expect(gaps.every((x) => x.text === text)).toBe(true);
    expect(gaps[0].id).toBe(brushes.exampleId); // same example: schedule and history kept
    expect(gaps.some((x) => x.id === shaves.exampleId)).toBe(false);
    expect((await listPassages('en'))[0]).toMatchObject({ title: 'Morning', text });
    expect(await db.scheduleStates.get(brushes.exampleId!)).toBeTruthy();

    expect(await updatePassage(created.passage.id, { text: text, gaps: [] })).toEqual({ ok: false, reason: 'no-gaps' });
    expect(await updatePassage('missing', { text, gaps: kept })).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('gap view helpers', () => {
  const T = 'He brushes his teeth, shaves.';
  it('segmentText cuts the passage into gaps, words and plain text', () => {
    const gaps = [{ start: 3, end: 10 }]; // brushes
    const segs = segmentText(T, gaps);
    expect(segs.map((x) => `${x.kind}:${T.slice(x.start, x.end)}`)).toEqual([
      'word:He', 'plain: ', 'gap:brushes', 'plain: ', 'word:his', 'plain: ', 'word:teeth', 'plain:, ', 'word:shaves', 'plain:.',
    ]);
    expect(segs.find((x) => x.kind === 'gap')?.gap).toBe(1);
    // Every character is in exactly one segment, in order.
    expect(segs.map((x) => T.slice(x.start, x.end)).join('')).toBe(T);
  });

  it('toggleGap adds a gap on a word and removes it when tapped again; keeps example ids', () => {
    const added = toggleGap(T, [], 3, 10);
    expect(added).toEqual([{ start: 3, end: 10 }]);
    const withId = [{ start: 3, end: 10, exampleId: 'e1' }];
    expect(toggleGap(T, withId, 3, 10)).toEqual([]);
    // A second word is added next to the first, which keeps its id.
    const both = toggleGap(T, withId, 21, 27);
    expect(both).toHaveLength(2);
    expect(both[0]).toMatchObject({ exampleId: 'e1' });
    // A phrase selection touching a gap removes that gap instead of overlapping it.
    expect(toggleGap(T, withId, 0, 14)).toEqual([]);
  });
});

describe('passages by deck (read only when a deck is opened)', () => {
  it('remembers the deck, counts per deck without reading texts into the screen, and lists one deck', async () => {
    const { countPassagesByDeck, listPassagesOfDeck, countGapsOf } = await import('./index');
    const { createWordSet } = await import('../wordsets');
    const it1 = await createWordSet('en', 'IT');
    const films = await createWordSet('en', 'Films');
    if (!it1.ok || !films.ok) throw new Error('decks');
    const mk = async (text: string, setId?: string) => {
      const start = TEXT.indexOf('towel');
      const r = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [{ start, end: start + 5 }], title: text, setId });
      if (!r.ok) throw new Error('passage');
      return r.passage;
    };
    const a = await mk('general one');
    const b = await mk('it one', it1.set.id);
    await mk('it two', it1.set.id);
    expect(b.setId).toBe(it1.set.id);
    expect(a.setId).toBeUndefined();

    const ids = [it1.set.id, films.set.id];
    const counts = await countPassagesByDeck('en', ids);
    expect(counts.general).toBe(1);
    expect(counts.bySet.get(it1.set.id)).toBe(2);
    expect(counts.bySet.get(films.set.id)).toBe(0);
    expect(await countPassagesByDeck('de', ids)).toEqual({ general: 0, bySet: new Map(ids.map((id) => [id, 0])) });

    expect((await listPassagesOfDeck('en', it1.set.id, ids)).map((p) => p.title).sort()).toEqual(['it one', 'it two']);
    expect((await listPassagesOfDeck('en', undefined, ids)).map((p) => p.title)).toEqual(['general one']);
    expect(await listPassagesOfDeck('en', films.set.id, ids)).toEqual([]);

    // A passage whose deck is gone is counted and listed under General.
    expect((await countPassagesByDeck('en', [films.set.id])).general).toBe(3);
    expect((await listPassagesOfDeck('en', undefined, [films.set.id])).length).toBe(3);

    // Gap counts are looked up per passage, deleted gaps not counted.
    const gapCounts = await countGapsOf([a.id, b.id]);
    expect(gapCounts.get(a.id)).toBe(1);
    await deletePassage(a.id);
    expect((await countGapsOf([a.id])).get(a.id)).toBe(0);
    expect((await listGaps(b.id)).length).toBe(1);
    // A deleted passage is not counted.
    expect((await countPassagesByDeck('en', ids)).general).toBe(0);
  });
});

describe('older passages get the deck of their words', () => {
  it('picks the deck most gap words are in; ties go to the smaller id; no deck stays General', async () => {
    const { guessPassageDecks } = await import('../db/passageDeckMigration');
    const word = (id: string, setIds?: string[]) =>
      ({ id, dictionaryId: DICT, lang: 'en', text: id, meanings: [], verification: 'unverified', source: { type: 'import' }, status: 'loaded', createdAt: 1, updatedAt: 1, ...(setIds ? { setIds } : {}) }) as never;
    const gap = (id: string, passageId: string, conceptId: string, deletedAt?: number) =>
      ({ id, dictionaryId: DICT, text: 't', targetConceptId: conceptId, passageId, attributes: {}, attributesStatus: 'empty', verification: 'unverified', createdAt: 1, updatedAt: 1, ...(deletedAt ? { deletedAt } : {}) }) as never;
    const passage = (id: string, extra = {}) => ({ id, dictionaryId: DICT, lang: 'en', text: 't', updatedAt: 1, ...extra }) as never;

    const guessed = guessPassageDecks(
      [passage('p1'), passage('p2'), passage('p3'), passage('p4', { setId: 'IT' }), passage('p5'), passage('p6', { deletedAt: 3 })],
      [
        gap('g1', 'p1', 'a'), gap('g2', 'p1', 'b'), gap('g3', 'p1', 'e'), // IT x2, Films x1 (b is in both), one word in no deck
        gap('g4', 'p2', 'c'), gap('g5', 'p2', 'd'), // Films x1 (c) + Gone x1 (d): Films, "Gone" is not live
        gap('g6', 'p3', 'e'), // word in no deck
        gap('g7', 'p5', 'a', 9), gap('g8', 'p5', 'c'), // the deleted gap does not vote
      ],
      [word('a', ['IT']), word('b', ['IT', 'Films']), word('c', ['Films']), word('d', ['Gone']), word('e')],
      new Set(['IT', 'Films']),
    );
    expect(guessed.get('p1')).toBe('IT');
    expect(guessed.get('p2')).toBe('Films');
    expect(guessed.has('p3')).toBe(false); // stays General
    expect(guessed.has('p4')).toBe(false); // already has a deck
    expect(guessed.get('p5')).toBe('Films');
    expect(guessed.has('p6')).toBe(false); // deleted
    // Tie: IT x1, Films x1 -> "Films" sorts before "IT".
    const tie = guessPassageDecks([passage('t')], [gap('x', 't', 'b')], [word('b', ['IT', 'Films'])], new Set(['IT', 'Films']));
    expect(tie.get('t')).toBe('Films');
  });

  it('upgrades a real v9 database: passages without a deck get one, and the screen shows them there', async () => {
    const { default: Dexie } = await import('dexie');
    const { DuoDB } = await import('../db/schema');
    const name = 'duo-migration-v9-to-v10';
    const v9 = new Dexie(name);
    v9.version(9).stores({
      dictionaries: 'id, lang',
      concepts: 'id, dictionaryId, lang, status, [dictionaryId+text], updatedAt, deletedAt',
      examples: 'id, dictionaryId, targetConceptId, passageId, attributesStatus, updatedAt, deletedAt',
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
      lessons: 'id, lang, setId, updatedAt, deletedAt',
    });
    await v9.open();
    await v9.table('wordSets').add({ id: 'IT', name: 'IT', lang: 'en', updatedAt: 1 });
    await v9.table('concepts').add({ id: 'w', dictionaryId: DICT, lang: 'en', text: 'router', meanings: [], setIds: ['IT'], createdAt: 1, updatedAt: 1, source: { type: 'import' } });
    await v9.table('passages').bulkAdd([
      { id: 'old', dictionaryId: DICT, lang: 'en', text: 'The router works.', updatedAt: 1 },
      { id: 'lonely', dictionaryId: DICT, lang: 'en', text: 'Nothing here.', updatedAt: 1 },
    ]);
    await v9.table('examples').add({ id: 'g', dictionaryId: DICT, text: 'The router works.', targetConceptId: 'w', passageId: 'old', highlight: { start: 4, end: 10 }, createdAt: 1, updatedAt: 1 });
    await v9.table('settings').add({ id: 'default', schemaVersion: 9 });
    v9.close();

    const v10 = new DuoDB(name);
    await v10.open();
    expect((await v10.passages.get('old'))?.setId).toBe('IT');
    expect((await v10.passages.get('lonely'))?.setId).toBeUndefined();
    expect((await v10.settings.get('default'))?.schemaVersion).toBe(10);
    v10.close();
    await Dexie.delete(name);
  });

  it('editing can move a passage to another deck, or leave it where it is', async () => {
    const { createWordSet } = await import('../wordsets');
    const it1 = await createWordSet('en', 'IT');
    if (!it1.ok) throw new Error('deck');
    const made = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('towel')] });
    if (!made.ok) throw new Error('passage');
    const edit = { text: TEXT, gaps: await listGaps(made.passage.id).then((g) => g.map((e) => ({ start: e.highlight!.start, end: e.highlight!.end, exampleId: e.id }))) };

    await updatePassage(made.passage.id, { ...edit, setId: it1.set.id });
    expect((await db.passages.get(made.passage.id))?.setId).toBe(it1.set.id);
    await updatePassage(made.passage.id, { ...edit }); // no setId: unchanged
    expect((await db.passages.get(made.passage.id))?.setId).toBe(it1.set.id);
    await updatePassage(made.passage.id, { ...edit, setId: '' }); // back to General
    expect((await db.passages.get(made.passage.id))?.setId).toBeUndefined();
  });
});
