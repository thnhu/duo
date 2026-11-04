import { settingsRepository, dictionaryRepository } from './repositories';
import { createDefaultSettings, SETTINGS_ID } from './defaults';
import type { Dictionary, Lang } from './types';

function buildDefaultDictionaries(): Record<Lang, Dictionary> {
  const updatedAt = Date.now();
  return {
    en: { id: 'dict-en', name: 'English', lang: 'en', updatedAt },
    de: { id: 'dict-de', name: 'Deutsch', lang: 'de', updatedAt },
  };
}

// Spec section 6.2/C6: run once per device so a fresh IndexedDB always has
// Settings and the MVP's one-dictionary-per-language set up.
export async function ensureDefaultSettings(): Promise<void> {
  const existing = await settingsRepository.getById(SETTINGS_ID);
  if (!existing) {
    await settingsRepository.add(createDefaultSettings());
  }
}

export async function ensureDefaultDictionaries(): Promise<void> {
  for (const dictionary of Object.values(buildDefaultDictionaries())) {
    const existing = await dictionaryRepository.getById(dictionary.id);
    if (!existing) {
      await dictionaryRepository.add(dictionary);
    }
  }
}
