import { describe, expect, it } from 'vitest';
import { matchPos, posOptionsFor } from './posOptions';

describe('part-of-speech options', () => {
  it('maps the spellings a file brings to the option values', () => {
    expect(matchPos('de', 'Noun')).toBe('noun');
    expect(matchPos('de', ' Adjective ')).toBe('adjective');
    expect(matchPos('en', 'verb')).toBe('verb');
  });

  it('keeps a spelling that has no option, so nothing is lost', () => {
    expect(matchPos('de', 'Wortart X')).toBe('Wortart X');
    expect(matchPos('de', undefined)).toBe('');
  });

  it('offers noun and verb in every language', () => {
    for (const lang of ['en', 'de'] as const) {
      const values = posOptionsFor(lang).map((o) => o.value);
      expect(values).toContain('noun');
      expect(values).toContain('verb');
    }
  });
});
