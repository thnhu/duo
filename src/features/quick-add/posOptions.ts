import type { Lang } from '../../db/types';

// Parts of speech offered by the "Thêm word" screen, per language. Values are
// stored in `Concept.pos` (the same spellings the drills and the file import
// already recognise: "noun", "verb"…); the label is what PO sees. A language
// with its own parts of speech just gets its own list here.

export interface PosOption {
  value: string;
  label: string;
}

const COMMON: PosOption[] = [
  { value: 'noun', label: 'Noun (danh từ)' },
  { value: 'verb', label: 'Verb (động từ)' },
  { value: 'adjective', label: 'Adjective (tính từ)' },
  { value: 'adverb', label: 'Adverb (trạng từ)' },
  { value: 'preposition', label: 'Preposition (giới từ)' },
  { value: 'pronoun', label: 'Pronoun (đại từ)' },
  { value: 'conjunction', label: 'Conjunction (liên từ)' },
  { value: 'phrase', label: 'Phrase (cụm từ)' },
  { value: 'other', label: 'Khác' },
];

const POS_OPTIONS: Record<Lang, PosOption[]> = {
  en: COMMON,
  de: COMMON,
};

export function posOptionsFor(lang: Lang): PosOption[] {
  return POS_OPTIONS[lang] ?? COMMON;
}

// Stored spellings vary ("Noun" from a file, "noun" from the screen): find the
// option that means the same, so a select can show it.
export function matchPos(lang: Lang, raw: string | undefined): string {
  const value = (raw ?? '').trim();
  const hit = posOptionsFor(lang).find((o) => o.value === value.toLowerCase());
  return hit ? hit.value : value;
}
