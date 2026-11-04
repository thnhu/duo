import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { SETTINGS_ID, createDefaultSettings, defaultAttributeValueSets } from '../db/defaults';
import { conceptRepository, exampleRepository, settingsRepository } from '../db/repositories';
import { getVerifiedAttributes } from '../db/attributes';
import { saveSentenceWithHighlight, saveQuickWord } from '../features/quick-add/actions';
import { createGeminiProvider, parseGeminiResponse } from './gemini';
import { callsToday, loadApiKey, saveApiKey } from './local';
import { acceptSuggestion, dismissSuggestion, suggestForExample, validateSuggestion } from './suggest';
import { needsSuggestion, runSuggestionBatch } from './batch';
import { AiError, type AiProvider, type RawTmrnd } from './types';

const DICT = 'dict-en';

// Tests run in Node, which has no localStorage.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});
const GOOD: RawTmrnd = {
  tone: { value: 'Informal', reason: 'Casual phrasing.', confidence: 0.9 },
  mode: { value: 'Spoken', reason: 'Conversational.' },
  register: { value: 'Neutral', reason: 'No domain.' },
  nuance: { value: 'Humorous', reason: 'Playful.', confidence: 7 },
  dialect: { value: 'Neutral', reason: 'No marker.' },
};

function fakeProvider(impl: () => Promise<RawTmrnd>): AiProvider & { calls: number } {
  const provider = {
    id: 'fake',
    label: 'Fake',
    defaultModel: 'fake-model',
    minIntervalMs: 10,
    calls: 0,
    async suggestTmrnd() {
      provider.calls++;
      return impl();
    },
  };
  return provider;
}

async function enableAi() {
  await settingsRepository.update(SETTINGS_ID, { aiProviderConfig: { enabled: true } });
  saveApiKey('test-key');
}

async function makeExample(text = 'She swallowed her pride and left.') {
  const found = await saveSentenceWithHighlight(DICT, 'en', text, { start: 4, end: 13 });
  return found!.example;
}

beforeEach(async () => {
  localStorage.clear();
  await db.concepts.clear();
  await db.examples.clear();
  await db.settings.clear();
  await settingsRepository.add(createDefaultSettings());
});

describe('validateSuggestion', () => {
  it('keeps allowed values and clamps confidence', () => {
    const s = validateSuggestion(GOOD, defaultAttributeValueSets, 'fake', 123);
    expect(s.tone).toEqual({ value: 'Informal', reason: 'Casual phrasing.', confidence: 0.9 });
    expect(s.nuance?.confidence).toBe(1);
    expect(s.mode?.confidence).toBeUndefined();
    expect(s.provider).toBe('fake');
    expect(s.suggestedAt).toBe(123);
  });

  it('drops values outside the PVO sets instead of inventing them', () => {
    const s = validateSuggestion(
      { ...GOOD, tone: { value: 'Slang', reason: 'x' }, mode: { value: 5 } },
      defaultAttributeValueSets,
      'fake',
    );
    expect(s.tone).toBeUndefined();
    expect(s.mode).toBeUndefined();
    expect(s.register?.value).toBe('Neutral');
  });

  it('fails when nothing usable is left', () => {
    expect(() => validateSuggestion({ tone: { value: 'Slang' } }, defaultAttributeValueSets, 'fake')).toThrow(
      AiError,
    );
  });
});

describe('suggestForExample', () => {
  it('stores a suggestion without making it a verified answer', async () => {
    await enableAi();
    const example = await makeExample();
    const provider = fakeProvider(async () => GOOD);

    await suggestForExample(example, provider);

    const stored = (await exampleRepository.getById(example.id))!;
    expect(stored.attributesStatus).toBe('suggested');
    expect(stored.suggestedAttributes?.tone?.value).toBe('Informal');
    expect(stored.attributes.tone).toBe('Neutral');
    expect(getVerifiedAttributes(stored)).toBeNull();
    expect(callsToday()).toBe(1);
  });

  it('never downgrades or overwrites verified labels', async () => {
    await enableAi();
    const example = await makeExample();
    await exampleRepository.update(example.id, {
      attributes: { ...example.attributes, tone: 'Formal' },
      attributesStatus: 'verified',
    });
    const current = (await exampleRepository.getById(example.id))!;

    await suggestForExample(current, fakeProvider(async () => GOOD));

    const stored = (await exampleRepository.getById(example.id))!;
    expect(stored.attributesStatus).toBe('verified');
    expect(stored.attributes.tone).toBe('Formal');
  });

  it('refuses when AI is off or there is no key, without calling the provider', async () => {
    const example = await makeExample();
    const provider = fakeProvider(async () => GOOD);
    await expect(suggestForExample(example, provider)).rejects.toMatchObject({ kind: 'not-configured' });

    await settingsRepository.update(SETTINGS_ID, { aiProviderConfig: { enabled: true } });
    await expect(suggestForExample(example, provider)).rejects.toMatchObject({ kind: 'not-configured' });
    expect(provider.calls).toBe(0);
  });

  it('leaves the example untouched when the service fails', async () => {
    await enableAi();
    const example = await makeExample();
    const provider = fakeProvider(async () => {
      throw new AiError('rate-limit', 'quota');
    });
    await expect(suggestForExample(example, provider)).rejects.toMatchObject({ kind: 'rate-limit' });
    const stored = (await exampleRepository.getById(example.id))!;
    expect(stored.attributesStatus).toBe('empty');
    expect(stored.suggestedAttributes).toBeUndefined();
  });

  it('uses the model from Settings, else the provider default', async () => {
    await enableAi();
    const example = await makeExample();
    const seen: string[] = [];
    const provider: AiProvider = {
      ...fakeProvider(async () => GOOD),
      async suggestTmrnd(request) {
        seen.push(request.model);
        return GOOD;
      },
    };
    await suggestForExample(example, provider);
    await settingsRepository.update(SETTINGS_ID, { aiProviderConfig: { enabled: true, model: ' my-model ' } });
    await suggestForExample(example, provider);
    expect(seen).toEqual(['fake-model', 'my-model']);
  });
});

describe('accept / dismiss', () => {
  it('accepting turns suggested values into verified labels', async () => {
    await enableAi();
    const example = await makeExample();
    await suggestForExample(example, fakeProvider(async () => GOOD));
    await acceptSuggestion((await exampleRepository.getById(example.id))!);

    const stored = (await exampleRepository.getById(example.id))!;
    expect(stored.attributesStatus).toBe('verified');
    expect(getVerifiedAttributes(stored)?.tone).toBe('Informal');
    expect(stored.suggestedAttributes).toBeUndefined();
  });

  it('dismissing returns an unlabelled example to empty', async () => {
    await enableAi();
    const example = await makeExample();
    await suggestForExample(example, fakeProvider(async () => GOOD));
    await dismissSuggestion((await exampleRepository.getById(example.id))!);

    const stored = (await exampleRepository.getById(example.id))!;
    expect(stored.attributesStatus).toBe('empty');
    expect(stored.suggestedAttributes).toBeUndefined();
  });
});

describe('runSuggestionBatch', () => {
  const sleep = vi.fn(async () => {});

  it('only picks real sentences with a concept and no labels', async () => {
    const real = await makeExample();
    const { concept } = await saveQuickWord(DICT, 'en', 'swallow');
    const minimal = (await db.examples.where('targetConceptId').equals(concept.id).toArray())[0];
    const inbox = { ...real, id: 'x', targetConceptId: undefined };
    expect(needsSuggestion(real)).toBe(true);
    expect(needsSuggestion(minimal)).toBe(false);
    expect(needsSuggestion(inbox)).toBe(false);
    expect(needsSuggestion({ ...real, attributesStatus: 'verified' })).toBe(false);
  });

  it('spaces calls and reports progress', async () => {
    await enableAi();
    const examples = [await makeExample('One swallowed pride.'), await makeExample('Two swallowed pride.')];
    const progress: number[] = [];
    const result = await runSuggestionBatch({
      provider: fakeProvider(async () => GOOD),
      examples,
      sleep,
      onProgress: (p) => progress.push(p.done),
    });
    expect(result).toMatchObject({ done: 2, failed: 0, total: 2, aborted: false });
    expect(progress).toEqual([1, 2]);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('stops at once on a quota error and leaves the rest untouched', async () => {
    await enableAi();
    const examples = [await makeExample('One swallowed pride.'), await makeExample('Two swallowed pride.')];
    let n = 0;
    const provider = fakeProvider(async () => {
      if (++n === 2) throw new AiError('rate-limit', 'quota');
      return GOOD;
    });
    const result = await runSuggestionBatch({ provider, examples: [...examples, examples[0]], sleep });
    expect(result.done).toBe(1);
    expect(result.stoppedBy?.kind).toBe('rate-limit');
    expect(provider.calls).toBe(2);
    expect((await exampleRepository.getById(examples[1].id))!.attributesStatus).toBe('empty');
  });

  it('skips one example with a bad answer and carries on', async () => {
    await enableAi();
    const examples = [await makeExample('One swallowed pride.'), await makeExample('Two swallowed pride.')];
    let n = 0;
    const provider = fakeProvider(async () => {
      if (++n === 1) return { tone: { value: 'Slang' } };
      return GOOD;
    });
    const result = await runSuggestionBatch({ provider, examples, sleep });
    expect(result).toMatchObject({ done: 1, failed: 1 });
  });

  it('stops when aborted', async () => {
    await enableAi();
    const examples = [await makeExample('One swallowed pride.')];
    const controller = new AbortController();
    controller.abort();
    const result = await runSuggestionBatch({
      provider: fakeProvider(async () => GOOD),
      examples,
      signal: controller.signal,
      sleep,
    });
    expect(result.aborted).toBe(true);
    expect(result.done).toBe(0);
  });
});

describe('gemini provider', () => {
  const request = {
    apiKey: 'secret-key',
    model: 'some-model',
    lang: 'en' as const,
    text: 'She swallowed her pride.',
    highlight: { start: 4, end: 13 },
    allowed: defaultAttributeValueSets,
  };
  const ok = (text: string) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

  it('sends the key in a header, constrains values and the phrase, and parses JSON', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => ok(JSON.stringify(GOOD)));
    const result = await createGeminiProvider(fetchFn).suggestTmrnd(request);

    expect(result.tone?.value).toBe('Informal');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('/models/some-model:generateContent');
    expect(url).not.toContain('secret-key');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    const body = JSON.parse(init!.body as string);
    expect(body.contents[0].parts[0].text).toContain('Highlighted phrase: swallowed');
    expect(body.generationConfig.responseSchema.properties.tone.properties.value.enum).toEqual(
      defaultAttributeValueSets.tone,
    );
  });

  it.each([
    [429, 'rate-limit'],
    [401, 'auth'],
    [403, 'auth'],
    [404, 'unavailable'],
    [500, 'unavailable'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    const provider = createGeminiProvider(async () => new Response('{}', { status }));
    await expect(provider.suggestTmrnd(request)).rejects.toMatchObject({ kind });
  });

  it('treats a 400 "API key not valid" as an auth error', async () => {
    const provider = createGeminiProvider(
      async () => new Response('{"error":{"message":"API key not valid."}}', { status: 400 }),
    );
    await expect(provider.suggestTmrnd(request)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('maps a network failure and unusable output softly', async () => {
    await expect(
      createGeminiProvider(async () => {
        throw new TypeError('failed to fetch');
      }).suggestTmrnd(request),
    ).rejects.toMatchObject({ kind: 'network' });
    expect(() => parseGeminiResponse({ candidates: [] })).toThrow(AiError);
    expect(() => parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })).toThrow(
      AiError,
    );
  });
});

describe('local secrets', () => {
  it('keeps the key out of the database and backups', async () => {
    saveApiKey('  abc  ');
    expect(loadApiKey()).toBe('abc');
    const settings = JSON.stringify(await db.settings.toArray());
    expect(settings).not.toContain('abc');
    saveApiKey(null);
    expect(loadApiKey()).toBeNull();
  });

  it('is unrelated to concepts in the db', async () => {
    expect(await conceptRepository.listAll()).toEqual([]);
  });
});
