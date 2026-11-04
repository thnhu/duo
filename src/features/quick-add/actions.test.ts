import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { listExamplesForConcept, listInboxExamples } from '../../db/queries';
import {
  resolveInboxExample,
  saveQuickWord,
  saveSentenceToInbox,
  saveSentenceWithHighlight,
} from './actions';

const DICT_EN = 'dict-en';

beforeEach(async () => {
  await db.concepts.clear();
  await db.examples.clear();
});

describe('saveQuickWord', () => {
  it('creates a concept with a minimal example on first save', async () => {
    const { outcome, concept } = await saveQuickWord(DICT_EN, 'en', 'swallow');
    expect(outcome).toBe('created');

    const examples = await listExamplesForConcept(concept.id);
    expect(examples).toHaveLength(1);
    expect(examples[0].isMinimal).toBe(true);
    expect(examples[0].text).toBe('swallow');
  });

  it('reports a duplicate instead of creating a second concept', async () => {
    await saveQuickWord(DICT_EN, 'en', 'swallow');
    const second = await saveQuickWord(DICT_EN, 'en', 'Swallow'); // case-insensitive match

    expect(second.outcome).toBe('duplicate');
    const allConcepts = await db.concepts.toArray();
    expect(allConcepts).toHaveLength(1);
  });
});

describe('saveSentenceWithHighlight', () => {
  it('creates a new concept from the highlighted phrase and links the example', async () => {
    const sentence = 'She swallowed the pill.';
    const start = sentence.indexOf('swallowed');
    const end = start + 'swallowed'.length;

    const result = await saveSentenceWithHighlight(DICT_EN, 'en', sentence, { start, end });

    expect(result?.conceptOutcome).toBe('created');
    expect(result?.concept.text).toBe('swallowed');
    expect(result?.example.targetConceptId).toBe(result?.concept.id);
    expect(result?.example.highlight).toEqual({ start, end });
  });

  it('links to an existing concept instead of creating a duplicate', async () => {
    await saveQuickWord(DICT_EN, 'en', 'swallow');

    const sentence = 'Just swallow it.';
    const start = sentence.indexOf('swallow');
    const end = start + 'swallow'.length;
    const result = await saveSentenceWithHighlight(DICT_EN, 'en', sentence, { start, end });

    expect(result?.conceptOutcome).toBe('linked');
    const allConcepts = await db.concepts.toArray();
    expect(allConcepts).toHaveLength(1);
  });

  it('returns null for an empty/whitespace-only selection', async () => {
    const result = await saveSentenceWithHighlight(DICT_EN, 'en', 'Hello there', {
      start: 5,
      end: 6,
    });
    expect(result).toBeNull();
  });
});

describe('inbox flow', () => {
  it('saveSentenceToInbox stores an unlinked example found by listInboxExamples', async () => {
    await saveSentenceToInbox(DICT_EN, 'A sentence with no highlight yet.');

    const inbox = await listInboxExamples(DICT_EN);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].targetConceptId).toBeUndefined();
  });

  it('resolveInboxExample links the sentence and removes it from the inbox', async () => {
    const example = await saveSentenceToInbox(DICT_EN, 'A sentence with no highlight yet.');
    const start = example.text.indexOf('highlight');
    const end = start + 'highlight'.length;

    const result = await resolveInboxExample(example, 'en', { start, end });

    expect(result?.concept.text).toBe('highlight');
    const inbox = await listInboxExamples(DICT_EN);
    expect(inbox).toHaveLength(0);
  });
});
