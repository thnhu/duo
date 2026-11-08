import { beforeEach, describe, expect, it } from 'vitest';
import { conceptRepository } from '../db/repositories';
import { db } from '../db/schema';
import { refreshAcquisition } from '../acquisition/update';
import { createLesson } from '../lessons';
import { createPassage, listGaps, loadPassageForEdit, updatePassage } from '../passages';
import { createWordSet } from '../wordsets';
import {
  addItemsToSet,
  autoGaps,
  createChoiceSet,
  deleteChoiceSet,
  listChoiceSets,
  missingFromSet,
  parseItems,
  updateChoiceSet,
} from './index';

const DICT = 'dict-de';
const TEXT = 'Der Lehrer fragt die Schülerin. Kennen Sie das Geschäft? Dass er kommt, ist gut.';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('choice set helpers', () => {
  it('parses tiles: trimmed, no repeats, order kept', () => {
    expect(parseItems('der, das;\ndie  Die\n kein')).toEqual(['der', 'das', 'die', 'kein']);
  });

  it('makes a gap of every whole word that is a tile, ignoring case', () => {
    const gaps = autoGaps(TEXT, ['der', 'das', 'die']);
    expect(gaps.map((g) => TEXT.slice(g.start, g.end))).toEqual(['Der', 'die', 'das']);
    // "Dass" is not "das": only whole words count.
  });

  it('lists the answers the set lacks, once each', () => {
    const gaps = autoGaps(TEXT, ['der', 'das', 'die']);
    expect(missingFromSet(TEXT, gaps, ['der', 'die'])).toEqual(['das']);
    expect(missingFromSet(TEXT, gaps, ['DER', 'Das', 'DIE'])).toEqual([]);
  });
});

describe('choice sets', () => {
  it('creates, renames, edits and deletes; names are unique per language', async () => {
    const made = await createChoiceSet('de', 'Bestimmter Artikel', ['der', 'das', 'die']);
    if (!made.ok) throw new Error('not made');
    expect((await createChoiceSet('de', ' bestimmter  artikel ', ['x'])).ok).toBe(false);
    expect((await createChoiceSet('de', 'Leer', [])).ok).toBe(false);
    expect((await createChoiceSet('en', 'Bestimmter Artikel', ['the'])).ok).toBe(true);

    await updateChoiceSet(made.set.id, { name: 'Artikel', items: ['der', 'die', 'das', 'den'] });
    await addItemsToSet(made.set.id, ['dem', 'DER']);
    expect((await listChoiceSets('de'))[0]).toMatchObject({ name: 'Artikel', items: ['der', 'die', 'das', 'den', 'dem'] });

    await deleteChoiceSet(made.set.id);
    expect(await listChoiceSets('de')).toEqual([]);
  });
});

describe('grammar passages', () => {
  async function setup() {
    const deck = await createWordSet('de', 'Grammatik');
    if (!deck.ok) throw new Error('no deck');
    const lesson = await createLesson('de', deck.set.id, 'Lektion Artikel');
    if (!lesson.ok) throw new Error('no lesson');
    const tiles = await createChoiceSet('de', 'Bestimmter Artikel', ['der', 'das', 'die']);
    if (!tiles.ok) throw new Error('no tiles');
    return { deck: deck.set, lesson: lesson.lesson, tiles: tiles.set };
  }

  it('makes no word: every gap points at one topic concept named after the lesson', async () => {
    const { deck, lesson, tiles } = await setup();
    const before = await db.concepts.count();
    const result = await createPassage({
      dictionaryId: DICT,
      lang: 'de',
      text: TEXT,
      gaps: autoGaps(TEXT, tiles.items),
      setId: deck.id,
      lessonId: lesson.id,
      grammar: true,
      choiceSetId: tiles.id,
    });
    if (!result.ok) throw new Error('not created');
    expect(result).toMatchObject({ gaps: 3, createdWords: 0 });
    expect(result.passage).toMatchObject({ grammar: true, choiceSetId: tiles.id, lessonId: lesson.id });

    // One concept was added: the topic, a 'concept' in the lesson, in the deck.
    expect(await db.concepts.count()).toBe(before + 1);
    const gaps = await listGaps(result.passage.id);
    const topicId = gaps[0].targetConceptId!;
    expect(gaps.every((g) => g.targetConceptId === topicId)).toBe(true);
    const topic = (await conceptRepository.getById(topicId))!;
    expect(topic).toMatchObject({ text: 'Lektion Artikel', kind: 'concept', grammarTopic: true, lessonId: lesson.id });
    expect(topic.setIds).toEqual([deck.id]);

    // A second grammar passage of the lesson reuses the same topic.
    const again = await createPassage({
      dictionaryId: DICT,
      lang: 'de',
      text: 'Das Heft ist gut.',
      gaps: [{ start: 0, end: 3 }],
      setId: deck.id,
      lessonId: lesson.id,
      grammar: true,
    });
    if (!again.ok) throw new Error('not created');
    expect((await listGaps(again.passage.id))[0].targetConceptId).toBe(topicId);
    expect(await db.concepts.count()).toBe(before + 1);
  });

  it('asks to add answers the tile set lacks, and creates nothing meanwhile', async () => {
    const { deck, lesson } = await setup();
    const few = await createChoiceSet('de', 'Nur der', ['der']);
    if (!few.ok) throw new Error('no set');
    const result = await createPassage({
      dictionaryId: DICT,
      lang: 'de',
      text: TEXT,
      gaps: autoGaps(TEXT, ['der', 'das', 'die']),
      setId: deck.id,
      lessonId: lesson.id,
      grammar: true,
      choiceSetId: few.set.id,
    });
    expect(result).toEqual({ ok: false, reason: 'missing-choices', missing: ['die', 'das'] });
    expect(await db.passages.count()).toBe(0);
  });

  it('never sets `acquired` on the topic', async () => {
    const { deck, lesson } = await setup();
    const result = await createPassage({
      dictionaryId: DICT,
      lang: 'de',
      text: TEXT,
      gaps: [{ start: 0, end: 3 }],
      setId: deck.id,
      lessonId: lesson.id,
      grammar: true,
    });
    if (!result.ok) throw new Error('not created');
    const topicId = (await listGaps(result.passage.id))[0].targetConceptId!;
    expect(await refreshAcquisition(topicId)).toBeNull();
  });

  it('follows the lesson on edit: gaps keep their example and move to the new topic', async () => {
    const { deck, lesson } = await setup();
    const other = await createLesson('de', deck.id, 'Lektion Kein');
    if (!other.ok) throw new Error('no lesson');
    const result = await createPassage({
      dictionaryId: DICT,
      lang: 'de',
      text: TEXT,
      gaps: [{ start: 0, end: 3 }],
      setId: deck.id,
      lessonId: lesson.id,
      grammar: true,
    });
    if (!result.ok) throw new Error('not created');
    const before = (await listGaps(result.passage.id))[0];
    const loaded = (await loadPassageForEdit(result.passage.id))!;
    const saved = await updatePassage(result.passage.id, { text: TEXT, gaps: loaded.gaps, lessonId: other.lesson.id });
    expect(saved).toMatchObject({ ok: true, kept: 1, added: 0, removed: 0 });
    const after = (await listGaps(result.passage.id))[0];
    expect(after.id).toBe(before.id);
    expect(after.targetConceptId).not.toBe(before.targetConceptId);
    expect((await conceptRepository.getById(after.targetConceptId!))!.text).toBe('Lektion Kein');
  });

  it('puts a passage with no lesson under the deck topic "Grammatik"', async () => {
    const { deck } = await setup();
    const result = await createPassage({
      dictionaryId: DICT,
      lang: 'de',
      text: TEXT,
      gaps: [{ start: 0, end: 3 }],
      setId: deck.id,
      grammar: true,
    });
    if (!result.ok) throw new Error('not created');
    const topic = (await conceptRepository.getById((await listGaps(result.passage.id))[0].targetConceptId!))!;
    expect(topic.text).toBe('Grammatik');
    expect(topic.lessonId).toBeUndefined();
  });
});

describe('answering a grammar passage with tiles (M17c)', () => {
  async function made(answerMode?: 'type' | 'tiles', items = ['der', 'das', 'die']) {
    const { germanPassage } = await import('../exercises/passage');
    const { loadLibrary } = await import('../exercises/library');
    const deck = await createWordSet('de', 'Grammatik');
    const tiles = await createChoiceSet('de', 'Artikel', items);
    if (!deck.ok || !tiles.ok) throw new Error('setup');
    const text = 'Der Lehrer fragt die Schülerin.';
    const result = await createPassage({
      dictionaryId: DICT,
      lang: 'de',
      text,
      gaps: autoGaps(text, ['der', 'die']),
      setId: deck.set.id,
      grammar: true,
      choiceSetId: tiles.set.id,
      answerMode,
    });
    if (!result.ok) throw new Error('not created');
    const library = await loadLibrary();
    const gaps = await listGaps(result.passage.id);
    const concept = library.concepts.find((c) => c.id === gaps[0].targetConceptId)!;
    const exercise = germanPassage.generate(concept, gaps[0], { rng: Math.random, options: {}, library });
    return { exercise, result, concept, gaps };
  }

  it('defaults to tiles and shows the set in its order', async () => {
    const { exercise, result } = await made();
    expect(result.passage.answerMode).toBe('tiles');
    expect(exercise.tiles).toEqual(['der', 'das', 'die']);
    expect(exercise.fields).toHaveLength(2);
  });

  it('grades a tile answer by the gap, ignoring case', async () => {
    const { exercise } = await made();
    const { germanPassage } = await import('../exercises/passage');
    expect(germanPassage.grade({ g1: 'der', g2: 'die' }, exercise).correct).toBe(true);
    expect(germanPassage.grade({ g1: 'das', g2: 'die' }, exercise)).toMatchObject({ correct: false, perField: { g1: false, g2: true } });
  });

  it('adds an answer the set lacks after it was edited, so it stays answerable', async () => {
    const { exercise, result } = await made('tiles', ['der', 'die']);
    expect(exercise.tiles).toEqual(['der', 'die']);
    // The set loses "die" afterwards: the drill still offers it.
    await updateChoiceSet(result.passage.choiceSetId!, { items: ['der', 'das'] });
    const { germanPassage } = await import('../exercises/passage');
    const { loadLibrary } = await import('../exercises/library');
    const library = await loadLibrary();
    const gaps = await listGaps(result.passage.id);
    const concept = library.concepts.find((c) => c.id === gaps[0].targetConceptId)!;
    const again = germanPassage.generate(concept, gaps[0], { rng: Math.random, options: {}, library });
    expect(again.tiles).toEqual(['der', 'das', 'die']);
  });

  it('types the answer when the passage is set to type', async () => {
    const { exercise, result } = await made('type');
    expect(result.passage.answerMode).toBe('type');
    expect(exercise.tiles).toBeUndefined();
  });
});
