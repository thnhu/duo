import type { Example, ExampleHighlight } from '../db/types';

// An example's highlighted phrase can have several parts that are not next to
// each other: a separable German verb ("Wir fahren um zwölf Uhr ab" -> "fahren"
// + "ab") or an English phrasal verb split by an object. `Example.highlight`
// is the first part, `Example.highlightExtra` holds the others.

type Ranged = Pick<Example, 'highlight' | 'highlightExtra'>;

// In a file, parts of one phrase are written with an ellipsis: "fahren … ab".
export const PART_SEPARATOR = /\s*(?:…|\.{3})\s*/;

// Valid, ordered, non-overlapping parts (a stale or overlapping range is dropped).
export function highlightParts(example: Ranged): ExampleHighlight[] {
  const all = [example.highlight, ...(example.highlightExtra ?? [])].filter(
    (h): h is ExampleHighlight => !!h && h.end > h.start && h.start >= 0,
  );
  all.sort((a, b) => a.start - b.start);
  const result: ExampleHighlight[] = [];
  for (const part of all) {
    if (result.length === 0 || part.start >= result[result.length - 1].end) result.push(part);
  }
  return result;
}

// The phrase to learn as one string; parts are joined with a space.
export function phraseOf(text: string, parts: ExampleHighlight[]): string {
  return parts.map((p) => text.slice(p.start, p.end)).join(' ');
}

// For the file export: "fahren … ab".
export function phraseForFile(text: string, parts: ExampleHighlight[]): string {
  return parts.map((p) => text.slice(p.start, p.end)).join(' … ');
}

// Cuts the text into pieces, marking which ones are highlighted.
export function splitByParts(text: string, parts: ExampleHighlight[]): Array<{ text: string; hit: boolean }> {
  const pieces: Array<{ text: string; hit: boolean }> = [];
  let at = 0;
  for (const part of parts) {
    if (part.start > at) pieces.push({ text: text.slice(at, part.start), hit: false });
    pieces.push({ text: text.slice(part.start, part.end), hit: true });
    at = part.end;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), hit: false });
  return pieces;
}

// Adds a part to a set of parts; overlapping an existing part is refused.
export function addPart(parts: ExampleHighlight[], picked: ExampleHighlight): ExampleHighlight[] | null {
  if (parts.some((p) => picked.start < p.end && picked.end > p.start)) return null;
  return [...parts, picked].sort((a, b) => a.start - b.start);
}

// Splits ordered parts back into the stored shape.
export function toStored(parts: ExampleHighlight[]): Pick<Example, 'highlight' | 'highlightExtra'> {
  return {
    highlight: parts[0],
    highlightExtra: parts.length > 1 ? parts.slice(1) : undefined,
  };
}

export function samePartsAs(a: ExampleHighlight[], b: ExampleHighlight[]): boolean {
  return a.length === b.length && a.every((p, i) => p.start === b[i].start && p.end === b[i].end);
}

// Finds a word inside a sentence (not case-sensitive) to highlight it
// automatically; undefined when it is not there in that exact form.
export function findPhrase(sentence: string, word: string): ExampleHighlight | undefined {
  const s = sentence.toLowerCase();
  const w = word.trim().toLowerCase();
  // Case folding that changes the length would shift the offsets.
  if (!w || s.length !== sentence.length || w.length !== word.trim().length) return undefined;
  const start = s.indexOf(w);
  return start === -1 ? undefined : { start, end: start + w.length };
}
