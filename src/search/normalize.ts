// Search normalization (spec F4): case-insensitive, Vietnamese diacritics
// stripped, and German ä/ö/ü/ß treated as equal to ae/oe/ue/ss. The mapping
// is kept so a match found in normalized text can be highlighted in the
// original text (normalization can change length: ß -> ss).

const GERMAN_EXPANSIONS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

const COMBINING_MARKS = /\p{M}/gu;

function normalizeChar(char: string): string {
  const lower = char.toLowerCase();
  const german = GERMAN_EXPANSIONS[lower];
  if (german) return german;
  if (lower === 'đ') return 'd';
  return lower.normalize('NFD').replace(COMBINING_MARKS, '');
}

export interface NormalizedText {
  text: string;
  // For each char of `text`: [start, end) of the original chars it came from.
  starts: number[];
  ends: number[];
}

export function normalizeWithMap(input: string): NormalizedText {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];

  function emit(cluster: string, start: number, end: number) {
    // NFC first so a decomposed "a" + U+0308 is handled as "ä".
    for (const out of normalizeChar(cluster.normalize('NFC'))) {
      text += out;
      starts.push(start);
      ends.push(end);
    }
  }

  // A cluster is a base char plus any combining marks that follow it.
  let cluster = '';
  let clusterStart = 0;
  let index = 0;
  for (const char of input) {
    if (cluster !== '' && !/^\p{M}$/u.test(char)) {
      emit(cluster, clusterStart, index);
      cluster = '';
    }
    if (cluster === '') clusterStart = index;
    cluster += char;
    index += char.length;
  }
  if (cluster !== '') emit(cluster, clusterStart, index);

  return { text, starts, ends };
}

export function normalizeSearchText(input: string): string {
  return normalizeWithMap(input).text;
}

export function tokenize(query: string): string[] {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);
}
