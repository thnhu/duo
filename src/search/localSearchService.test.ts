import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { conceptRepository, exampleRepository } from '../db/repositories';
import { createDefaultAttributes } from '../db/defaults';
import type { Concept, Example } from '../db/types';
import { LocalSearchService } from './localSearchService';

const search = new LocalSearchService(db);

let counter = 0;
function concept(overrides: Partial<Concept>): Concept {
  counter++;
  return {
    id: `c${counter}`,
    dictionaryId: 'dict-en',
    lang: 'en',
    text: 'word',
    meanings: [],
    verification: 'unverified',
    source: { type: 'quick-add' },
    status: 'loaded',
    createdAt: counter,
    updatedAt: counter,
    ...overrides,
  };
}

function example(overrides: Partial<Example>): Example {
  counter++;
  return {
    id: `e${counter}`,
    dictionaryId: 'dict-en',
    text: 'sentence',
    attributes: createDefaultAttributes(),
    attributesStatus: 'empty',
    verification: 'unverified',
    createdAt: counter,
    updatedAt: counter,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.concepts.clear();
  await db.examples.clear();
  await db.exampleLinks.clear();
  await db.dictionaries.clear();
  await db.dictionaries.bulkAdd([
    { id: 'dict-en', name: 'English', lang: 'en', updatedAt: 0 },
    { id: 'dict-de', name: 'Deutsch', lang: 'de', updatedAt: 0 },
  ]);
  search.invalidate();
});

describe('LocalSearchService', () => {
  it('finds "Äpfel" when searching "aepfel" (spec M2b acceptance)', async () => {
    await conceptRepository.add(
      concept({ id: 'apfel', lang: 'de', dictionaryId: 'dict-de', text: 'Äpfel' }),
    );
    const { hits } = await search.search({ text: 'aepfel' });
    expect(hits.map((h) => h.id)).toEqual(['apfel']);
    // Highlight range maps back onto the original text.
    expect(hits[0].ranges).toEqual([[0, 5]]);
  });

  it('searches meanings with Vietnamese diacritics removed', async () => {
    await conceptRepository.add(concept({ id: 'blue', text: 'blue', meanings: ['màu xanh dương'] }));
    const { hits } = await search.search({ text: 'xanh duong' });
    expect(hits).toHaveLength(1);
    expect(hits[0].snippets[0]).toMatchObject({ field: 'meaning', text: 'màu xanh dương' });
  });

  it('requires every word to match, in any field', async () => {
    await conceptRepository.add(concept({ id: 'a', text: 'swallow', meanings: ['nuốt'] }));
    await conceptRepository.add(concept({ id: 'b', text: 'swallow hard' }));
    const { hits } = await search.search({ text: 'swallow nuot' });
    expect(hits.map((h) => h.id)).toEqual(['a']);
  });

  it('finds example sentences and notes, linked to their concept', async () => {
    await conceptRepository.add(concept({ id: 'sw', text: 'swallow' }));
    await exampleRepository.add(
      example({ id: 'ex', text: 'She swallowed the pill.', targetConceptId: 'sw', note: 'slang-ish' }),
    );
    const byText = await search.search({ text: 'pill', kinds: ['example'] });
    expect(byText.hits[0]).toMatchObject({ kind: 'example', id: 'ex', conceptId: 'sw' });
    const byNote = await search.search({ text: 'slang' });
    expect(byNote.hits.map((h) => h.id)).toEqual(['ex']);
  });

  it('does not list the auto-created minimal example', async () => {
    await conceptRepository.add(concept({ id: 'sw', text: 'swallow' }));
    await exampleRepository.add(
      example({ text: 'swallow', targetConceptId: 'sw', isMinimal: true }),
    );
    const { hits } = await search.search({ text: 'swallow' });
    expect(hits.map((h) => h.kind)).toEqual(['concept']);
  });

  it('ranks exact and prefix matches above substring matches', async () => {
    await conceptRepository.add(concept({ id: 'sub', text: 'unswallowable' }));
    await conceptRepository.add(concept({ id: 'pre', text: 'swallowing' }));
    await conceptRepository.add(concept({ id: 'exact', text: 'swallow' }));
    const { hits } = await search.search({ text: 'swallow' });
    expect(hits.map((h) => h.id)).toEqual(['exact', 'pre', 'sub']);
  });

  it('reflects writes made after the index was built', async () => {
    await conceptRepository.add(concept({ id: 'one', text: 'chew' }));
    expect((await search.search({ text: 'chew' })).hits).toHaveLength(1);

    await conceptRepository.add(concept({ id: 'two', text: 'chew gum' }));
    expect((await search.search({ text: 'chew' })).hits).toHaveLength(2);

    await conceptRepository.softDelete('one');
    expect((await search.search({ text: 'chew' })).hits.map((h) => h.id)).toEqual(['two']);
  });

  it('hides examples of a deleted concept', async () => {
    await conceptRepository.add(concept({ id: 'sw', text: 'swallow' }));
    await exampleRepository.add(example({ id: 'ex', text: 'She swallowed.', targetConceptId: 'sw' }));
    await conceptRepository.softDelete('sw');
    expect((await search.search({ text: 'swallowed' })).hits).toHaveLength(0);
  });

  describe('filters', () => {
    beforeEach(async () => {
      await conceptRepository.add(
        concept({ id: 'en1', text: 'hello', lang: 'en', status: 'loaded', source: { type: 'import', lesson: 'L1' } }),
      );
      await conceptRepository.add(
        concept({
          id: 'de1',
          text: 'hallo',
          lang: 'de',
          dictionaryId: 'dict-de',
          status: 'acquired',
          verification: 'verified',
        }),
      );
      await exampleRepository.add(
        example({
          id: 'ex-informal',
          text: 'Hi there!',
          targetConceptId: 'en1',
          attributes: { ...createDefaultAttributes(), tone: 'Informal' },
        }),
      );
      await exampleRepository.add(example({ id: 'ex-inbox', text: 'Hi from the inbox' }));
    });

    it('filters by language, status, verification, lesson and source', async () => {
      expect((await search.search({ text: 'h', filters: { lang: 'de' } })).hits.map((h) => h.id)).toEqual(['de1']);
      expect((await search.search({ text: 'h', filters: { status: 'acquired' } })).hits.map((h) => h.id)).toEqual(['de1']);
      expect((await search.search({ text: 'h', filters: { verification: 'verified' } })).hits.map((h) => h.id)).toEqual(['de1']);
      const byLesson = await search.search({ text: '', filters: { lesson: 'L1' } });
      expect(byLesson.hits.map((h) => h.id).sort()).toEqual(['en1', 'ex-informal']);
      expect((await search.search({ text: 'h', filters: { sourceType: 'import', lang: 'en' }, kinds: ['concept'] })).hits.map((h) => h.id)).toEqual(['en1']);
    });

    it('filters examples by TMRND attribute and drops concepts', async () => {
      const { hits } = await search.search({ text: 'hi', filters: { attributes: { tone: 'Informal' } } });
      expect(hits.map((h) => h.id)).toEqual(['ex-informal']);
    });

    it('"unlinked only" returns just the inbox sentences', async () => {
      const { hits } = await search.search({ text: '', filters: { unlinkedOnly: true } });
      expect(hits.map((h) => h.id)).toEqual(['ex-inbox']);
      expect(hits[0].conceptId).toBeUndefined();
    });

    it('returns nothing for an empty query without filters', async () => {
      expect((await search.search({ text: '  ' })).hits).toEqual([]);
    });

    it('lists available lessons', async () => {
      expect((await search.getFacets()).lessons).toEqual(['L1']);
    });
  });

  it('sorts alphabetically on request', async () => {
    await conceptRepository.add(concept({ id: 'b', text: 'banana' }));
    await conceptRepository.add(concept({ id: 'a', text: 'apple' }));
    const { hits } = await search.search({ text: 'a', sort: 'alphabetical' });
    expect(hits.map((h) => h.id)).toEqual(['a', 'b']);
  });

  describe('related mode (suggest a concept to link to)', () => {
    it('finds the base form of an inflected phrase', async () => {
      await conceptRepository.add(concept({ id: 'sw', text: 'swallow' }));
      expect((await search.search({ text: 'swallowed' })).hits).toHaveLength(0);
      const related = await search.search({ text: 'swallowed', mode: 'related', kinds: ['concept'] });
      expect(related.hits.map((h) => h.id)).toEqual(['sw']);
    });

    it('matches on any word of the phrase', async () => {
      await conceptRepository.add(concept({ id: 'pill', text: 'pill' }));
      const related = await search.search({ text: 'swallow the pill', mode: 'related', kinds: ['concept'] });
      expect(related.hits.map((h) => h.id)).toEqual(['pill']);
    });
  });

  it('applies the limit but reports the total', async () => {
    for (let i = 0; i < 5; i++) await conceptRepository.add(concept({ text: `test${i}` }));
    const { hits, total } = await search.search({ text: 'test', limit: 2 });
    expect(hits).toHaveLength(2);
    expect(total).toBe(5);
  });

  it('stays fast with a few thousand words', async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => concept({ id: `bulk${i}`, text: `wort${i}`, meanings: [`nghĩa ${i}`] }));
    await db.concepts.bulkAdd(rows);
    search.invalidate();
    await search.search({ text: 'wort1' }); // builds the index
    const start = performance.now();
    await search.search({ text: 'wort29' });
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe('depth concepts (ideas with several ways of saying them)', () => {
  async function seed() {
    await conceptRepository.add(
      concept({ id: 'qty', text: 'large quantity', meanings: ['số lượng nhiều'], mode: 'depth' }),
    );
    await conceptRepository.add(concept({ id: 'formal', text: 'formal quantity', mode: 'depth' }));
    for (const [id, text, at] of [['e1', 'a lot of', 1], ['e2', 'a bunch of', 2], ['e3', 'a great deal of', 3]] as const) {
      await exampleRepository.add(example({ id, text, targetConceptId: 'qty', createdAt: at }));
    }
    await db.exampleLinks.add({ id: 'l1', exampleId: 'e3', conceptId: 'formal', type: 'otherPhrase', updatedAt: 1 });
    search.invalidate();
  }

  it('finds the idea by its Vietnamese description, without diacritics, and lists its ways', async () => {
    await seed();
    const { hits } = await search.search({ text: 'so luong', kinds: ['concept'] });
    expect(hits.map((h) => h.id)).toEqual(['qty']);
    expect(hits[0]).toMatchObject({
      isDepth: true,
      expressions: ['a lot of', 'a bunch of', 'a great deal of'],
    });
  });

  it('finds the idea when searching one of its ways of saying it', async () => {
    await seed();
    const { hits } = await search.search({ text: 'bunch', kinds: ['concept'] });
    expect(hits.map((h) => h.id)).toEqual(['qty']);
    expect(hits[0].snippets[0]).toMatchObject({ field: 'expression', text: 'a bunch of' });
  });

  it('a linked example also lists under the other idea; deleting the link removes it', async () => {
    await seed();
    let { hits } = await search.search({ text: 'formal', kinds: ['concept'] });
    expect(hits[0].expressions).toEqual(['a great deal of']);
    await db.exampleLinks.update('l1', { deletedAt: 5 });
    ({ hits } = await search.search({ text: 'formal', kinds: ['concept'] }));
    expect(hits[0].expressions).toEqual([]);
  });

  it('ordinary (breadth) concepts have no expressions list', async () => {
    await conceptRepository.add(concept({ id: 'w', text: 'swallow' }));
    search.invalidate();
    const { hits } = await search.search({ text: 'swallow' });
    expect(hits[0].isDepth).toBeUndefined();
    expect(hits[0].expressions).toBeUndefined();
  });
});

