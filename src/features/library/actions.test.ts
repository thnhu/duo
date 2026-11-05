import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { conceptRepository, exampleRepository } from '../../db/repositories';
import { listInboxExamples } from '../../db/queries';
import { saveQuickWord } from '../quick-add/actions';
import { createDepthConcept, addExpression, linkExample } from '../../depth';
import { linkConcepts } from '../../links';
import { deleteConceptCascade, deleteExample, restoreDeleted } from './actions';

const DICT_EN = 'dict-en';

beforeEach(async () => {
  await db.concepts.clear();
  await db.examples.clear();
  await db.exampleLinks.clear();
  await db.conceptLinks.clear();
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

describe('undo of a delete', () => {
  it('brings back the concept, its examples and every link the delete took away', async () => {
    const a = await createDepthConcept(DICT_EN, 'quantity', '');
    const b = await createDepthConcept(DICT_EN, 'amount', '');
    const parent = await createDepthConcept(DICT_EN, 'idea', '');
    const e = await addExpression(a, 'a lot of');
    await linkExample(e.id, b.id, 'idiom');
    await linkConcepts(a.id, parent.id, 'typeOf');

    const deleted = await deleteConceptCascade(a.id);
    expect((await conceptRepository.listActive()).map((c) => c.text).sort()).toEqual(['amount', 'idea']);
    expect(await exampleRepository.listActive()).toHaveLength(0);

    await restoreDeleted(deleted);
    expect((await conceptRepository.listActive()).map((c) => c.text).sort()).toEqual(['amount', 'idea', 'quantity']);
    expect(await exampleRepository.listActive()).toHaveLength(1);
    expect((await db.exampleLinks.toArray()).filter((l) => l.deletedAt === undefined)).toHaveLength(1);
    expect((await db.conceptLinks.toArray()).filter((l) => l.deletedAt === undefined)).toHaveLength(1);
  });

  it('does not revive a link that was already deleted before the delete', async () => {
    const a = await createDepthConcept(DICT_EN, 'quantity', '');
    const b = await createDepthConcept(DICT_EN, 'amount', '');
    const e = await addExpression(a, 'a lot of');
    const link = await linkExample(e.id, b.id, 'idiom');
    await db.exampleLinks.update(link!.id, { deletedAt: 1 });

    const deleted = await deleteExample(e.id);
    await restoreDeleted(deleted);
    expect((await db.exampleLinks.get(link!.id))?.deletedAt).toBe(1);
    expect(await exampleRepository.listActive()).toHaveLength(1);
  });
});
