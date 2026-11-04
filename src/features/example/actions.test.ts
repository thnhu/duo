import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { getVerifiedAttributes } from '../../db/attributes';
import { createDefaultAttributes } from '../../db/defaults';
import { listInboxExamples } from '../../db/queries';
import { exampleRepository } from '../../db/repositories';
import { saveSentenceWithHighlight } from '../quick-add/actions';
import { addSecondPhrase, clearExampleAttributes, saveExampleEdits } from './actions';

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
