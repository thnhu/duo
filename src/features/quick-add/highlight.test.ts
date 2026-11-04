import { describe, expect, it } from 'vitest';
import { normalizeSelection, textForSelection } from './highlight';

describe('normalizeSelection', () => {
  it('trims leading and trailing whitespace from the selection', () => {
    const text = 'She swallowed the pill.';
    const result = normalizeSelection(text, { start: 3, end: 14 }); // " swallowed "
    expect(result).toEqual({ start: 4, end: 13 });
    expect(textForSelection(text, result!)).toBe('swallowed');
  });

  it('returns null for a whitespace-only or empty selection', () => {
    const text = 'She swallowed the pill.';
    expect(normalizeSelection(text, { start: 3, end: 4 })).toBeNull();
    expect(normalizeSelection(text, { start: 5, end: 5 })).toBeNull();
  });

  it('swaps start/end if the selection was made backwards', () => {
    const text = 'swallow';
    expect(normalizeSelection(text, { start: 7, end: 0 })).toEqual({ start: 0, end: 7 });
  });
});
