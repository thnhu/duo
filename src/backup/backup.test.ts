import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createDefaultAttributes, createDefaultSettings, defaultAttributeValueSets } from '../db/defaults';
import { ensureDefaultDictionaries } from '../db/seed';
import {
  conceptRepository,
  exampleRepository,
  scheduleStateRepository,
  settingsRepository,
} from '../db/repositories';
import type { Concept, Example } from '../db/types';
import { buildRows, type BuildContext } from '../import/build';
import { commitImport } from '../import/commit';
import { guessMapping, resolveColumns } from '../import/mapping';
import { planGroups } from '../import/plan';
import { readTable } from '../import/readFile';
import { importFields } from '../import/fields';
import { BackupError, exportBackup, restoreBackup, validateBackup } from './json';
import { exportTable, exportXlsx } from './table';

const context: BuildContext = {
  attributeValueSets: defaultAttributeValueSets,
  languages: ['en', 'de'],
  defaultLang: 'de',
};

function concept(id: string, text: string, overrides: Partial<Concept> = {}): Concept {
  return {
    id, dictionaryId: 'dict-de', lang: 'de', text, meanings: ['nghĩa a', 'nghĩa b'],
    verification: 'verified', source: { type: 'import', lesson: 'L1' }, status: 'loaded',
    createdAt: 1, updatedAt: 10, ...overrides,
  };
}

function example(id: string, conceptId: string | undefined, text: string, overrides: Partial<Example> = {}): Example {
  return {
    id, dictionaryId: 'dict-de', text, targetConceptId: conceptId,
    attributes: createDefaultAttributes(), attributesStatus: 'empty',
    verification: 'unverified', createdAt: 1, updatedAt: 10, ...overrides,
  };
}

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

async function seedData() {
  await ensureDefaultDictionaries();
  await settingsRepository.add(createDefaultSettings());
  await conceptRepository.add(
    concept('c1', 'Apfel', { pos: 'noun', grammar: { gender: 'der', plural: 'Äpfel' } }),
  );
  await exampleRepository.add(example('e1', 'c1', 'Ich esse einen Apfel.', { highlight: { start: 13, end: 18 } }));
  await exampleRepository.add(example('e1min', 'c1', 'Apfel', { isMinimal: true }));
  await conceptRepository.add(
    concept('c2', 'swallow', {
      lang: 'en', dictionaryId: 'dict-en', pos: 'verb', meanings: ['nuốt'],
      source: { type: 'quick-add' },
    }),
  );
  await exampleRepository.add(
    example('e2', 'c2', 'She swallowed the pill.', {
      dictionaryId: 'dict-en', highlight: { start: 4, end: 13 },
      attributes: { ...createDefaultAttributes(), tone: 'Informal' }, attributesStatus: 'verified',
      note: 'từ đời thường',
    }),
  );
  // Suggested (not accepted) labels must not leak into the file.
  await exampleRepository.add(
    example('e3', 'c2', 'He swallows hard.', {
      dictionaryId: 'dict-en', highlight: { start: 3, end: 11 },
      attributes: { ...createDefaultAttributes(), tone: 'Formal' }, attributesStatus: 'suggested',
    }),
  );
  await conceptRepository.add(concept('gone', 'Gelöscht', { deletedAt: 20 }));
  await exampleRepository.add(example('inbox', undefined, 'Eine Satz ohne Wort.'));
  await scheduleStateRepository.add({ exampleId: 'e1', due: 999, intervalDays: 6, ease: 2.5, lapses: 0, updatedAt: 10 });
  await db.reviewLogs.add({
    id: 'log1', conceptId: 'c1', exampleId: 'e1', exerciseType: 'de.dictation',
    correct: true, responseTimeMs: 1200, timestamp: 500,
  });
}

beforeEach(clearAll);

describe('xlsx export table', () => {
  it('uses exactly the import columns, in the same order', async () => {
    await seedData();
    const table = exportTable(await conceptRepository.listAll(), await exampleRepository.listAll());
    expect(table[0]).toEqual(importFields.map((f) => f.id));
  });

  it('writes one row per concept + real example, skips deleted and inbox items', async () => {
    await seedData();
    const [header, ...rows] = exportTable(await conceptRepository.listAll(), await exampleRepository.listAll());
    const col = (row: string[], id: string) => row[header.indexOf(id)];
    // de first (sorted by language), then en; "Gelöscht" is soft-deleted;
    // the minimal example is not a row of its own.
    expect(rows.map((r) => [col(r, 'text'), col(r, 'example')])).toEqual([
      ['Apfel', 'Ich esse einen Apfel.'],
      ['swallow', 'She swallowed the pill.'],
      ['swallow', 'He swallows hard.'],
    ]);
    const first = rows[1];
    expect(col(first, 'highlight')).toBe('swallowed');
    expect(col(first, 'tone')).toBe('Informal');
    expect(col(first, 'note')).toBe('từ đời thường');
    // Suggested labels are not exported.
    expect(col(rows[2], 'tone')).toBe('');
    expect(col(rows[0], 'meaning')).toBe('nghĩa a; nghĩa b');
    expect(col(rows[0], 'gender')).toBe('der');
  });

  it('a concept with only a minimal example gets one row with no example text', async () => {
    await ensureDefaultDictionaries();
    await conceptRepository.add(concept('c1', 'Haus'));
    await exampleRepository.add(example('m', 'c1', 'Haus', { isMinimal: true }));
    const [, ...rows] = exportTable(await conceptRepository.listAll(), await exampleRepository.listAll());
    expect(rows).toHaveLength(1);
    expect(rows[0][importFields.findIndex((f) => f.id === 'example')]).toBe('');
  });

  it('exported xlsx can be imported again with the same content', async () => {
    await seedData();
    const blob = await exportXlsx(await conceptRepository.listActive(), await exampleRepository.listActive());
    const bytes = await blob.arrayBuffer();

    // Fresh device: only the default dictionaries.
    await clearAll();
    await ensureDefaultDictionaries();

    const table = await readTable(bytes, 'duo-words.xlsx');
    const headers = table.rows[0];
    const { mapping } = guessMapping(headers, []);
    const built = buildRows(table.rows, resolveColumns(headers, mapping), context);
    expect(built.errors).toEqual([]);
    const groups = planGroups(built.rows, []);
    await commitImport(groups, { fileName: 'duo-words.xlsx', mode: 'breadth', duplicateAction: 'merge' });

    const concepts = await conceptRepository.listActive();
    expect(concepts.map((c) => c.text).sort()).toEqual(['Apfel', 'swallow']);
    const apfel = concepts.find((c) => c.text === 'Apfel')!;
    expect(apfel).toMatchObject({ lang: 'de', pos: 'noun', meanings: ['nghĩa a', 'nghĩa b'], grammar: { gender: 'der', plural: 'Äpfel' } });
    expect(apfel.source.lesson).toBe('L1');

    const examples = await exampleRepository.listActive();
    const swallowed = examples.find((e) => e.text === 'She swallowed the pill.')!;
    expect(swallowed.text.slice(swallowed.highlight!.start, swallowed.highlight!.end)).toBe('swallowed');
    expect(swallowed.attributes.tone).toBe('Informal');
    expect(swallowed.note).toBe('từ đời thường');

    // Importing the same file again creates no copies.
    const again = planGroups(built.rows, await conceptRepository.listActive());
    await commitImport(again, { fileName: 'duo-words.xlsx', mode: 'breadth', duplicateAction: 'merge' });
    expect((await conceptRepository.listActive()).length).toBe(2);
  });
});

describe('JSON backup', () => {
  it('exports every table, including soft-deleted rows and review history', async () => {
    await seedData();
    const backup = await exportBackup(1234);
    expect(backup).toMatchObject({ app: 'duo', format: 1, exportedAt: 1234 });
    expect(backup.tables.concepts.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'gone']);
    expect(backup.tables.examples).toHaveLength(5);
    expect(backup.tables.reviewLogs).toHaveLength(1);
    expect(backup.tables.scheduleStates).toHaveLength(1);
    expect(backup.tables.settings).toHaveLength(1);
  });

  it('moves everything to another device without losing or changing anything', async () => {
    await seedData();
    const json = JSON.stringify(await exportBackup());

    // "Other machine": fresh database, only the first-run defaults.
    const before = {
      concepts: await db.concepts.toArray(),
      examples: await db.examples.toArray(),
      schedules: await db.scheduleStates.toArray(),
      logs: await db.reviewLogs.toArray(),
    };
    await clearAll();
    await ensureDefaultDictionaries();
    await settingsRepository.add(createDefaultSettings());

    const summary = await restoreBackup(JSON.parse(json));
    expect(summary.updated + summary.added).toBeGreaterThan(0);

    const sort = <T extends { id?: string; exampleId?: string }>(rows: T[]) =>
      [...rows].sort((a, b) => String(a.id ?? a.exampleId).localeCompare(String(b.id ?? b.exampleId)));
    expect(sort(await db.concepts.toArray())).toEqual(sort(before.concepts));
    expect(sort(await db.examples.toArray())).toEqual(sort(before.examples));
    expect(await db.scheduleStates.toArray()).toEqual(before.schedules);
    expect(await db.reviewLogs.toArray()).toEqual(before.logs);
    // Soft deletion survives the trip.
    expect((await db.concepts.get('gone'))?.deletedAt).toBe(20);
  });

  it('merges: newer record wins, older is kept out, nothing is deleted, logs only added', async () => {
    await seedData();
    const backup = await exportBackup();

    // Local device moved on after the backup: c1 edited later, a new word added.
    // (Repositories stamp updatedAt with the current time, so "later" means in the future.)
    const later = Date.now() + 1_000_000;
    await db.concepts.update('c1', { text: 'Apfel (neu)', updatedAt: later });
    await conceptRepository.add(concept('c3', 'Neu'));
    // The backup has a newer c2 than this device.
    const c2 = backup.tables.concepts.find((c) => c.id === 'c2')!;
    c2.updatedAt = later + 1;
    c2.text = 'swallow (edited elsewhere)';
    // ...and a log this device lacks.
    backup.tables.reviewLogs.push({
      id: 'log2', conceptId: 'c1', exampleId: 'e1', exerciseType: 'de.dictation',
      correct: false, responseTimeMs: 3000, timestamp: 600,
    });

    const summary = await restoreBackup(backup);
    expect((await db.concepts.get('c1'))?.text).toBe('Apfel (neu)'); // local newer wins
    expect((await db.concepts.get('c2'))?.text).toBe('swallow (edited elsewhere)');
    expect(await db.concepts.get('c3')).toBeDefined(); // untouched local-only row
    expect(await db.reviewLogs.count()).toBe(2);
    expect(summary.updated).toBe(1);
    expect(summary.added).toBe(1); // only log2 was missing
  });

  it('restoring the same backup twice changes nothing', async () => {
    await seedData();
    const backup = await exportBackup();
    const second = await restoreBackup(backup);
    expect(second.added).toBe(0);
    expect(second.updated).toBe(0);
    expect(await db.concepts.count()).toBe(3);
  });

  it('refuses files that are not a backup, or are from a newer app, before writing anything', async () => {
    await seedData();
    expect(() => validateBackup({ hello: 'world' })).toThrow(BackupError);
    expect(() => validateBackup(null)).toThrow(BackupError);
    expect(() => validateBackup({ app: 'duo', format: 99, schemaVersion: 1, tables: {} })).toThrow(/mới hơn/);
    expect(() => validateBackup({ app: 'duo', format: 1, schemaVersion: 99, tables: {} })).toThrow(/mới hơn/);
    expect(() => validateBackup({ app: 'duo', format: 1, schemaVersion: 2, tables: { concepts: [{ text: 'no id' }] } })).toThrow(/id/);

    const bad = await exportBackup();
    (bad.tables.examples as unknown[]).push({ text: 'no id' });
    await db.concepts.clear();
    await expect(restoreBackup(bad)).rejects.toBeInstanceOf(BackupError);
    expect(await db.concepts.count()).toBe(0); // validation happens before any write
  });

  it('accepts an older backup that lacks newer tables', async () => {
    await seedData();
    const backup = await exportBackup();
    delete (backup.tables as Partial<typeof backup.tables>).importBatches;
    backup.schemaVersion = 1;
    await expect(restoreBackup(backup)).resolves.toBeDefined();
  });
});
