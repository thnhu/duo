import type { LookupEntry } from '../db/types';
import { fetchOrThrow, LookupError, type FetchLike, type LookupProvider, type LookupResult } from './types';

// English: Free Dictionary API (https://dictionaryapi.dev). Free, no key,
// CORS open, ~450 requests per 5 minutes. Content is from Wiktionary
// (CC BY-SA), so attribution links are kept.

const MAX_DEFINITIONS_PER_ENTRY = 8;

interface ApiDefinition {
  definition?: string;
  example?: string;
}
interface ApiMeaning {
  partOfSpeech?: string;
  definitions?: ApiDefinition[];
}
interface ApiEntry {
  meanings?: ApiMeaning[];
  license?: { name: string; url?: string };
  sourceUrls?: string[];
}

export function parseFreeDictionary(data: unknown, word: string): LookupResult {
  if (!Array.isArray(data) || data.length === 0) {
    return { status: 'not-found', entries: [] };
  }
  const entries: LookupEntry[] = [];
  let license: ApiEntry['license'];
  let sourceUrl: string | undefined;

  for (const raw of data as ApiEntry[]) {
    license ??= raw.license;
    sourceUrl ??= raw.sourceUrls?.[0];
    for (const meaning of raw.meanings ?? []) {
      const definitions = (meaning.definitions ?? [])
        .filter((d) => d.definition?.trim())
        .slice(0, MAX_DEFINITIONS_PER_ENTRY)
        .map((d) => ({
          text: d.definition!.trim(),
          examples: d.example?.trim() ? [{ text: d.example.trim() }] : undefined,
        }));
      if (definitions.length > 0) entries.push({ pos: meaning.partOfSpeech, definitions });
    }
  }
  if (entries.length === 0) return { status: 'not-found', entries: [] };

  return {
    status: 'found',
    entries,
    sourceName: 'Free Dictionary API (Wiktionary)',
    sourceUrl: sourceUrl ?? `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    license,
  };
}

export function createFreeDictionaryProvider(fetchFn: FetchLike = (u, i) => fetch(u, i)): LookupProvider {
  return {
    id: 'free-dictionary',
    languages: ['en'],
    // 450 requests / 5 min = 1.5 per second; stay well under it.
    minIntervalMs: 1000,
    async lookup(word, signal) {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
      const response = await fetchOrThrow(fetchFn, url, signal);
      if (response.status === 404) return { status: 'not-found', entries: [] };
      if (!response.ok) throw new LookupError('unavailable', `Dịch vụ trả về lỗi ${response.status}.`);
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new LookupError('unavailable', 'Dịch vụ trả về dữ liệu không đọc được.');
      }
      return parseFreeDictionary(data, word);
    },
  };
}
