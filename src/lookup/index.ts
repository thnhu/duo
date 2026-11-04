import { ModuleRegistry } from '../core/registry';
import { conceptRepository } from '../db/repositories';
import type { Concept, Lang } from '../db/types';
import { createFreeDictionaryProvider } from './freeDictionary';
import { isSingleWord, LookupQueue } from './queue';
import type { LookupProvider } from './types';
import { createWiktionaryDeProvider } from './wiktionaryDe';

export * from './types';
export { isSingleWord } from './queue';
export type { LookupQueueState } from './queue';

// LookupProviders register here instead of being imported by screens
// (spec section 7). One provider per language; the first registered for a
// language is used.
export const lookupProviders = new ModuleRegistry<LookupProvider>();
lookupProviders.register(createFreeDictionaryProvider());
lookupProviders.register(createWiktionaryDeProvider());

export function getLookupProvider(lang: Lang): LookupProvider | undefined {
  return lookupProviders.list().find((p) => p.languages.includes(lang));
}

export const lookupQueue = new LookupQueue({
  getProvider: getLookupProvider,
  loadConcept: (id) => conceptRepository.getById(id),
  saveSuggestion: (id, lookup) => conceptRepository.update(id, { lookup }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  isOnline: () => navigator.onLine,
});

// A word worth looking up automatically: not yet reviewed, no lookup
// attempted, and a single word.
export function needsLookup(concept: Concept): boolean {
  return (
    concept.deletedAt === undefined &&
    concept.verification === 'unverified' &&
    concept.lookup === undefined &&
    isSingleWord(concept.text) &&
    getLookupProvider(concept.lang) !== undefined
  );
}
