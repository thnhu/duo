// English "Rộng" drills treat nouns and verbs differently (spec 5.2): a noun
// is learnt as a single word, a verb as a phrase. `Concept.pos` is free text
// (typed by hand, imported, or filled by lookup), so the spellings that mean
// "noun" / "verb" are listed here as configuration.

export type PosClass = 'noun' | 'verb' | 'other';

const NOUN = ['noun', 'n', 'n.', 'danh từ', 'danh từ đếm được'];
const VERB = ['verb', 'v', 'v.', 'phrasal verb', 'phrasal-verb', 'động từ', 'cụm động từ'];

export function posClass(pos: string | undefined): PosClass | undefined {
  const value = (pos ?? '').trim().toLowerCase();
  if (!value) return undefined;
  if (NOUN.includes(value)) return 'noun';
  if (VERB.includes(value)) return 'verb';
  return 'other';
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
