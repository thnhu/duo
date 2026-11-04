import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { conceptRepository, exampleRepository } from '../../db/repositories';
import { listInboxExamples } from '../../db/queries';
import { saveQuickWord } from '../quick-add/actions';
import { deleteConceptCascade, deleteExample } from './actions';

const DICT_EN = 'dict-en';

beforeEach(async () => {
  await db.concepts.clear();
  await db.examples.clear();
});

describe('deleteConceptCascade', () => {
  it('soft-deletes the concept and every example linked to it', async () => {
    const { concept } = await saveQuickWord(DICT_EN, 'en', 'swallow');

    await deleteConceptCascade(concept.id);

    const activeConcepts = await conceptRepository.listActive();
    expect(activeConcepts).toHaveLength(0);

    const activeExamples = await exampleRepository.listActive();
    expect(activeExamples).toHaveLength(0);
  });
});

describe('deleteExample', () => {
  it('removes a single example without touching the concept', async () => {
    const { concept } = await saveQuickWord(DICT_EN, 'en', 'swallow');
    const examples = await exampleRepository.listActive();

    await deleteExample(examples[0].id);

    expect(await conceptRepository.getById(concept.id)).toBeDefined();
    expect(await exampleRepository.listActive()).toHaveLength(0);
  });

  it('removing an inbox example drops it from listInboxExamples', async () => {
    await exampleRepository.add({
      id: 'ex-1',
      dictionaryId: DICT_EN,
      text: 'A stray sentence.',
      attributes: {
        tone: 'Neutral',
        mode: 'Neutral',
        register: 'Neutral',
        nuance: 'Neutral',
        dialect: 'Neutral',
      },
      attributesStatus: 'empty',
      verification: 'unverified',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await deleteExample('ex-1');

    expect(await listInboxExamples(DICT_EN)).toHaveLength(0);
  });
});
