import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createDefaultAttributes } from '../db/defaults';
import { conceptRepository, exampleRepository, reviewLogRepository } from '../db/repositories';
import type { Concept, Example } from '../db/types';
import {
  isWeakVerb,
  presentForms,
  preteriteForms,
  regularPresent,
  tensesAvailable,
} from './de/conjugation';
import {
  dictationTarget,
  germanDictation,
  germanIrregularForms,
  germanNounGenderPlural,
  germanVerbConjugation,
} from './de/modules';
import { exerciseModules, modulesForLanguage } from './index';
import { gradeFields, normalizeAnswer, splitAlternatives } from './grade';
import { buildSession, loadPairs, recordAnswer, summarize } from './session';
import { ReflexTimer } from './timer';

function concept(id: string, text: string, overrides: Partial<Concept> = {}): Concept {
  return {
    id,
    dictionaryId: 'dict-de',
    lang: 'de',
    text,
    meanings: ['nghĩa'],
    verification: 'unverified',
    source: { type: 'import' },
    status: 'loaded',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function example(id: string, conceptId: string | undefined, text: string, overrides: Partial<Example> = {}): Example {
  return {
    id,
    dictionaryId: 'dict-de',
    text,
    targetConceptId: conceptId,
    attributes: createDefaultAttributes(),
    attributesStatus: 'empty',
    verification: 'unverified',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const rngFirst = () => 0;

describe('German conjugation rules', () => {
  it('regular present tense, with linking e, sibilant stems and -eln/-ern', () => {
    expect(regularPresent('machen')).toEqual({
      ich: ['mache'], du: ['machst'], er: ['macht'], wir: ['machen'], ihr: ['macht'], sie: ['machen'],
    });
    expect(regularPresent('arbeiten')?.du).toEqual(['arbeitest']);
    expect(regularPresent('arbeiten')?.er).toEqual(['arbeitet']);
    expect(regularPresent('öffnen')?.ihr).toEqual(['öffnet']);
    expect(regularPresent('reisen')?.du).toEqual(['reist']);
    expect(regularPresent('heißen')?.du).toEqual(['heißt']);
    expect(regularPresent('sammeln')?.ich).toEqual(['sammle']);
    expect(regularPresent('sammeln')?.wir).toEqual(['sammeln']);
    expect(regularPresent('ändern')?.ich).toEqual(['ändere', 'ändre']);
    expect(regularPresent('kommen')?.er).toEqual(['kommt']); // no linking e after -mm
    expect(regularPresent('wohnen')?.er).toEqual(['wohnt']);
  });

  it('recognises weak (regular) verbs by their Präteritum and Partizip II', () => {
    expect(isWeakVerb({ infinitiv: 'machen', praeteritum: 'machte', partizip2: 'gemacht' })).toBe(true);
    expect(isWeakVerb({ infinitiv: 'arbeiten', praeteritum: 'arbeitete', partizip2: 'gearbeitet' })).toBe(true);
    expect(isWeakVerb({ infinitiv: 'besuchen', praeteritum: 'besuchte', partizip2: 'besucht' })).toBe(true);
    expect(isWeakVerb({ infinitiv: 'gehen', praeteritum: 'ging', partizip2: 'gegangen' })).toBe(false);
    expect(isWeakVerb({ infinitiv: 'bringen', praeteritum: 'brachte', partizip2: 'gebracht' })).toBe(false);
    // Separable verbs (two-word Präteritum) are not guessed.
    expect(isWeakVerb({ infinitiv: 'einkaufen', praeteritum: 'kaufte ein', partizip2: 'eingekauft' })).toBe(false);
  });

  it('present: full table for regular verbs, only er/sie/es for stem changers', () => {
    expect(presentForms({ infinitiv: 'machen', praeteritum: 'machte', partizip2: 'gemacht' })?.du).toEqual(['machst']);
    // Strong verb with regular present, confirmed by the stored er-form.
    expect(presentForms({ infinitiv: 'gehen', praesens3sg: 'geht', praeteritum: 'ging', partizip2: 'gegangen' })?.ihr).toEqual(['geht']);
    // Stem changers and sein/haben: only the stored form, never a guess.
    expect(presentForms({ infinitiv: 'fahren', praesens3sg: 'fährt' })).toEqual({ er: ['fährt'] });
    expect(presentForms({ infinitiv: 'essen', praesens3sg: 'isst' })).toEqual({ er: ['isst'] });
    expect(presentForms({ infinitiv: 'sein', praesens3sg: 'ist' })).toEqual({ er: ['ist'] });
    expect(presentForms({ infinitiv: 'haben', praesens3sg: 'hat' })).toEqual({ er: ['hat'] });
    // No data and not provably regular: nothing.
    expect(presentForms({ infinitiv: 'fahren' })).toBeUndefined();
    expect(presentForms({ infinitiv: 'gehen', praeteritum: 'ging', partizip2: 'gegangen' })).toBeUndefined();
  });

  it('preterite forms from the stored Präteritum', () => {
    const gehen = preteriteForms({ praeteritum: 'ging' })!;
    expect(gehen).toMatchObject({ ich: ['ging'], du: ['gingst'], er: ['ging'], wir: ['gingen'], ihr: ['gingt'], sie: ['gingen'] });
    expect(preteriteForms({ praeteritum: 'machte' })).toMatchObject({ du: ['machtest'], wir: ['machten'], ihr: ['machtet'] });
    expect(preteriteForms({ praeteritum: 'fand' })).toMatchObject({ du: ['fandest'], ihr: ['fandet'], wir: ['fanden'] });
    expect(preteriteForms({ praeteritum: 'war' })).toMatchObject({ du: ['warst'], wir: ['waren'], ihr: ['wart'] });
    // du after s/ß is ambiguous (las -> last/lasest): not offered.
    expect(preteriteForms({ praeteritum: 'las' })?.du).toBeUndefined();
    expect(preteriteForms({ praeteritum: 'ging aus' })).toBeUndefined();
  });

  it('lists the tenses that can be asked', () => {
    expect(tensesAvailable(undefined)).toEqual([]);
    expect(tensesAvailable({ infinitiv: 'fahren', praesens3sg: 'fährt', praeteritum: 'fuhr' }).map((t) => t.tense)).toEqual(['praesens', 'praeteritum']);
    expect(tensesAvailable({ infinitiv: 'fahren' })).toEqual([]);
  });
});

describe('grading', () => {
  it('ignores case and whitespace, but umlauts and ß still matter', () => {
    expect(normalizeAnswer('  Äpfel \n')).toBe('äpfel');
    const exercise = germanNounGenderPlural.generate(
      concept('c', 'Apfel', { grammar: { gender: 'der', plural: 'Äpfel' } }),
      example('e', 'c', 'Apfel'),
      { rng: rngFirst, options: {} },
    );
    expect(gradeFields({ gender: 'der', plural: 'Äpfel' }, exercise).correct).toBe(true);
    expect(gradeFields({ gender: 'der', plural: 'äpfel' }, exercise).correct).toBe(true);
    expect(gradeFields({ gender: 'Der', plural: 'ÄPFEL' }, exercise).correct).toBe(true);
    expect(gradeFields({ gender: 'der', plural: 'Aepfel' }, exercise).correct).toBe(false);
    const wrongGender = gradeFields({ gender: 'die', plural: 'Äpfel' }, exercise);
    expect(wrongGender).toMatchObject({ correct: false, perField: { gender: false, plural: true } });
    expect(wrongGender.expected).toEqual({ gender: 'der', plural: 'Äpfel' });
    // Empty answers are wrong, not accidentally right.
    expect(gradeFields({}, exercise).correct).toBe(false);
  });

  it('splits alternative answers', () => {
    expect(splitAlternatives('Äpfel / Apfel')).toEqual(['Äpfel', 'Apfel']);
    expect(splitAlternatives('gegangen')).toEqual(['gegangen']);
  });
});

describe('exercise modules', () => {
  it('registers the four German drills in the registry', () => {
    expect(modulesForLanguage('de').map((m) => m.id).sort()).toEqual([
      'de.dictation',
      'de.irregular-verb-forms',
      'de.noun-gender-plural',
      'de.verb-conjugation',
    ]);
    expect(modulesForLanguage('de')).toHaveLength(4);
    // English drills (M9b) are registered too, in their own language only.
    expect(modulesForLanguage('en').length).toBeGreaterThan(0);
  });

  it('dictation: phrase by default, whole sentence on request, spoken in de-DE', () => {
    const sentence = example('e', 'c', 'Ich esse jeden Tag einen Apfel.', { highlight: { start: 25, end: 30 } });
    expect(dictationTarget(sentence, 'highlight')).toBe('Apfel');
    expect(dictationTarget(sentence, 'sentence')).toBe('Ich esse jeden Tag einen Apfel.');
    // No highlight (e.g. minimal example): the whole text.
    expect(dictationTarget(example('m', 'c', 'Apfel'), 'highlight')).toBe('Apfel');

    const c = concept('c', 'Apfel');
    const phrase = germanDictation.generate(c, sentence, { rng: rngFirst, options: { scope: 'highlight' } });
    expect(phrase.speak).toEqual({ text: 'Apfel', lang: 'de-DE' });
    expect(germanDictation.grade({ answer: 'Apfel' }, phrase).correct).toBe(true);
    expect(germanDictation.grade({ answer: 'apfel' }, phrase).correct).toBe(true);
    expect(germanDictation.grade({ answer: 'Apfal' }, phrase).correct).toBe(false);

    const whole = germanDictation.generate(c, sentence, { rng: rngFirst, options: { scope: 'sentence' } });
    expect(germanDictation.grade({ answer: 'Ich esse jeden Tag einen Apfel' }, whole).correct).toBe(true); // final "." ignored
    expect(germanDictation.grade({ answer: 'Ich esse jeden Tag einen Apfel.' }, whole).correct).toBe(true);
    expect(germanDictation.grade({ answer: 'Ich esse jeden Tag einen Appel.' }, whole).correct).toBe(false);
  });

  it('dictation needs an example that belongs to the concept', () => {
    const c = concept('c', 'Apfel');
    expect(germanDictation.isEligible(c, example('e', 'c', 'Apfel'))).toBe(true);
    expect(germanDictation.isEligible(c, example('x', undefined, 'Apfel'))).toBe(false);
  });

  it('gender + plural: needs a gender; asks the plural only when known', () => {
    expect(germanNounGenderPlural.isEligible(concept('a', 'Apfel'), example('e', 'a', 'x'))).toBe(false);
    const noPlural = concept('b', 'Milch', { grammar: { gender: 'die' } });
    expect(germanNounGenderPlural.isEligible(noPlural, example('e', 'b', 'x'))).toBe(true);
    const ex = germanNounGenderPlural.generate(noPlural, example('e', 'b', 'x'), { rng: rngFirst, options: {} });
    expect(ex.fields.map((f) => f.key)).toEqual(['gender']);
    expect(ex.fields[0].options).toEqual(['der', 'die', 'das']);
  });

  it('conjugation: asks one tense and person with a certain answer', () => {
    const c = concept('v', 'gehen', {
      grammar: { verbForms: { infinitiv: 'gehen', praesens3sg: 'geht', praeteritum: 'ging', partizip2: 'gegangen' } },
    });
    expect(germanVerbConjugation.isEligible(c, example('e', 'v', 'x'))).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const rng = () => ((i * 7919) % 100) / 100;
      const ex = germanVerbConjugation.generate(c, example('e', 'v', 'x'), { rng, options: {} });
      seen.add(ex.detail!);
      // Whatever was asked, the expected answer is a real form.
      expect(['gehe', 'gehst', 'geht', 'gehen', 'ging', 'gingst', 'gingen', 'gingt']).toContain(ex.expected.answer[0]);
    }
    expect(seen.size).toBeGreaterThan(3);
    const asked = germanVerbConjugation.generate(c, example('e', 'v', 'x'), { rng: rngFirst, options: {} });
    expect(asked.detail).toBe('Präsens · ich');
    expect(germanVerbConjugation.grade({ answer: 'gehe' }, asked).correct).toBe(true);
  });

  it('conjugation is not offered without reliable data', () => {
    const c = concept('v', 'fahren', { grammar: { verbForms: { infinitiv: 'fahren' } } });
    expect(germanVerbConjugation.isEligible(c, example('e', 'v', 'x'))).toBe(false);
  });

  it('irregular forms: strong verbs only, both forms must be right', () => {
    const strong = concept('g', 'gehen', { grammar: { verbForms: { infinitiv: 'gehen', praeteritum: 'ging', partizip2: 'gegangen' } } });
    const weak = concept('m', 'machen', { grammar: { verbForms: { infinitiv: 'machen', praeteritum: 'machte', partizip2: 'gemacht' } } });
    expect(germanIrregularForms.isEligible(strong, example('e', 'g', 'x'))).toBe(true);
    expect(germanIrregularForms.isEligible(weak, example('e', 'm', 'x'))).toBe(false);

    const ex = germanIrregularForms.generate(strong, example('e', 'g', 'x'), { rng: rngFirst, options: {} });
    expect(germanIrregularForms.grade({ praeteritum: 'ging', partizip2: 'gegangen' }, ex).correct).toBe(true);
    const half = germanIrregularForms.grade({ praeteritum: 'ging', partizip2: 'gegeht' }, ex);
    expect(half).toMatchObject({ correct: false, perField: { praeteritum: true, partizip2: false } });
  });
});

describe('reflex timer', () => {
  it('measures from start to stop with an injectable clock, once', () => {
    let t = 1000;
    const timer = new ReflexTimer(() => t);
    expect(timer.stop()).toBe(0); // never started
    timer.start();
    t = 3450;
    expect(timer.isRunning()).toBe(true);
    expect(timer.stop()).toBe(2450);
    expect(timer.stop()).toBe(0); // a double submit is not timed twice
  });
});

describe('sessions', () => {
  beforeEach(async () => {
    await db.concepts.clear();
    await db.examples.clear();
    await db.reviewLogs.clear();
  });

  async function seed() {
    await conceptRepository.add(concept('apfel', 'Apfel', { grammar: { gender: 'der', plural: 'Äpfel' }, source: { type: 'import', lesson: 'L1' } }));
    await conceptRepository.add(concept('haus', 'Haus', { grammar: { gender: 'das', plural: 'Häuser' }, source: { type: 'import', lesson: 'L2' } }));
    await conceptRepository.add(concept('kuh', 'Kuh', { grammar: { gender: 'die' }, status: 'acquired' }));
    await conceptRepository.add(concept('tisch', 'Tisch')); // no gender
    await conceptRepository.add(concept('swallow', 'swallow', { lang: 'en', dictionaryId: 'dict-en', grammar: { gender: 'der' } }));
    for (const id of ['apfel', 'haus', 'kuh', 'tisch']) {
      await exampleRepository.add(example(`min-${id}`, id, id, { isMinimal: true }));
    }
    await exampleRepository.add(example('sentence', 'apfel', 'Ich esse einen Apfel.'));
  }

  it('picks drillable, non-acquired German words and prefers real sentences', async () => {
    await seed();
    const pairs = await loadPairs(germanNounGenderPlural, { lang: 'de' }, rngFirst);
    expect(pairs.map((p) => p.concept.id).sort()).toEqual(['apfel', 'haus']);
    expect(pairs.find((p) => p.concept.id === 'apfel')!.example.id).toBe('sentence');
  });

  it('filters by lesson', async () => {
    await seed();
    const pairs = await loadPairs(germanNounGenderPlural, { lang: 'de', lesson: 'L2' }, rngFirst);
    expect(pairs.map((p) => p.concept.id)).toEqual(['haus']);
  });

  it('leaves out inbox sentences and concepts of other modes', async () => {
    await seed();
    await exampleRepository.add(example('inbox', undefined, 'Ein loser Satz.'));
    await conceptRepository.update('haus', { mode: 'depth' });
    const dictation = await loadPairs(germanDictation, { lang: 'de' }, rngFirst);
    expect(dictation.map((p) => p.concept.id).sort()).toEqual(['apfel', 'tisch']);
  });

  it('builds a session of the requested size, each word once', async () => {
    await seed();
    const pairs = await loadPairs(germanDictation, { lang: 'de' }, rngFirst);
    expect(buildSession(pairs, 1, rngFirst)).toHaveLength(1);
    const all = buildSession(pairs, 50, rngFirst);
    expect(all).toHaveLength(pairs.length);
    expect(new Set(all.map((p) => p.concept.id)).size).toBe(all.length);
  });

  it('records each answer with result, drill type, example and reaction time', async () => {
    await seed();
    const [pair] = await loadPairs(germanNounGenderPlural, { lang: 'de', lesson: 'L2' }, rngFirst);
    const ex = germanNounGenderPlural.generate(pair.concept, pair.example, { rng: rngFirst, options: {} });

    const right = await recordAnswer(germanNounGenderPlural, ex, { gender: 'das', plural: 'Häuser' }, 1850, () => 5000);
    const wrong = await recordAnswer(germanNounGenderPlural, ex, { gender: 'der', plural: 'Häuser' }, 4200, () => 6000);
    expect(right.result.correct).toBe(true);
    expect(wrong.result.correct).toBe(false);

    const logs = (await reviewLogRepository.listByConceptId('haus')).sort((a, b) => a.timestamp - b.timestamp);
    expect(logs).toMatchObject([
      { conceptId: 'haus', exampleId: pair.example.id, exerciseType: 'de.noun-gender-plural', correct: true, responseTimeMs: 1850, timestamp: 5000 },
      { correct: false, responseTimeMs: 4200, timestamp: 6000 },
    ]);

    expect(summarize([right, wrong])).toEqual({
      answered: 2,
      correct: 1,
      averageMs: 3025,
      newlyAcquired: [],
      weak: [{ conceptId: 'haus', prompt: 'Haus' }],
    });
  });
});

describe('module-declared UI needs (M9a)', () => {
  const noun = concept('apfel', 'Apfel', { grammar: { gender: 'der', plural: 'Äpfel' } });
  const sentence = example('e1', 'apfel', 'Ich esse einen Apfel.', { highlight: { start: 13, end: 18 } });

  it('every German drill declares its answer box language and special keys', () => {
    for (const module of modulesForLanguage('de')) {
      expect(module.input, module.id).toEqual({ lang: 'de', specialKeys: ['ä', 'ö', 'ü', 'ß'] });
      expect(module.unavailableHint, module.id).toBeTruthy();
    }
  });

  it('a drill reads aloud only if it declares the voice it needs, and the tags agree', () => {
    for (const module of exerciseModules.list()) {
      if (!module.isEligible(noun, sentence)) continue;
      const exercise = module.generate(noun, sentence, { rng: () => 0, options: {} });
      if (exercise.speak) {
        expect(module.speech?.tag, module.id).toBe(exercise.speak.lang);
      } else {
        expect(module.speech, module.id).toBeUndefined();
      }
    }
    expect(exerciseModules.get('de.dictation')?.speech).toEqual({ tag: 'de-DE', label: 'tiếng Đức' });
  });
});
