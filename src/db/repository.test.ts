import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { conceptRepository, exampleRepository } from './repositories';
import type { Concept, Example } from './types';
import { createId } from '../core/id';
import { createDefaultAttributes } from './defaults';

function makeConcept(overrides: Partial<Concept> = {}): Concept {
  const now = Date.now();
  return {
    id: createId(),
    dictionaryId: 'dict-en',
    lang: 'en',
    text: 'swallow',
    pos: 'verb',
    meanings: ['to make food or drink go down your throat'],
    verification: 'unverified',
    source: { type: 'quick-add' },
    status: 'loaded',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeExample(overrides: Partial<Example> = {}): Example {
  const now = Date.now();
  return {
    id: createId(),
    dictionaryId: 'dict-en',
    text: 'She swallowed the pill.',
    attributes: createDefaultAttributes(),
    attributesStatus: 'empty',
    verification: 'unverified',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.concepts.clear();
  await db.examples.clear();
});

describe('conceptRepository', () => {
  it('adds and retrieves a concept', async () => {
    const concept = makeConcept();
    await conceptRepository.add(concept);

    const found = await conceptRepository.getById(concept.id);
    expect(found?.text).toBe('swallow');
  });

  it('updates a concept and stamps updatedAt', async () => {
    const concept = makeConcept({ updatedAt: 0 });
    await conceptRepository.add(concept);

    await conceptRepository.update(concept.id, { status: 'acquired' });

    const found = await conceptRepository.getById(concept.id);
    expect(found?.status).toBe('acquired');
    expect(found?.updatedAt).toBeGreaterThan(0);
  });

  it('soft-deletes a concept: hidden from listActive, still fetchable by id', async () => {
    const concept = makeConcept();
    await conceptRepository.add(concept);

    await conceptRepository.softDelete(concept.id);

    const active = await conceptRepository.listActive();
    expect(active.find((c) => c.id === concept.id)).toBeUndefined();

    const stillThere = await conceptRepository.getById(concept.id);
    expect(stillThere?.deletedAt).toBeDefined();
  });

  it('listActive excludes soft-deleted rows but listAll keeps them', async () => {
    const kept = makeConcept({ text: 'kept' });
    const removed = makeConcept({ text: 'removed' });
    await conceptRepository.add(kept);
    await conceptRepository.add(removed);
    await conceptRepository.softDelete(removed.id);

    const active = await conceptRepository.listActive();
    const all = await conceptRepository.listAll();

    expect(active.map((c) => c.text)).toEqual(['kept']);
    expect(all.map((c) => c.text).sort()).toEqual(['kept', 'removed']);
  });
});

describe('exampleRepository', () => {
  it('adds and retrieves an example with default TMRND attributes', async () => {
    const example = makeExample();
    await exampleRepository.add(example);

    const found = await exampleRepository.getById(example.id);
    expect(found?.attributes.tone).toBe('Neutral');
    expect(found?.attributesStatus).toBe('empty');
  });
});
