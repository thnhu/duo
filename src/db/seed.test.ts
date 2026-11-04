import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { ensureDefaultDictionaries, ensureDefaultSettings } from './seed';
import { SETTINGS_ID } from './defaults';

beforeEach(async () => {
  await db.settings.clear();
  await db.dictionaries.clear();
});

describe('ensureDefaultSettings', () => {
  it('creates the default settings row once', async () => {
    await ensureDefaultSettings();
    const settings = await db.settings.get(SETTINGS_ID);
    expect(settings?.acquisitionCriteria.minCorrect).toBe(5);
  });

  it('is idempotent: calling twice does not duplicate or reset the row', async () => {
    await ensureDefaultSettings();
    await db.settings.update(SETTINGS_ID, { enabledModules: ['de.dictation'] });

    await ensureDefaultSettings();

    const settings = await db.settings.get(SETTINGS_ID);
    expect(settings?.enabledModules).toEqual(['de.dictation']);
    const count = await db.settings.count();
    expect(count).toBe(1);
  });
});

describe('ensureDefaultDictionaries', () => {
  it('creates one dictionary per language', async () => {
    await ensureDefaultDictionaries();
    const dictionaries = await db.dictionaries.toArray();
    expect(dictionaries.map((d) => d.lang).sort()).toEqual(['de', 'en']);
  });

  it('is idempotent', async () => {
    await ensureDefaultDictionaries();
    await ensureDefaultDictionaries();
    const count = await db.dictionaries.count();
    expect(count).toBe(2);
  });
});
