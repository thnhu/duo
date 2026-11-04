import { ensureDefaultDictionaries, ensureDefaultSettings } from './seed';

export async function initDb(): Promise<void> {
  await ensureDefaultSettings();
  await ensureDefaultDictionaries();
}
