import { ModuleRegistry } from '../core/registry';
import { SETTINGS_ID } from '../db/defaults';
import { settingsRepository } from '../db/repositories';
import type { AiProviderConfig } from '../db/types';
import { createGeminiProvider } from './gemini';
import type { AiProvider } from './types';

export * from './types';
export { callsToday, loadApiKey, saveApiKey } from './local';

// AiProviders register here instead of being imported by screens (spec
// section 7). Switching provider = register another one and change the id.
export const aiProviders = new ModuleRegistry<AiProvider>();
aiProviders.register(createGeminiProvider());

export const ACTIVE_AI_PROVIDER_ID = 'gemini';

export function getAiProvider(): AiProvider | undefined {
  return aiProviders.get(ACTIVE_AI_PROVIDER_ID);
}

export async function loadAiConfig(): Promise<AiProviderConfig> {
  const settings = await settingsRepository.getById(SETTINGS_ID);
  return settings?.aiProviderConfig ?? { enabled: false };
}

// Never contains the API key (that stays in `local.ts`).
export async function saveAiConfig(config: AiProviderConfig): Promise<void> {
  const model = config.model?.trim();
  await settingsRepository.update(SETTINGS_ID, {
    aiProviderConfig: { enabled: config.enabled, ...(model ? { model } : {}) },
  });
}
