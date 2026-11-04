import { describe, expect, it } from 'vitest';
import { normalizeSearchText, normalizeWithMap, tokenize } from './normalize';

describe('normalizeSearchText', () => {
  it('is case-insensitive', () => {
    expect(normalizeSearchText('Swallow')).toBe('swallow');
  });

  it('treats German umlauts and ß as their ASCII expansions', () => {
    expect(normalizeSearchText('Äpfel')).toBe('aepfel');
    expect(normalizeSearchText('schön')).toBe('schoen');
    expect(normalizeSearchText('Müller')).toBe('mueller');
    expect(normalizeSearchText('Straße')).toBe('strasse');
  });

  it('strips Vietnamese diacritics, including đ', () => {
    expect(normalizeSearchText('màu xanh dương')).toBe('mau xanh duong');
    expect(normalizeSearchText('Đường')).toBe('duong');
  });

  it('handles decomposed (NFD) input the same as composed', () => {
    expect(normalizeSearchText('äpfel')).toBe(normalizeSearchText('Äpfel'));
  });
});

describe('normalizeWithMap', () => {
  it('maps expanded chars back to the single original char', () => {
    const { text, starts, ends } = normalizeWithMap('Äpfel');
    expect(text).toBe('aepfel');
    expect([starts[0], ends[0]]).toEqual([0, 1]);
    expect([starts[1], ends[1]]).toEqual([0, 1]);
    expect([starts[2], ends[2]]).toEqual([1, 2]);
  });
});

describe('tokenize', () => {
  it('splits on whitespace and normalizes', () => {
    expect(tokenize('  Äpfel   essen ')).toEqual(['aepfel', 'essen']);
  });
  it('returns nothing for blank input', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});
