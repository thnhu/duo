import { describe, expect, it } from 'vitest';
import type { Concept } from '../db/types';
import { conceptsInScope, fileSlug, isWholeKit, normalizeScope, scopeLabel, scopeSlug } from './scope';

function concept(id: string, over: Partial<Concept> = {}): Concept {
  return {
    id, dictionaryId: 'd', lang: 'de', text: id, meanings: [], verification: 'unverified',
    source: { type: 'import' }, status: 'loaded', createdAt: 1, updatedAt: 1, ...over,
  };
}

const rows = [
  concept('mutter', { setIds: ['A1'], lessonId: 'family' }),
  concept('vater', { setIds: ['A1'], lessonId: 'family' }),
  concept('aufstehen', { setIds: ['A1'], lessonId: 'daily' }),
  concept('haus', { setIds: ['A1', 'A2'] }),
  concept('tisch'), // General
  concept('gone', { setIds: ['deleted-deck'] }), // its only deck was deleted: General
  concept('hello', { lang: 'en', setIds: ['IT'] }),
  concept('removed', { setIds: ['A1'], deletedAt: 5 }),
];
const live = new Set(['A1', 'A2', 'IT']);
const ids = (scope: Parameters<typeof conceptsInScope>[1]) => conceptsInScope(rows, scope, live).map((c) => c.id);

describe('export scope', () => {
  it('nothing chosen = every live concept', () => {
    expect(ids({})).toEqual(['mutter', 'vater', 'aufstehen', 'haus', 'tisch', 'gone', 'hello']);
  });

  it('a language narrows to that language', () => {
    expect(ids({ lang: 'en' })).toEqual(['hello']);
    expect(ids({ lang: 'de' })).toEqual(['mutter', 'vater', 'aufstehen', 'haus', 'tisch', 'gone']);
  });

  it('a deck narrows to its words; a word in two decks is in both', () => {
    expect(ids({ lang: 'de', deck: 'A1' })).toEqual(['mutter', 'vater', 'aufstehen', 'haus']);
    expect(ids({ lang: 'de', deck: 'A2' })).toEqual(['haus']);
  });

  it('General = words in no live deck (a deleted deck does not count)', () => {
    expect(ids({ lang: 'de', deck: 'general' })).toEqual(['tisch', 'gone']);
  });

  it('a lesson narrows to its words', () => {
    expect(ids({ lang: 'de', deck: 'A1', lessonId: 'family' })).toEqual(['mutter', 'vater']);
    expect(ids({ lang: 'de', deck: 'A1', lessonId: 'daily' })).toEqual(['aufstehen']);
  });

  it('a wider choice drops the narrower ones', () => {
    expect(normalizeScope({ deck: 'A1', lessonId: 'family' })).toEqual({}); // no language: no deck
    expect(normalizeScope({ lang: 'de', lessonId: 'family' })).toEqual({ lang: 'de' }); // no deck: no lesson
    expect(isWholeKit({ deck: 'A1' })).toBe(true);
    expect(isWholeKit({ lang: 'en' })).toBe(false);
    expect(ids({ deck: 'A1' })).toEqual(ids({}));
  });

  it('names a scope for messages and file names', () => {
    expect(scopeLabel({})).toBe('tất cả');
    expect(scopeLabel({ lang: 'de', deck: 'A1', lessonId: 'f' }, { deckName: 'Goethe A1', lessonName: 'Family' })).toBe(
      'tiếng Đức · Goethe A1 · Family',
    );
    expect(scopeSlug({})).toBe('all');
    expect(scopeSlug({ lang: 'de', deck: 'A1', lessonId: 'f' }, { deckName: 'Goethe A1', lessonName: 'Family' })).toBe(
      'de-Goethe-A1-Family',
    );
    expect(scopeSlug({ lang: 'de', deck: 'general' })).toBe('de-General');
    expect(fileSlug('Hoạt động hằng ngày / Đi chơi')).toBe('Hoat-dong-hang-ngay-di-choi');
  });
});

describe('xlsx file name', () => {
  it('names the file after the scope', async () => {
    const { xlsxFileName } = await import('./scope');
    expect(xlsxFileName({}, {}, '2026-11-07')).toBe('duo-words-2026-11-07.xlsx');
    expect(xlsxFileName({ lang: 'de', deck: 'A1' }, { deckName: 'Goethe A1' }, '2026-11-07')).toBe(
      'duo-de-Goethe-A1-2026-11-07.xlsx',
    );
    expect(
      xlsxFileName({ lang: 'de', deck: 'A1', lessonId: 'f' }, { deckName: 'Goethe A1', lessonName: 'Family' }, '2026-11-07'),
    ).toBe('duo-de-Goethe-A1-Family-2026-11-07.xlsx');
    expect(xlsxFileName({ lang: 'en' }, {}, '2026-11-07')).toBe('duo-en-2026-11-07.xlsx');
  });
});
