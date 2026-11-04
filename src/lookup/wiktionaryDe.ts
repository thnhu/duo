import { fetchOrThrow, LookupError, type FetchLike, type LookupProvider, type LookupResult } from './types';
import { parseGermanSection } from './wiktionaryHtml';

// German: Wiktionary through the MediaWiki API (free, CORS via origin=*).
// Wikimedia asks clients to go easy: requests are made one at a time with a
// gap between them. Page text is CC BY-SA 4.0.

type HtmlParser = (html: string) => Document;

const defaultParseHtml: HtmlParser = (html) => new DOMParser().parseFromString(html, 'text/html');

function pageUrl(page: string): string {
  const params = new URLSearchParams({
    action: 'parse',
    page,
    prop: 'text',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    disabletoc: '1',
    disableeditsection: '1',
    origin: '*',
  });
  return `https://en.wiktionary.org/w/api.php?${params.toString()}`;
}

// Wiktionary titles are case-sensitive and German nouns are capitalized:
// "apfel" is not a page, "Apfel" is.
function titleCandidates(word: string): string[] {
  const capitalized = word.charAt(0).toUpperCase() + word.slice(1);
  return capitalized === word ? [word] : [word, capitalized];
}

const MIN_INTERVAL_MS = 1000;

export function createWiktionaryDeProvider(
  fetchFn: FetchLike = (u, i) => fetch(u, i),
  parseHtml: HtmlParser = defaultParseHtml,
  // Pause between the two title spellings tried for one word.
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): LookupProvider {
  async function lookupPage(page: string, signal?: AbortSignal): Promise<LookupResult> {
    const response = await fetchOrThrow(fetchFn, pageUrl(page), signal);
    if (!response.ok) throw new LookupError('unavailable', `Dịch vụ trả về lỗi ${response.status}.`);

    let data: { error?: { code?: string }; parse?: { title?: string; text?: string } };
    try {
      data = await response.json();
    } catch {
      throw new LookupError('unavailable', 'Dịch vụ trả về dữ liệu không đọc được.');
    }

    if (data.error) {
      if (data.error.code === 'missingtitle') return { status: 'not-found', entries: [] };
      if (data.error.code === 'ratelimited') {
        throw new LookupError('rate-limit', 'Wiktionary báo đã hết lượt tạm thời.');
      }
      throw new LookupError('unavailable', 'Wiktionary không trả lời được lúc này.');
    }

    const html = data.parse?.text;
    if (!html) throw new LookupError('unavailable', 'Dịch vụ trả về dữ liệu không đọc được.');

    const entries = parseGermanSection(parseHtml(html));
    if (entries.length === 0) return { status: 'not-found', entries: [] };

    const title = data.parse?.title ?? page;
    return {
      status: 'found',
      entries,
      sourceName: 'Wiktionary (en)',
      sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(title)}#German`,
      license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    };
  }

  return {
    id: 'wiktionary-de',
    languages: ['de'],
    minIntervalMs: MIN_INTERVAL_MS,
    async lookup(word, signal) {
      const pages = titleCandidates(word);
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) await sleep(MIN_INTERVAL_MS);
        const result = await lookupPage(pages[i], signal);
        if (result.status === 'found') return result;
      }
      return { status: 'not-found', entries: [] };
    },
  };
}
