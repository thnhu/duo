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

describe('passage description (M18a)', () => {
  it('is optional, trimmed, editable and clearable; old passages without one are unchanged', async () => {
    const plain = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('towel')] });
    if (!plain.ok) throw new Error('not created');
    expect(plain.passage.prompt).toBeUndefined();
    expect('prompt' in plain.passage).toBe(false);

    const blank = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('towel')], prompt: '   ' });
    if (!blank.ok) throw new Error('not created');
    expect(blank.passage.prompt).toBeUndefined();

    const described = await createPassage({
      dictionaryId: DICT,
      lang: 'en',
      text: TEXT,
      gaps: [at('towel')],
      prompt: '  Điền từ còn thiếu  ',
    });
    if (!described.ok) throw new Error('not created');
    expect(described.passage.prompt).toBe('Điền từ còn thiếu');
    // The description is not part of the text, so no gap can fall in it.
    expect(described.passage.text).toBe(TEXT);

    const loaded = await loadPassageForEdit(described.passage.id);
    const gaps = loaded!.gaps;
    // Left out = unchanged; text edits keep it.
    await updatePassage(described.passage.id, { text: TEXT, gaps });
    expect((await loadPassageForEdit(described.passage.id))!.passage.prompt).toBe('Điền từ còn thiếu');
    await updatePassage(described.passage.id, { text: TEXT, gaps, prompt: 'Mô tả mới' });
    expect((await loadPassageForEdit(described.passage.id))!.passage.prompt).toBe('Mô tả mới');
    await updatePassage(described.passage.id, { text: TEXT, gaps, prompt: '  ' });
    expect((await loadPassageForEdit(described.passage.id))!.passage.prompt).toBeUndefined();
  });

  it('is shown above the question and is not an answer', async () => {
    const created = await createPassage({
      dictionaryId: DICT,
      lang: 'en',
      text: TEXT,
      gaps: [at('towel')],
      prompt: 'Điền từ còn thiếu',
    });
    if (!created.ok) throw new Error('not created');
    const library = await loadLibrary();
    const gaps = await listGaps(created.passage.id);
    const concept = library.concepts.find((c) => c.id === gaps[0].targetConceptId)!;
    const exercise = englishPassage.generate(concept, gaps[0], { rng: Math.random, options: {}, library });
    expect(exercise.intro).toBe('Điền từ còn thiếu');
    expect(exercise.prompt).not.toContain('Điền từ còn thiếu');
    expect(exercise.expected).toEqual({ g1: ['towel'] });

    const plain = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('shaves')] });
    if (!plain.ok) throw new Error('not created');
    const library2 = await loadLibrary();
    const gaps2 = await listGaps(plain.passage.id);
    const concept2 = library2.concepts.find((c) => c.id === gaps2[0].targetConceptId)!;
    expect(englishPassage.generate(concept2, gaps2[0], { rng: Math.random, options: {}, library: library2 }).intro).toBeUndefined();
  });
});

describe('table passages (M18b)', () => {
  it('stores the layout and header flags only for a table; an ordinary passage has neither', async () => {
    const { tableToText } = await import('./table');
    const text = tableToText([
      ['', 'maskulin', 'feminin'],
      ['bestimmter Artikel', 'der', 'die'],
    ]);
    const start = text.indexOf('der');
    const table = await createPassage({
      dictionaryId: 'dict-de',
      lang: 'de',
      text,
      gaps: [{ start, end: start + 3 }],
      layout: 'table',
      tableHeaders: { row: true, col: false },
    });
    if (!table.ok) throw new Error('not created');
    expect(table.passage.layout).toBe('table');
    expect(table.passage.tableHeaders).toEqual({ row: true, col: false });
    expect(table.passage.text).toBe(text);

    const defaults = await createPassage({
      dictionaryId: 'dict-de',
      lang: 'de',
      text,
      gaps: [{ start, end: start + 3 }],
      layout: 'table',
    });
    if (!defaults.ok) throw new Error('not created');
    expect(defaults.passage.tableHeaders).toEqual({ row: true, col: true });

    const plain = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('towel')] });
    if (!plain.ok) throw new Error('not created');
    expect('layout' in plain.passage).toBe(false);
    expect('tableHeaders' in plain.passage).toBe(false);

    // The table keeps its layout when edited as text.
    const loaded = await loadPassageForEdit(table.passage.id);
    await updatePassage(table.passage.id, { text, gaps: loaded!.gaps });
    expect((await loadPassageForEdit(table.passage.id))!.passage.layout).toBe('table');
  });
});

describe('table passage drill (M18c)', () => {
  const rows = [
    ['', 'maskulin', 'neutral', 'feminin'],
    ['bestimmter Artikel', 'der', 'das', 'die'],
    ['unbestimmter Artikel', 'ein', 'ein', 'eine'],
  ];

  async function make(gapWords: string[], extra: Record<string, unknown> = {}) {
    const { tableToText, tableCells } = await import('./table');
    const text = tableToText(rows);
    const cells = tableCells(text).flat();
    const gaps = gapWords.map((w) => {
      const cell = cells.find((c) => c.text === w)!;
      return { start: cell.start, end: cell.end };
    });
    const created = await createPassage({ dictionaryId: 'dict-de', lang: 'de', text, gaps, layout: 'table', prompt: 'Artikel', ...extra });
    if (!created.ok) throw new Error('not created');
    const { germanPassage } = await import('../exercises/passage');
    const library = await loadLibrary();
    const list = await listGaps(created.passage.id);
    const concept = library.concepts.find((c) => c.id === list[0].targetConceptId)!;
    return { exercise: germanPassage.generate(concept, list[0], { rng: Math.random, options: {}, library }), text };
  }

  it('is one question drawn as a grid: headers kept, each gap cell is a field, one submit', async () => {
    const { exercise } = await make(['der', 'das', 'die']);
    expect(exercise.fields).toHaveLength(3);
    expect(exercise.expected).toEqual({ g1: ['der'], g2: ['das'], g3: ['die'] });
    const grid = exercise.table!.rows;
    expect(grid).toHaveLength(3);
    expect(grid[0].map((c) => [c.text, c.header])).toEqual([['', true], ['maskulin', true], ['neutral', true], ['feminin', true]]);
    // The label column is a header; gap cells hide their answer.
    expect(grid[1][0]).toEqual({ text: 'bestimmter Artikel', header: true });
    expect(grid[1].slice(1).map((c) => c.field)).toEqual(['g1', 'g2', 'g3']);
    expect(grid[1].slice(1).every((c) => c.text === '' && !c.header)).toBe(true);
    expect(grid[2].map((c) => c.field)).toEqual([undefined, undefined, undefined, undefined]);
    expect(exercise.intro).toBe('Artikel');
  });

  it('falls back to the plain passage view when a gap is not a whole cell', async () => {
    const { tableToText } = await import('./table');
    const text = tableToText(rows);
    const start = text.indexOf('bestimmter');
    const created = await createPassage({
      dictionaryId: 'dict-de',
      lang: 'de',
      text,
      gaps: [{ start, end: start + 'bestimmter'.length }],
      layout: 'table',
    });
    if (!created.ok) throw new Error('not created');
    const { germanPassage } = await import('../exercises/passage');
    const library = await loadLibrary();
    const list = await listGaps(created.passage.id);
    const concept = library.concepts.find((c) => c.id === list[0].targetConceptId)!;
    const exercise = germanPassage.generate(concept, list[0], { rng: Math.random, options: {}, library });
    expect(exercise.table).toBeUndefined();
    expect(exercise.segments).toBeDefined();
  });

  it('an ordinary passage has no grid', async () => {
    const created = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('towel')] });
    if (!created.ok) throw new Error('not created');
    const library = await loadLibrary();
    const list = await listGaps(created.passage.id);
    const concept = library.concepts.find((c) => c.id === list[0].targetConceptId)!;
    expect(englishPassage.generate(concept, list[0], { rng: Math.random, options: {}, library }).table).toBeUndefined();
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
    expect((await v10.settings.get('default'))?.schemaVersion).toBe(11);
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

describe('moving passages to another deck', () => {
  it('moves them all at once, leaves the words alone, and can be undone', async () => {
    const { movePassagesToDeck, undoMovePassages, listPassagesOfDeck } = await import('./index');
    const { createWordSet } = await import('../wordsets');
    const daily = await createWordSet('en', 'Daily activities');
    if (!daily.ok) throw new Error('deck');
    const mk = async () => {
      const start = TEXT.indexOf('towel');
      const r = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [{ start, end: start + 5 }] });
      if (!r.ok) throw new Error('passage');
      return r.passage.id;
    };
    const ids = [await mk(), await mk()];
    const words = (await db.concepts.toArray()).filter((c) => c.deletedAt === undefined).map((c) => [c.id, c.setIds]);

    const undo = await movePassagesToDeck(ids, daily.set.id);
    expect(undo.previous).toHaveLength(2);
    const live = [daily.set.id];
    expect((await listPassagesOfDeck('en', daily.set.id, live)).map((p) => p.id).sort()).toEqual([...ids].sort());
    expect(await listPassagesOfDeck('en', undefined, live)).toEqual([]);
    // The words did not move.
    expect((await db.concepts.toArray()).filter((c) => c.deletedAt === undefined).map((c) => [c.id, c.setIds])).toEqual(words);

    // Moving again to the same deck changes nothing (nothing to undo).
    expect((await movePassagesToDeck(ids, daily.set.id)).previous).toEqual([]);

    await undoMovePassages(undo);
    expect((await listPassagesOfDeck('en', undefined, live)).map((p) => p.id).sort()).toEqual([...ids].sort());
    expect(await listPassagesOfDeck('en', daily.set.id, live)).toEqual([]);
  });
});

describe('passages by lesson (M17a)', () => {
  it('lists a passage under its lesson, and under none once the lesson is gone', async () => {
    const { createLesson } = await import('../lessons');
    const { lessonRepository } = await import('../db/repositories');
    const { lessonOfPassage, countByLessonKey, passagesOfLesson, NO_LESSON } = await import('./index');
    const lesson = await createLesson('en', undefined, 'Artikel');
    if (!lesson.ok) throw new Error('no lesson');
    const made = await createPassage({
      dictionaryId: DICT,
      lang: 'en',
      text: TEXT,
      gaps: [at('towel')],
      lessonId: lesson.lesson.id,
    });
    const loose = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('shaves')] });
    if (!made.ok || !loose.ok) throw new Error('not created');
    expect(made.passage.lessonId).toBe(lesson.lesson.id);

    const all = await listPassages('en');
    const live = new Set([lesson.lesson.id]);
    expect(lessonOfPassage(made.passage, live)).toBe(lesson.lesson.id);
    expect(countByLessonKey(all, live).get(lesson.lesson.id)).toBe(1);
    expect(passagesOfLesson(all, NO_LESSON, live).map((p) => p.id)).toEqual([loose.passage.id]);

    // Deleting the lesson leaves the passage under "none" without touching it.
    await lessonRepository.softDelete(lesson.lesson.id);
    expect(lessonOfPassage(made.passage, new Set())).toBe(NO_LESSON);
  });

  it('sets the lesson on edit and clears it when the passage changes deck', async () => {
    const { movePassagesToDeck, undoMovePassages } = await import('./index');
    const { createWordSet } = await import('../wordsets');
    const { createLesson } = await import('../lessons');
    const deck = await createWordSet('en', 'Grammatik');
    if (!deck.ok) throw new Error('no deck');
    const lesson = await createLesson('en', deck.set.id, 'Lektion Artikel');
    if (!lesson.ok) throw new Error('no lesson');
    const made = await createPassage({ dictionaryId: DICT, lang: 'en', text: TEXT, gaps: [at('towel')], setId: deck.set.id });
    if (!made.ok) throw new Error('not created');
    const loaded = await loadPassageForEdit(made.passage.id);
    await updatePassage(made.passage.id, {
      text: TEXT,
      gaps: loaded!.gaps,
      setId: deck.set.id,
      lessonId: lesson.lesson.id,
    });
    expect((await loadPassageForEdit(made.passage.id))!.passage.lessonId).toBe(lesson.lesson.id);

    const undo = await movePassagesToDeck([made.passage.id], undefined);
    expect((await loadPassageForEdit(made.passage.id))!.passage.lessonId).toBeUndefined();
    await undoMovePassages(undo);
    expect((await loadPassageForEdit(made.passage.id))!.passage.lessonId).toBe(lesson.lesson.id);

    // '' clears the lesson.
    await updatePassage(made.passage.id, { text: TEXT, gaps: loaded!.gaps, lessonId: '' });
    expect((await loadPassageForEdit(made.passage.id))!.passage.lessonId).toBeUndefined();
  });
});

describe('grammar passages share one topic concept', () => {
  it('offers every passage of the same deck, not one random passage per concept', async () => {
    const { tableToText, tableCells } = await import('./table');
    const { germanPassage } = await import('../exercises/passage');
    const text = tableToText([['', 'm', 'f'], ['bestimmt', 'der', 'die']]);
    const cells = tableCells(text).flat();
    const tableGaps = ['der', 'die'].map((w) => {
      const c = cells.find((x) => x.text === w)!;
      return { start: c.start, end: c.end };
    });
    await createPassage({ dictionaryId: 'dict-de', lang: 'de', text, gaps: tableGaps, layout: 'table', grammar: true });
    const plain = 'Das ist der Hund und die Katze.';
    const plainGaps = ['der', 'die'].map((w) => ({ start: plain.indexOf(w), end: plain.indexOf(w) + w.length }));
    await createPassage({ dictionaryId: 'dict-de', lang: 'de', text: plain, gaps: plainGaps, grammar: true });
    const pairs = await loadPairs(germanPassage, { lang: 'de' });
    expect(new Set(pairs.map((p) => p.example.passageId)).size).toBe(2);
  });

  it('reviews every grammar passage of a shared topic, not one per topic', async () => {
    const { germanPassage } = await import('../exercises/passage');
    const texts = ['Das ist der Hund und die Katze.', 'Ich sehe der Mann und die Frau.'];
    for (const t of texts) {
      const gaps = ['der', 'die'].map((w) => ({ start: t.indexOf(w), end: t.indexOf(w) + w.length }));
      await createPassage({ dictionaryId: 'dict-de', lang: 'de', text: t, gaps, grammar: true });
    }
    const pairs = await loadPairs(germanPassage, { lang: 'de' });
    expect(pairs).toHaveLength(2);
    const library = await loadLibrary();
    for (const pair of pairs) {
      const exercise = germanPassage.generate(pair.concept, pair.example, { rng: () => 0, library, options: {} });
      await recordAnswer(germanPassage, exercise, { g1: 'x', g2: 'y' }, 4000);
    }
    const items = await loadReviewItems({ kind: 'review', count: 50, lang: 'de', now: Date.now() + 60 * 60 * 1000, rng: () => 0 });
    expect(new Set(items.map((i) => i.example.passageId)).size).toBe(2);
  });
});
