import { highlightParts, phraseOf } from '../core/highlights';
import type { Example } from '../db/types';
import { normalizeAnswer } from './grade';

// Helpers shared by the dictation drills of every language.

// Spec C7: with a highlighted phrase the default is to write the phrase;
// there is an option to write the whole sentence.
export function dictationTarget(example: Example, scope: string): string {
  const parts = highlightParts(example);
  // A split phrase (fahren … ab) is written as its parts, in order.
  if (scope !== 'sentence' && parts.length > 0) return phraseOf(example.text, parts);
  return example.text;
}

// A trailing full stop in a whole sentence is not a spelling matter.
export const stripEndPunctuation = (s: string): string =>
  normalizeAnswer(s).replace(/[\s.,;:!?"„“”]+$/u, '');
