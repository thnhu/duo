import { parseHTML } from 'linkedom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { conceptRepository, exampleRepository } from '../db/repositories';
import type { Concept } from '../db/types';
import { applyReview, dismissSuggestion } from './apply';
import { createFreeDictionaryProvider, parseFreeDictionary } from './freeDictionary';
import { LookupQueue, type LookupQueueDeps } from './queue';
import { LookupError, type LookupProvider } from './types';
import { createWiktionaryDeProvider } from './wiktionaryDe';
import { parseGermanSection } from './wiktionaryHtml';

// Real German sections of en.wiktionary pages (CC BY-SA 4.0), loaded as text.
const fixtures = import.meta.glob('./__fixtures__/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function fixture(name: string): string {
  return fixtures[`./__fixtures__/${name}`];
}
function parseHtml(html: string): Document {
  return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document as unknown as Document;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('wiktionary German parser (real page fixtures)', () => {
  it('reads gender, plural, senses and labels of a noun', () => {
    const entries = parseGermanSection(parseHtml(fixture('de-Apfel.html')));
    const noun = entries.find((e) => e.pos === 'noun')!;
    expect(noun.grammar).toMatchObject({ gender: 'der', plural: 'Äpfel' });
    expect(noun.definitions[0].text).toBe('apple (fruit)');
    expect(noun.definitions.map((d) => d.text)).toContain('apple tree');
    // Sense 3 carries usage labels (shown as evidence, never auto-applied).
    const labelled = noun.definitions.find((d) => d.labels && d.labels.length > 0);
    expect(labelled?.labels).toEqual(['poetic', 'euphemistic', 'plural only']);
  });

  it('reads verb forms and example sentences with translations', () => {
    const entries = parseGermanSection(parseHtml(fixture('de-gehen.html')));
    const verb = entries.find((e) => e.pos === 'verb')!;
    expect(verb.grammar?.verbForms).toEqual({
      infinitiv: 'gehen',
      praesens3sg: 'geht',
      praeteritum: 'ging',
      partizip2: 'gegangen',
    });
    const first = verb.definitions[0];
    expect(first.text).toContain('to go');
    expect(first.labels).toEqual(['intransitive']);
    expect(first.examples?.[0]).toEqual({
      text: 'Lass uns beide mit dem Hund gehen.',
      translation: "Let's both walk the dog together.",
    });
  });

  it('feminine noun maps to "die"; adjectives have no noun grammar', () => {
    const strasse = parseGermanSection(parseHtml(fixture('de-Strasse.html')));
    expect(strasse.find((e) => e.pos === 'noun')?.grammar?.gender).toBe('die');

    const schoen = parseGermanSection(parseHtml(fixture('de-schoen.html')));
    const adjective = schoen.find((e) => e.pos === 'adjective')!;
    expect(adjective.grammar).toBeUndefined();
    expect(adjective.definitions[0].text).toContain('beautiful');
  });

  it('returns nothing when there is no German section', () => {
    expect(parseGermanSection(parseHtml('<h2 id="English">English</h2><p>x</p>'))).toEqual([]);
  });
});

describe('wiktionary provider', () => {
  const page = fixture('de-Apfel.html');
  const ok = { parse: { title: 'Apfel', text: page } };

  it('finds a word and cites source + license', async () => {
    const provider = createWiktionaryDeProvider(async () => jsonResponse(ok), parseHtml);
    const result = await provider.lookup('Apfel');
    expect(result.status).toBe('found');
    expect(result.sourceUrl).toBe('https://en.wiktionary.org/wiki/Apfel#German');
    expect(result.license?.name).toBe('CC BY-SA 4.0');
  });

  it('retries a lowercase word with a capital letter', async () => {
    const urls: string[] = [];
    const provider = createWiktionaryDeProvider(
      async (url) => {
        urls.push(new URL(url).searchParams.get('page')!);
        return urls.length === 1
          ? jsonResponse({ error: { code: 'missingtitle' } })
          : jsonResponse(ok);
      },
      parseHtml,
      async () => {},
    );
    expect((await provider.lookup('apfel')).status).toBe('found');
    expect(urls).toEqual(['apfel', 'Apfel']);
  });

  it('reports not-found for a missing page or a page without German', async () => {
    const missing = createWiktionaryDeProvider(
      async () => jsonResponse({ error: { code: 'missingtitle' } }),
      parseHtml,
      async () => {},
    );
    expect((await missing.lookup('Zzzqqq')).status).toBe('not-found');

    const english = createWiktionaryDeProvider(
      async () => jsonResponse({ parse: { title: 'run', text: '<h2 id="English">English</h2>' } }),
      parseHtml,
      async () => {},
    );
    expect((await english.lookup('run')).status).toBe('not-found');
  });

  it('turns network, 429 and 5xx failures into LookupErrors', async () => {
    const offline = createWiktionaryDeProvider(async () => { throw new TypeError('fail'); }, parseHtml);
    await expect(offline.lookup('Apfel')).rejects.toMatchObject({ kind: 'network' });

    const limited = createWiktionaryDeProvider(
      async () => jsonResponse({}, 429, { 'retry-after': '30' }),
      parseHtml,
    );
    await expect(limited.lookup('Apfel')).rejects.toMatchObject({ kind: 'rate-limit', retryAfterSeconds: 30 });

    const down = createWiktionaryDeProvider(async () => jsonResponse({}, 503), parseHtml);
    await expect(down.lookup('Apfel')).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('free dictionary provider', () => {
  const api = [
    {
      word: 'swallow',
      license: { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0' },
      sourceUrls: ['https://en.wiktionary.org/wiki/swallow'],
      meanings: [
        {
          partOfSpeech: 'verb',
          definitions: [
            { definition: 'To cause (food) to pass into the stomach.' },
            { definition: 'To consume.', example: 'The sea swallowed the boat.' },
          ],
        },
        { partOfSpeech: 'noun', definitions: [{ definition: 'A bird.' }] },
      ],
    },
  ];

  it('parses meanings, examples and attribution', () => {
    const result = parseFreeDictionary(api, 'swallow');
    expect(result.status).toBe('found');
    expect(result.entries.map((e) => e.pos)).toEqual(['verb', 'noun']);
    expect(result.entries[0].definitions[1].examples).toEqual([{ text: 'The sea swallowed the boat.' }]);
    expect(result.license?.name).toBe('CC BY-SA 3.0');
  });

  it('maps 404 to not-found and errors to LookupError', async () => {
    const notFound = createFreeDictionaryProvider(async () => jsonResponse({ title: 'No Definitions Found' }, 404));
    expect((await notFound.lookup('zzzqqq')).status).toBe('not-found');

    const limited = createFreeDictionaryProvider(async () => jsonResponse({}, 429));
    await expect(limited.lookup('swallow')).rejects.toBeInstanceOf(LookupError);

    const found = createFreeDictionaryProvider(async () => jsonResponse(api));
    expect((await found.lookup('swallow')).status).toBe('found');
  });

  it('only ever sends the single word in the URL', async () => {
    let seen = '';
    const provider = createFreeDictionaryProvider(async (url) => {
      seen = url;
      return jsonResponse(api);
    });
    await provider.lookup('swallow');
    expect(seen).toBe('https://api.dictionaryapi.dev/api/v2/entries/en/swallow');
  });
});

describe('lookup queue', () => {
  const concepts = new Map<string, Concept>();
  const saved = new Map<string, unknown>();
  let clock = 0;
  const sleeps: number[] = [];

  function concept(id: string, text: string, lang: 'en' | 'de' = 'en'): Concept {
    return {
      id,
      dictionaryId: 'd',
      lang,
      text,
      meanings: [],
      verification: 'unverified',
      source: { type: 'quick-add' },
      status: 'loaded',
      createdAt: 0,
      updatedAt: 0,
    };
  }

  function makeQueue(provider: Partial<LookupProvider>, extra: Partial<LookupQueueDeps> = {}) {
    const full: LookupProvider = {
      id: 'fake',
      languages: ['en', 'de'],
      minIntervalMs: 1000,
      lookup: async () => ({ status: 'found', entries: [{ definitions: [{ text: 'x' }] }] }),
      ...provider,
    };
    return new LookupQueue({
      getProvider: () => full,
      loadConcept: async (id) => concepts.get(id),
      saveSuggestion: async (id, s) => void saved.set(id, s),
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
      isOnline: () => true,
      ...extra,
    });
  }

  async function settle(queue: LookupQueue) {
    for (let i = 0; i < 50 && queue.getState().status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  beforeEach(() => {
    concepts.clear();
    saved.clear();
    sleeps.length = 0;
    clock = 10_000;
  });

  it('looks words up one by one, spaced out, saving each result', async () => {
    for (const w of ['a', 'b', 'c']) concepts.set(w, concept(w, `word-${w}`));
    const queue = makeQueue({});
    queue.enqueue(['a', 'b', 'c']);
    await settle(queue);

    expect(queue.getState()).toMatchObject({ status: 'idle', total: 3, done: 3, found: 3 });
    expect([...saved.keys()]).toEqual(['a', 'b', 'c']);
    // Two gaps of the provider's minimum interval between three requests.
    expect(sleeps.filter((s) => s > 0)).toEqual([1000, 1000]);
    expect((saved.get('a') as { provider: string }).provider).toBe('fake');
  });

  it('never sends phrases, only single words', async () => {
    concepts.set('p', concept('p', 'look after'));
    concepts.set('w', concept('w', 'swallow'));
    const sent: string[] = [];
    const queue = makeQueue({ lookup: async (word) => (sent.push(word), { status: 'found', entries: [] }) });
    queue.enqueue(['p', 'w']);
    await settle(queue);
    expect(sent).toEqual(['swallow']);
    expect(queue.getState().skipped).toBe(1);
    expect(saved.has('p')).toBe(false);
  });

  it('records "not-found" so the word is not asked again', async () => {
    concepts.set('a', concept('a', 'zzzqqq'));
    const queue = makeQueue({ lookup: async () => ({ status: 'not-found', entries: [] }) });
    queue.enqueue(['a']);
    await settle(queue);
    expect(queue.getState()).toMatchObject({ found: 0, notFound: 1 });
    expect((saved.get('a') as { status: string }).status).toBe('not-found');
  });

  it('pauses on a service error, keeps the word, and resumes on request', async () => {
    for (const w of ['a', 'b']) concepts.set(w, concept(w, `word-${w}`));
    let calls = 0;
    const queue = makeQueue({
      lookup: async () => {
        calls++;
        if (calls === 2) throw new LookupError('rate-limit', 'hết lượt');
        return { status: 'found', entries: [] };
      },
    });
    queue.enqueue(['a', 'b']);
    await settle(queue);

    expect(queue.getState()).toMatchObject({ status: 'paused', done: 1, error: { kind: 'rate-limit' } });
    expect([...saved.keys()]).toEqual(['a']); // b untouched

    await queue.start();
    expect(queue.getState()).toMatchObject({ status: 'idle', done: 2, found: 2 });
    expect([...saved.keys()]).toEqual(['a', 'b']);
    expect(calls).toBe(3); // no automatic retry in between
  });

  it('pauses without calling the service while offline', async () => {
    concepts.set('a', concept('a', 'swallow'));
    let called = false;
    const queue = makeQueue(
      { lookup: async () => ((called = true), { status: 'found', entries: [] }) },
      { isOnline: () => false },
    );
    queue.enqueue(['a']);
    await settle(queue);
    expect(called).toBe(false);
    expect(queue.getState()).toMatchObject({ status: 'paused', error: { kind: 'network' } });
  });
});

describe('applying a reviewed suggestion', () => {
  beforeEach(async () => {
    await db.concepts.clear();
    await db.examples.clear();
  });

  async function seedConcept(overrides: Partial<Concept> = {}): Promise<Concept> {
    const c: Concept = {
      id: 'c1',
      dictionaryId: 'dict-de',
      lang: 'de',
      text: 'Apfel',
      meanings: ['quả táo'],
      verification: 'unverified',
      source: { type: 'quick-add' },
      status: 'loaded',
      createdAt: 1,
      updatedAt: 1,
      lookup: {
        status: 'found',
        provider: 'wiktionary-de',
        fetchedAt: 1,
        entries: [{ definitions: [{ text: 'apple' }] }],
      },
      ...overrides,
    };
    await conceptRepository.add(c);
    return c;
  }

  it('copies the picked data in, verifies the concept and drops the suggestion', async () => {
    await seedConcept();
    const out = await applyReview('c1', {
      pos: 'noun',
      meanings: ['apple', 'quả táo'],
      grammar: { gender: 'der', plural: 'Äpfel' },
      examples: [
        { text: 'Ich esse einen Apfel.', translation: 'I eat an apple.' },
        { text: 'Das Obst ist reif.' },
      ],
    });

    const c = (await conceptRepository.getById('c1'))!;
    expect(c).toMatchObject({
      pos: 'noun',
      verification: 'verified',
      grammar: { gender: 'der', plural: 'Äpfel' },
    });
    expect(c.meanings).toEqual(['quả táo', 'apple']); // existing kept, no duplicate
    expect(c.lookup).toBeUndefined();

    const examples = await exampleRepository.listActive();
    const linked = examples.find((e) => e.targetConceptId === 'c1')!;
    expect(linked).toMatchObject({
      text: 'Ich esse einen Apfel.',
      highlight: { start: 15, end: 20 },
      note: 'I eat an apple.',
      verification: 'verified',
    });
    // Sentence without the word: goes to the inbox for highlighting.
    expect(examples.find((e) => e.text === 'Das Obst ist reif.')?.targetConceptId).toBeUndefined();
    expect(out).toEqual({ examplesAdded: 1, inboxExamples: 1 });
  });

  it('does not add an example that already exists', async () => {
    await seedConcept();
    await applyReview('c1', { meanings: [], examples: [{ text: 'Ich esse einen Apfel.' }] });
    await seedConcept({ id: 'c1' }).catch(() => undefined);
    const again = await applyReview('c1', { meanings: [], examples: [{ text: 'ich esse einen apfel.' }] });
    expect(again.examplesAdded).toBe(0);
    expect(await exampleRepository.listActive()).toHaveLength(1);
  });

  it('merges verb forms without wiping existing grammar', async () => {
    await seedConcept({ text: 'gehen', grammar: { verbForms: { infinitiv: 'gehen' } } });
    await applyReview('c1', {
      meanings: [],
      grammar: { verbForms: { infinitiv: 'gehen', praeteritum: 'ging', partizip2: 'gegangen' } },
      examples: [],
    });
    expect((await conceptRepository.getById('c1'))!.grammar?.verbForms).toEqual({
      infinitiv: 'gehen',
      praeteritum: 'ging',
      partizip2: 'gegangen',
    });
  });

  it('dismissing a suggestion leaves the concept unverified and unchanged', async () => {
    await seedConcept();
    await dismissSuggestion('c1');
    const c = (await conceptRepository.getById('c1'))!;
    expect(c.lookup).toBeUndefined();
    expect(c.verification).toBe('unverified');
    expect(c.meanings).toEqual(['quả táo']);
  });
});
