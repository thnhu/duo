import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { getVerifiedAttributes } from '../../db/attributes';
import { createDefaultAttributes } from '../../db/defaults';
import { listInboxExamples } from '../../db/queries';
import { exampleRepository } from '../../db/repositories';
import { saveSentenceWithHighlight } from '../quick-add/actions';
import { conceptRepository } from '../../db/repositories';
import { addSecondPhrase, clearExampleAttributes, createExample, createWordFromHighlight, saveExampleEdits } from './actions';

const DICT = 'dict-en';
const SENTENCE = 'She swallowed her pride and left.';

beforeEach(async () => {
  await db.concepts.clear();
  await db.examples.clear();
});

async function makeExample() {
  const { example } = (await saveSentenceWithHighlight(DICT, 'en', SENTENCE, { start: 4, end: 13 }))!;
  return example;
}

describe('saveExampleEdits', () => {
  it('stores hand-picked labels as verified', async () => {
    const example = await makeExample();
    expect(getVerifiedAttributes(example)).toBeNull();

    const attributes = { ...createDefaultAttributes(), tone: 'Informal' as const, mode: 'Spoken' as const };
    const saved = await saveExampleEdits(example, { attributes, note: ' slang ' });

    expect(saved?.attributesStatus).toBe('verified');
    expect(saved?.note).toBe('slang');
    expect(getVerifiedAttributes(saved!)?.tone).toBe('Informal');
  });

  it('re-highlights a different phrase and trims the selection', async () => {
    const example = await makeExample();
    const saved = await saveExampleEdits(example, {
      highlight: { start: 13, end: 23 }, // " her pride" with leading space
      attributes: example.attributes,
      note: '',
    });
    expect(saved?.highlight).toEqual({ start: 14, end: 23 });
    expect(saved?.targetConceptId).toBe(example.targetConceptId);
    expect(saved?.note).toBeUndefined();
  });

  it('rejects an empty highlight without saving anything', async () => {
    const example = await makeExample();
    const saved = await saveExampleEdits(example, {
      highlight: { start: 5, end: 5 },
      attributes: { ...example.attributes, tone: 'Formal' },
      note: '',
    });
    expect(saved).toBeNull();
    const stored = await exampleRepository.getById(example.id);
    expect(stored?.attributesStatus).toBe('empty');
    expect(stored?.highlight).toEqual({ start: 4, end: 13 });
  });
});

describe('unverified labels are never answers', () => {
  it('hides suggested and empty labels', async () => {
    const example = await makeExample();
    expect(getVerifiedAttributes({ ...example, attributesStatus: 'suggested' })).toBeNull();
    expect(getVerifiedAttributes({ ...example, attributesStatus: 'empty' })).toBeNull();
  });

  it('clearing labels returns to empty defaults', async () => {
    const example = await makeExample();
    await saveExampleEdits(example, {
      attributes: { ...createDefaultAttributes(), tone: 'Formal' },
      note: '',
    });
    await clearExampleAttributes(example.id);

    const stored = (await exampleRepository.getById(example.id))!;
    expect(stored.attributesStatus).toBe('empty');
    expect(stored.attributes.tone).toBe('Neutral');
    expect(getVerifiedAttributes(stored)).toBeNull();
  });
});

describe('addSecondPhrase', () => {
  it('creates an unlinked copy of the sentence in the inbox without labels', async () => {
    const example = await makeExample();
    await saveExampleEdits(example, {
      attributes: { ...createDefaultAttributes(), tone: 'Formal' },
      note: 'x',
    });
    const source = (await exampleRepository.getById(example.id))!;

    const copy = await addSecondPhrase(source);

    expect(copy.id).not.toBe(source.id);
    expect(copy.text).toBe(SENTENCE);
    expect(copy.targetConceptId).toBeUndefined();
    expect(copy.highlight).toBeUndefined();
    expect(copy.attributesStatus).toBe('empty');
    expect((await listInboxExamples(DICT)).map((e) => e.id)).toEqual([copy.id]);
  });
});

describe('createExample (add example / examples under add concept)', () => {
  it('links to the chosen concept, keeps the highlight and saves chosen labels as verified', async () => {
    const { createExample } = await import('./actions');
    const { createConceptWithDescription } = await import('../quick-add/actions');
    const { listExpressions } = await import('../../depth');
    const { concept } = await createConceptWithDescription('dict-en', 'en', 'số lượng nhiều', 'a lot');
    const text = '  I have a lot of houses.';
    const start = text.indexOf('a lot of');
    const labelled = await createExample({
      dictionaryId: 'dict-en',
      text,
      highlight: { start, end: start + 'a lot of'.length },
      attributes: { ...createDefaultAttributes(), tone: 'Informal' },
      labelsChosen: true,
      conceptId: concept.id,
    });
    expect(labelled?.text).toBe('I have a lot of houses.');
    expect(labelled?.text.slice(labelled!.highlight!.start, labelled!.highlight!.end)).toBe('a lot of');
    expect(labelled).toMatchObject({ targetConceptId: concept.id, attributesStatus: 'verified' });
    expect(labelled?.attributes.tone).toBe('Informal');

    // Untouched labels never become answers.
    const plain = await createExample({ dictionaryId: 'dict-en', text: 'Hi', conceptId: concept.id });
    expect(plain).toMatchObject({ attributesStatus: 'empty' });
    expect(plain?.highlight).toBeUndefined();
    expect((await listExpressions(concept.id)).map((e) => e.text).sort()).toEqual(['Hi', 'I have a lot of houses.']);

    // No concept: it waits in the inbox. Empty text is refused.
    expect((await createExample({ dictionaryId: 'dict-en', text: 'Hello' }))?.targetConceptId).toBeUndefined();
    expect(await createExample({ dictionaryId: 'dict-en', text: '   ' })).toBeNull();
  });
});

describe('split phrases (separable verb)', () => {
  it('createExample keeps every part of the highlight, shifted past leading spaces', async () => {
    const { createExample } = await import('./actions');
    const text = '  Wir fahren um zwölf Uhr ab. ';
    const created = await createExample({
      dictionaryId: 'dict-de',
      text,
      highlight: { start: 6, end: 12 }, // fahren
      highlightExtra: [{ start: 26, end: 28 }], // ab
    });
    expect(created?.text).toBe('Wir fahren um zwölf Uhr ab.');
    expect(created?.highlight).toEqual({ start: 4, end: 10 });
    expect(created?.highlightExtra).toEqual([{ start: 24, end: 26 }]);
  });

  it('saveExampleEdits replaces the parts, and clears the extra part when only one is given', async () => {
    const { createExample } = await import('./actions');
    const example = (await createExample({
      dictionaryId: 'dict-de',
      text: 'Wir fahren um zwölf Uhr ab.',
      highlight: { start: 4, end: 10 },
      highlightExtra: [{ start: 24, end: 26 }],
    }))!;
    const saved = await saveExampleEdits(example, {
      highlight: { start: 4, end: 10 },
      highlightExtra: [],
      attributes: example.attributes,
      note: '',
    });
    expect(saved?.highlightExtra).toBeUndefined();
  });
});

describe('createWordFromHighlight', () => {
  async function owned() {
    const now = Date.now();
    const owner = { id: 'owner', dictionaryId: DICT, lang: 'en' as const, text: 'số lượng nhiều', kind: 'concept' as const, setIds: ['deck1'], meanings: [], verification: 'unverified' as const, source: { type: 'quick-add' as const }, status: 'loaded' as const, createdAt: now, updatedAt: now };
    await conceptRepository.add(owner);
    const example = (await createExample({ dictionaryId: DICT, text: 'I have a lot of houses.', highlight: { start: 7, end: 15 }, conceptId: 'owner' }))!;
    return { owner, example };
  }

  it('makes the phrase a word with its own copy of the example, in the same deck', async () => {
    const { example } = await owned();
    const result = (await createWordFromHighlight(example, 'en'))!;
    expect(result.created).toBe(true);
    expect(result.word.text).toBe('a lot of');
    expect(result.word.kind).toBe('word');
    expect(result.word.setIds).toEqual(['deck1']);
    expect(result.example?.targetConceptId).toBe(result.word.id);
    expect(result.example?.highlight).toEqual({ start: 7, end: 15 });
    // The original stays in its concept.
    expect((await exampleRepository.getById(example.id))?.targetConceptId).toBe('owner');
  });

  it('reuses an existing word and does not copy the same example twice', async () => {
    const { example } = await owned();
    const first = (await createWordFromHighlight(example, 'en'))!;
    const again = (await createWordFromHighlight(example, 'en'))!;
    expect(again.created).toBe(false);
    expect(again.word.id).toBe(first.word.id);
    expect(again.example).toBeUndefined();
    expect((await exampleRepository.listActive()).filter((e) => e.targetConceptId === first.word.id)).toHaveLength(1);
  });

  it('does nothing without a concept, for a split phrase, or when the phrase is the concept itself', async () => {
    const loose = (await createExample({ dictionaryId: DICT, text: 'I have a lot of houses.', highlight: { start: 7, end: 15 } }))!;
    expect(await createWordFromHighlight(loose, 'en')).toBeNull();
    const { example } = await owned();
    expect(await createWordFromHighlight({ ...example, highlightExtra: [{ start: 16, end: 22 }] }, 'en')).toBeNull();
    const self = (await createExample({ dictionaryId: DICT, text: 'số lượng nhiều', highlight: { start: 0, end: 14 }, conceptId: 'owner' }))!;
    expect(await createWordFromHighlight(self, 'en')).toBeNull();
  });
});
