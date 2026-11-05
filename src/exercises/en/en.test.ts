import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { createDefaultAttributes } from '../../db/defaults';
import { conceptRepository, exampleRepository } from '../../db/repositories';
import type { Concept, Example } from '../../db/types';
import { exerciseModules, modulesForLanguage } from '../index';
import { loadReviewItems } from '../review';
import { loadPairs, recordAnswer } from '../session';
import {
  distractorMeanings,
  englishCloze,
  englishDictation,
  englishMeaningToWord,
  englishWordToMeaning,
} from './modules';
import { posClass } from './pos';

function concept(id: string, text: string, overrides: Partial<Concept> = {}): Concept {
  return {
    id, dictionaryId: 'dict-en', lang: 'en', text, pos: 'noun', meanings: [`nghĩa của ${text}`],
    verification: 'verified', source: { type: 'import' }, status: 'loaded',
    createdAt: 1, updatedAt: 1, ...overrides,
  };
}

function example(id: string, conceptId: string, text: string, overrides: Partial<Example> = {}): Example {
  return {
    id, dictionaryId: 'dict-en', text, targetConceptId: conceptId,
    attributes: createDefaultAttributes(), attributesStatus: 'empty', verification: 'unverified',
    createdAt: 1, updatedAt: 1, ...overrides,
  };
}

const rng0 = () => 0;
const swallowSentence = example('e1', 'swallow', 'She swallowed the pill.', { highlight: { start: 4, end: 13 } });
const swallow = concept('swallow', 'swallow', { pos: 'verb', meanings: ['nuốt'] });

describe('part-of-speech classes', () => {
  it('recognises the usual spellings, and leaves the rest alone', () => {
    expect(posClass('Noun')).toBe('noun');
    expect(posClass(' danh từ ')).toBe('noun');
    expect(posClass('phrasal verb')).toBe('verb');
    expect(posClass('adjective')).toBe('other');
    expect(posClass(undefined)).toBeUndefined();
    expect(posClass('')).toBeUndefined();
  });
});

describe('en.cloze', () => {
  it('hides exactly the highlighted phrase and keeps the rest as context', () => {
    const ex = englishCloze.generate(swallow, swallowSentence, { rng: rng0, options: {} });
    expect(ex.prompt).toBe('She ＿＿＿＿＿ the pill.');
    expect(ex.expected).toEqual({ answer: ['swallowed'] });
    // The sentence uses another form, so the base word is given as a hint.
    expect(ex.detail).toContain('Từ gốc: swallow');
    expect(ex.detail).toContain('nuốt');
  });

  it('does not care about capital letters (but still about spelling)', () => {
    const ex = englishCloze.generate(swallow, swallowSentence, { rng: rng0, options: {} });
    expect(englishCloze.grade({ answer: 'Swallowed' }, ex).correct).toBe(true);
    expect(englishCloze.grade({ answer: '  SWALLOWED ' }, ex).correct).toBe(true);
    expect(englishCloze.grade({ answer: 'swalowed' }, ex).correct).toBe(false);
    expect(englishCloze.grade({ answer: '' }, ex).correct).toBe(false);
  });

  it('needs a real sentence with a phrase highlighted inside it', () => {
    expect(englishCloze.isEligible(swallow, swallowSentence)).toBe(true);
    // no highlight / only the auto-created minimal example / whole sentence highlighted
    expect(englishCloze.isEligible(swallow, example('a', 'swallow', 'She swallowed the pill.'))).toBe(false);
    expect(englishCloze.isEligible(swallow, example('b', 'swallow', 'swallow', { isMinimal: true, highlight: { start: 0, end: 7 } }))).toBe(false);
    expect(englishCloze.isEligible(swallow, example('c', 'swallow', 'Break a leg', { highlight: { start: 0, end: 11 } }))).toBe(false);
    // a German word is not for the English drill
    expect(englishCloze.isEligible(concept('x', 'Apfel', { lang: 'de' }), example('d', 'x', 'Ein Apfel', { highlight: { start: 4, end: 9 } }))).toBe(false);
  });

  it('works for words that are not verified yet (it only uses PO\'s own sentence)', () => {
    const raw = concept('swallow', 'swallow', { verification: 'unverified', meanings: ['to swallow (từ tra cứu)'] });
    expect(englishCloze.isEligible(raw, swallowSentence)).toBe(true);
    // ...but the unchecked meaning is not shown as a hint.
    expect(englishCloze.generate(raw, swallowSentence, { rng: rng0, options: {} }).detail).not.toContain('tra cứu');
  });
});

describe('en.meaning-to-word', () => {
  const chew = concept('chew', 'chew', { meanings: ['nhai', 'gặm'] });
  const e = example('e', 'chew', 'chew');

  it('is for verified single-word nouns only', () => {
    expect(englishMeaningToWord.isEligible(chew, e)).toBe(true);
    expect(englishMeaningToWord.isEligible(concept('v', 'run', { pos: 'verb' }), e)).toBe(false);
    expect(englishMeaningToWord.isEligible(concept('n', 'no pos', { pos: undefined }), e)).toBe(false);
    expect(englishMeaningToWord.isEligible(concept('p', 'ice cream'), e)).toBe(false);
    expect(englishMeaningToWord.isEligible(concept('u', 'chew', { verification: 'unverified' }), e)).toBe(false);
    expect(englishMeaningToWord.isEligible(concept('m', 'chew', { meanings: [] }), e)).toBe(false);
  });

  it('shows the meaning with a hint, and accepts the word in any case', () => {
    const ex = englishMeaningToWord.generate(chew, e, { rng: rng0, options: {} });
    expect(ex.prompt).toBe('nhai; gặm');
    expect(ex.detail).toBe('4 chữ cái, bắt đầu bằng "c"');
    expect(englishMeaningToWord.grade({ answer: 'Chew' }, ex).correct).toBe(true);
    expect(englishMeaningToWord.grade({ answer: 'chow' }, ex).correct).toBe(false);
  });
});

describe('en.word-to-meaning', () => {
  const library = {
    concepts: [
      swallow,
      concept('a', 'apple', { meanings: ['quả táo'] }),
      concept('b', 'bread', { meanings: ['bánh mì'] }),
      concept('c', 'cheese', { meanings: ['phô mai'] }),
      concept('same', 'gulp', { meanings: ['nuốt'] }), // same meaning as the answer: never a wrong choice
      concept('raw', 'rice', { meanings: ['cơm'], verification: 'unverified' }),
      concept('de', 'Brot', { lang: 'de', meanings: ['bánh mì Đức'] }),
      concept('gone', 'milk', { meanings: ['sữa'], deletedAt: 5 }),
    ],
  };

  it('takes wrong choices only from other verified English words', () => {
    expect(distractorMeanings(swallow, library).sort()).toEqual(['bánh mì', 'phô mai', 'quả táo']);
  });

  it('needs at least three wrong choices to be playable', () => {
    expect(englishWordToMeaning.isEligible(swallow, swallowSentence, library)).toBe(true);
    expect(englishWordToMeaning.isEligible(swallow, swallowSentence, { concepts: library.concepts.slice(0, 3) })).toBe(false);
    expect(englishWordToMeaning.isEligible(swallow, swallowSentence)).toBe(false);
  });

  it('is for verbs and phrases (not single nouns), verified only', () => {
    expect(englishWordToMeaning.isEligible(concept('n', 'apple'), swallowSentence, library)).toBe(false);
    const phrase = concept('p', 'look after', { pos: undefined, meanings: ['chăm sóc'] });
    expect(englishWordToMeaning.isEligible(phrase, example('pe', 'p', 'look after'), library)).toBe(true);
    expect(englishWordToMeaning.isEligible(concept('u', 'swallow', { pos: 'verb', verification: 'unverified' }), swallowSentence, library)).toBe(false);
  });

  it('offers four different choices including the right one, and grades by choice', () => {
    for (const rng of [() => 0, () => 0.5, () => 0.99]) {
      const ex = englishWordToMeaning.generate(swallow, swallowSentence, { rng, options: {}, library });
      const options = ex.fields[0].options!;
      expect(options).toHaveLength(4);
      expect(new Set(options).size).toBe(4);
      expect(options).toContain('nuốt');
      expect(ex.prompt).toBe('swallow');
      expect(ex.detail).toBe('She swallowed the pill.'); // the real sentence is the context
      expect(englishWordToMeaning.grade({ answer: 'nuốt' }, ex).correct).toBe(true);
      expect(englishWordToMeaning.grade({ answer: options.find((o) => o !== 'nuốt')! }, ex).correct).toBe(false);
    }
  });
});

describe('en.dictation', () => {
  it('reads the highlighted phrase (or the whole sentence) with the English voice', () => {
    const phrase = englishDictation.generate(swallow, swallowSentence, { rng: rng0, options: { scope: 'highlight' } });
    expect(phrase.speak).toEqual({ text: 'swallowed', lang: 'en-US' });
    const whole = englishDictation.generate(swallow, swallowSentence, { rng: rng0, options: { scope: 'sentence' } });
    expect(whole.speak?.text).toBe('She swallowed the pill.');
    expect(englishDictation.speech).toEqual({ tag: 'en-US', label: 'tiếng Anh' });
    // case and the final full stop do not matter
    expect(englishDictation.grade({ answer: 'she swallowed the pill' }, whole).correct).toBe(true);
    expect(englishDictation.grade({ answer: 'she swalowed the pill' }, whole).correct).toBe(false);
  });
});

describe('English drills in the runner', () => {
  beforeEach(async () => {
    for (const t of [db.concepts, db.examples, db.reviewLogs, db.scheduleStates]) await t.clear();
    await conceptRepository.add(swallow);
    await exampleRepository.add(swallowSentence);
    for (const [id, text, meaning] of [['a', 'apple', 'quả táo'], ['b', 'bread', 'bánh mì'], ['c', 'cheese', 'phô mai']]) {
      await conceptRepository.add(concept(id, text, { meanings: [meaning] }));
      await exampleRepository.add(example(`e-${id}`, id, text, { isMinimal: true }));
    }
  });

  it('is registered for English only, and declares an English answer box', () => {
    expect(modulesForLanguage('en').map((m) => m.id).sort()).toEqual([
      'en.cloze', 'en.deep-label', 'en.deep-situation', 'en.dictation', 'en.meaning-to-word', 'en.word-to-meaning',
    ]);
    for (const module of modulesForLanguage('en')) {
      expect(module.input, module.id).toEqual({ lang: 'en' });
      expect(module.unavailableHint, module.id).toBeTruthy();
    }
    expect(modulesForLanguage('de').some((m) => m.id.startsWith('en.'))).toBe(false);
  });

  it('counts the words each drill can use from the database', async () => {
    const count = async (id: string) => (await loadPairs(exerciseModules.get(id)!, { lang: 'en' })).length;
    expect(await count('en.cloze')).toBe(1); // only the real sentence with a highlight
    expect(await count('en.word-to-meaning')).toBe(1); // only the verb; nouns are not asked here
    expect(await count('en.meaning-to-word')).toBe(3); // the three nouns
    expect(await count('en.dictation')).toBe(4);
    expect(await loadPairs(exerciseModules.get('en.cloze')!, { lang: 'de' })).toEqual([]);
  });

  it('flash/review mix English drills in, and answers are recorded like any other', async () => {
    const items = await loadReviewItems({ kind: 'flash', count: 10, rng: rng0 });
    expect(items.map((i) => i.concept.id).sort()).toEqual(['a', 'b', 'c', 'swallow']);
    expect(items.every((i) => i.module.languages.includes('en'))).toBe(true);

    const item = items.find((i) => i.concept.id === 'swallow')!;
    const exercise = item.module.generate(item.concept, item.example, { rng: rng0, options: {}, library: { concepts: [swallow] } });
    const answer = { answer: exercise.expected.answer[0] };
    const record = await recordAnswer(item.module, exercise, answer, 900);
    expect(record.result.correct).toBe(true);
    expect(await db.reviewLogs.count()).toBe(1);
    expect(await db.scheduleStates.count()).toBe(1);
  });
});
