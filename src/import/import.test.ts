import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { defaultAttributeValueSets } from '../db/defaults';
import { ensureDefaultDictionaries } from '../db/seed';
import { conceptRepository, exampleRepository } from '../db/repositories';
import { decodeText, detectDelimiter, parseCsv } from './csv';
import { buildRows, type BuildContext } from './build';
import { guessMapping, resolveColumns, saveMapping, listSavedMappings } from './mapping';
import { planGroups } from './plan';
import { commitImport, getLatestUndoableBatch, undoImport } from './commit';
import { readTable } from './readFile';
import { templateCsv, templateTable, templateXlsx } from './template';

const context: BuildContext = {
  attributeValueSets: defaultAttributeValueSets,
  languages: ['en', 'de'],
  defaultLang: 'de',
};

const encoder = new TextEncoder();
function bytes(text: string): ArrayBuffer {
  return encoder.encode(text).buffer as ArrayBuffer;
}

beforeEach(async () => {
  await db.concepts.clear();
  await db.examples.clear();
  await db.importBatches.clear();
  await db.importMappings.clear();
  await db.dictionaries.clear();
  await ensureDefaultDictionaries();
});

async function importCsv(csv: string, duplicateAction: 'skip' | 'merge' | 'update' = 'merge') {
  const table = await readTable(bytes(csv), 'words.csv');
  const headers = table.rows[0];
  const { mapping } = guessMapping(headers, []);
  const built = buildRows(table.rows, resolveColumns(headers, mapping), context);
  const groups = planGroups(built.rows, await conceptRepository.listActive());
  const result = await commitImport(groups, {
    fileName: 'words.csv',
    mode: 'breadth',
    duplicateAction,
  });
  return { built, groups, result };
}

describe('csv', () => {
  it('parses quotes, embedded delimiters/newlines and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x, y","line1\nline2"\r\n"say ""hi""",z', ',');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'line1\nline2'],
      ['say "hi"', 'z'],
    ]);
  });

  it('detects comma, semicolon and tab delimiters', () => {
    expect(detectDelimiter('text,lang\nApfel,de')).toBe(',');
    expect(detectDelimiter('text;lang\nApfel;de')).toBe(';');
    expect(detectDelimiter('text\tlang\nApfel\tde')).toBe('\t');
    // Commas inside values must not win over the real delimiter.
    expect(detectDelimiter('text;meaning\nApfel;"a, b, c"')).toBe(';');
  });

  it('strips a UTF-8 BOM and keeps ä ö ü ß intact', () => {
    const decoded = decodeText(bytes('﻿text\nÄpfel Öl Übung Straße'));
    expect(decoded.text).toBe('text\nÄpfel Öl Übung Straße');
    expect(decoded.fellBack).toBe(false);
    expect(decoded.suspectedMojibake).toBe(false);
  });

  it('falls back to windows-1252 for non-UTF-8 bytes (e.g. Excel "CSV")', () => {
    // "Straße" in windows-1252: ß = 0xDF, invalid as UTF-8.
    const latin1 = new Uint8Array([0x53, 0x74, 0x72, 0x61, 0xdf, 0x65]).buffer as ArrayBuffer;
    const decoded = decodeText(latin1);
    expect(decoded.text).toBe('Straße');
    expect(decoded.fellBack).toBe(true);
  });

  it('flags mojibake (UTF-8 text read as latin1)', () => {
    const wrong = decodeText(bytes('Äpfel Straße'), 'windows-1252');
    expect(wrong.text).toContain('Ã');
    expect(wrong.suspectedMojibake).toBe(true);
  });
});

describe('mapping', () => {
  it('guesses columns from header names, any case and diacritics', () => {
    const { mapping, source } = guessMapping(['Từ', 'NGHĨA', 'Bài', 'Beispiel', 'Ignored'], []);
    expect(source).toBe('headers');
    expect(mapping).toEqual({
      Từ: 'text',
      NGHĨA: 'meaning',
      Bài: 'lesson',
      Beispiel: 'example',
      Ignored: '',
    });
  });

  it('reuses a saved mapping when the file has its columns', async () => {
    await saveMapping('Sách A', { Col1: 'text', Col2: 'meaning', Col3: '' });
    const guess = guessMapping(['Col1', 'Col2', 'Col3'], await listSavedMappings());
    expect(guess.source).toBe('saved');
    expect(guess.savedName).toBe('Sách A');
    expect(guess.mapping).toEqual({ Col1: 'text', Col2: 'meaning', Col3: '' });
  });

  it('saving the same name twice updates instead of duplicating', async () => {
    await saveMapping('Sách A', { A: 'text' });
    await saveMapping('Sách A', { A: 'text', B: 'meaning' });
    const saved = await listSavedMappings();
    expect(saved).toHaveLength(1);
    expect(saved[0].columns).toEqual({ A: 'text', B: 'meaning' });
  });
});

describe('buildRows', () => {
  const csv = [
    'text,lang,pos,meaning,lesson,example,gender,plural,tone',
    'Apfel,de,noun,quả táo,L1,Ich esse einen Apfel.,m,Äpfel,',
    'swallow,en,verb,nuốt;nuốt chửng,L2,She swallowed the pill.,,,informal',
    ',de,noun,thiếu text,,,,,',
    'Kuh,xx,noun,bò,,,,,',
    'Tisch,de,noun,bàn,,,,,Slangy',
    ',,,,,,,,',
    'Haus,de,noun,nhà,L1,Das ist unser Haus.,das,Häuser,',
  ].join('\n');

  it('builds valid rows, normalizes values and reports row errors', async () => {
    const table = await readTable(bytes(csv), 'x.csv');
    const headers = table.rows[0];
    const { mapping } = guessMapping(headers, []);
    const built = buildRows(table.rows, resolveColumns(headers, mapping), context);

    expect(built.rows.map((r) => r.text)).toEqual(['Apfel', 'swallow', 'Haus']);
    expect(built.blankRows).toBe(1);
    expect(built.errors.map((e) => e.rowNumber)).toEqual([4, 5, 6]);
    expect(built.errors[0].message).toMatch(/Thiếu cột text/);
    expect(built.errors[1].message).toMatch(/Ngôn ngữ "xx"/);
    expect(built.errors[2].message).toMatch(/tone: "Slangy"/);

    const apfel = built.rows[0];
    expect(apfel.grammar).toEqual({ gender: 'der', plural: 'Äpfel' });
    expect(apfel.example.highlight).toEqual({ start: 15, end: 20 }); // found "Apfel" in the sentence

    const swallow = built.rows[1];
    expect(swallow.meanings).toEqual(['nuốt', 'nuốt chửng']);
    expect(swallow.example.attributes).toEqual({ tone: 'Informal' }); // canonical casing
    // "swallow" is found inside "swallowed" and highlighted there.
    expect(swallow.example.highlight).toEqual({ start: 4, end: 11 });
  });

  it('uses the highlight column when the sentence has a variant form', async () => {
    const table = [
      ['text', 'example', 'highlight'],
      ['swallow', 'She swallowed the pill.', 'swallowed'],
    ];
    const { mapping } = guessMapping(table[0], []);
    const built = buildRows(table, resolveColumns(table[0], mapping), { ...context, defaultLang: 'en' });
    expect(built.rows[0].example.highlight).toEqual({ start: 4, end: 13 });
  });

  it('flags a sentence that does not contain the word for manual highlighting', () => {
    const table = [
      ['text', 'example'],
      ['go', 'He went home.'],
    ];
    const { mapping } = guessMapping(table[0], []);
    const built = buildRows(table, resolveColumns(table[0], mapping), { ...context, defaultLang: 'en' });
    expect(built.rows[0].example.needsHighlight).toBe(true);
    expect(built.warnings).toHaveLength(1);
  });
});

describe('import into the library', () => {
  const csv = [
    'text,lang,pos,meaning,lesson,example',
    'Apfel,de,noun,quả táo,L1,Ich esse einen Apfel.',
    'Äpfel,de,noun,những quả táo,L1,',
    'Straße,de,noun,đường,L2,Die Straße ist lang.',
    'Übung,de,noun,bài tập,L2,',
    'Öl,de,noun,dầu,L2,',
    'gehen,de,verb,đi,L2,He went home.',
  ].join('\r\n');

  it('imports a file with ä ö ü ß, with minimal examples and highlights', async () => {
    const { result } = await importCsv(csv);
    expect(result.createdConcepts).toBe(6);

    const texts = (await conceptRepository.listActive()).map((c) => c.text).sort();
    expect(texts).toEqual(['Apfel', 'gehen', 'Straße', 'Äpfel', 'Öl', 'Übung'].sort());

    const strasse = (await conceptRepository.listActive()).find((c) => c.text === 'Straße')!;
    expect(strasse).toMatchObject({
      lang: 'de',
      source: { type: 'import', fileName: 'words.csv', lesson: 'L2' },
      mode: 'breadth',
      status: 'loaded',
      verification: 'unverified',
    });
    const examples = (await exampleRepository.listActive()).filter((e) => e.targetConceptId === strasse.id);
    expect(examples).toHaveLength(1);
    expect(examples[0].highlight).toEqual({ start: 4, end: 10 });

    // A concept without a sentence gets a minimal example (C4).
    const ubung = (await conceptRepository.listActive()).find((c) => c.text === 'Übung')!;
    const minimal = (await exampleRepository.listActive()).filter((e) => e.targetConceptId === ubung.id);
    expect(minimal).toHaveLength(1);
    expect(minimal[0].isMinimal).toBe(true);
  });

  it('sends a sentence that does not contain the word to the inbox', async () => {
    const { result } = await importCsv(csv);
    expect(result.inboxExamples).toBe(1);
    const inbox = (await exampleRepository.listActive()).filter((e) => e.targetConceptId === undefined);
    expect(inbox.map((e) => e.text)).toEqual(['He went home.']);
  });

  it('re-importing the same file creates no duplicates', async () => {
    await importCsv(csv);
    const conceptsBefore = await conceptRepository.listActive();
    const examplesBefore = await exampleRepository.listActive();

    for (const action of ['merge', 'skip', 'update'] as const) {
      const { result } = await importCsv(csv, action);
      expect(result.createdConcepts).toBe(0);
      expect(result.examplesAdded).toBe(0);
      expect(result.batchId).toBeUndefined();
    }
    expect(await conceptRepository.listActive()).toHaveLength(conceptsBefore.length);
    expect(await exampleRepository.listActive()).toHaveLength(examplesBefore.length);
  });

  it('folds rows with the same word into one concept with several examples', async () => {
    const rows = [
      'text,lang,meaning,example',
      'swallow,en,nuốt,She swallowed the pill.',
      'swallow,en,nuốt chửng,Swallow your pride.',
      'Swallow,en,,',
    ].join('\n');
    const { result } = await importCsv(rows);
    expect(result.createdConcepts).toBe(1);
    const [concept] = await conceptRepository.listActive();
    expect(concept.meanings).toEqual(['nuốt', 'nuốt chửng']);
    const examples = await exampleRepository.listActive();
    expect(examples.map((e) => e.text).sort()).toEqual(['She swallowed the pill.', 'Swallow your pride.']);
  });

  it('merge adds new examples to an existing word; update also overwrites fields', async () => {
    await importCsv('text,lang,pos,meaning,example\nswallow,en,verb,nuốt,She swallowed the pill.');

    const next = 'text,lang,pos,meaning,example\nswallow,en,verb,nuốt chửng,Swallow your pride.';
    const merged = await importCsv(next, 'merge');
    expect(merged.result).toMatchObject({ createdConcepts: 0, mergedConcepts: 1, examplesAdded: 1 });
    let [concept] = await conceptRepository.listActive();
    expect(concept.meanings).toEqual(['nuốt', 'nuốt chửng']);

    const updated = await importCsv('text,lang,pos,meaning\nswallow,en,verb,nuốt hẳn', 'update');
    expect(updated.result.updatedConcepts).toBe(1);
    [concept] = await conceptRepository.listActive();
    expect(concept.meanings).toEqual(['nuốt hẳn']);
  });

  it('"skip" leaves existing words untouched', async () => {
    await importCsv('text,lang,meaning\nswallow,en,nuốt');
    const { result } = await importCsv('text,lang,meaning,example\nswallow,en,khác,Swallow it.', 'skip');
    expect(result.skippedDuplicates).toBe(1);
    expect(result.examplesAdded).toBe(0);
    const [concept] = await conceptRepository.listActive();
    expect(concept.meanings).toEqual(['nuốt']);
  });

  it('hides words already acquired by default (A6)', async () => {
    await importCsv('text,lang\nswallow,en');
    const [concept] = await conceptRepository.listActive();
    await conceptRepository.update(concept.id, { status: 'acquired' });

    const table = [['text', 'lang'], ['swallow', 'en'], ['chew', 'en']];
    const built = buildRows(table, { text: 0, lang: 1 }, context);
    const groups = planGroups(built.rows, await conceptRepository.listActive());
    expect(groups.find((g) => g.text === 'swallow')).toMatchObject({ hiddenAsAcquired: true, included: false });
    expect(groups.find((g) => g.text === 'chew')!.included).toBe(true);
  });

  it('only imports the groups left included (bỏ từng từ)', async () => {
    const table = [['text', 'lang'], ['swallow', 'en'], ['chew', 'en']];
    const built = buildRows(table, { text: 0, lang: 1 }, context);
    const groups = planGroups(built.rows, []);
    groups[0].included = false;
    const result = await commitImport(groups, { fileName: 'f.csv', mode: 'depth', duplicateAction: 'merge' });
    expect(result.createdConcepts).toBe(1);
    expect((await conceptRepository.listActive())[0]).toMatchObject({ text: 'chew', mode: 'depth' });
  });

  it('keeps TMRND labels from the file as verified attributes', async () => {
    await importCsv('text,lang,example,tone,register\nswallow,en,Swallow it.,informal,business');
    const [example] = await exampleRepository.listActive();
    expect(example.attributes).toMatchObject({ tone: 'Informal', register: 'Business', mode: 'Neutral' });
    expect(example.attributesStatus).toBe('verified');
  });
});

describe('undo', () => {
  it('removes what the latest import created and restores what it changed', async () => {
    await importCsv('text,lang,meaning\nswallow,en,nuốt');
    const first = await getLatestUndoableBatch();
    expect(first).toBeDefined();
    // Batches are ordered by createdAt; two in the same millisecond would tie
    // (flaky on fast CI machines).
    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await importCsv('text,lang,meaning\nswallow,en,nuốt chửng\nchew,en,nhai', 'update');
    expect(second.result.createdConcepts).toBe(1);

    // Only the latest import can be undone.
    expect(await undoImport(first!.id)).toBe(false);
    expect(await undoImport(second.result.batchId!)).toBe(true);

    const concepts = await conceptRepository.listActive();
    expect(concepts.map((c) => c.text)).toEqual(['swallow']);
    expect(concepts[0].meanings).toEqual(['nuốt']);
    // Soft delete: the rows are still there for sync.
    expect(await db.concepts.count()).toBe(2);

    expect((await getLatestUndoableBatch())!.id).toBe(first!.id);
  });
});

describe('template + xlsx', () => {
  it('csv template round-trips through the reader and the builder', async () => {
    const table = await readTable(bytes(templateCsv()), 'template.csv');
    expect(table.rows).toEqual(templateTable());
    const headers = table.rows[0];
    const { mapping } = guessMapping(headers, []);
    const built = buildRows(table.rows, resolveColumns(headers, mapping), context);
    expect(built.errors).toEqual([]);
    expect(built.rows.map((r) => r.text)).toEqual(['Apfel', 'gehen', 'swallow']);
    expect(built.rows[0].grammar?.plural).toBe('Äpfel');
  });

  it('reads an .xlsx file (template) the same way', async () => {
    const blob = await templateXlsx();
    const table = await readTable(await blob.arrayBuffer(), 'template.xlsx');
    expect(table.kind).toBe('xlsx');
    expect(table.sheets?.length).toBeGreaterThan(0);
    expect(table.rows).toEqual(templateTable());
  });
});

describe('schema v2 migration', () => {
  it('upgrades a v1 database without losing data', async () => {
    const { default: Dexie } = await import('dexie');
    const { DuoDB } = await import('../db/schema');
    const name = 'duo-migration-v1-to-v2';

    const v1 = new Dexie(name);
    v1.version(1).stores({
      dictionaries: 'id, lang',
      concepts: 'id, dictionaryId, lang, status, [dictionaryId+text], updatedAt, deletedAt',
      examples: 'id, dictionaryId, targetConceptId, attributesStatus, updatedAt, deletedAt',
      scheduleStates: 'exampleId, due, updatedAt',
      reviewLogs: 'id, conceptId, exampleId, timestamp',
      importMappings: 'id, name',
      settings: 'id',
    });
    await v1.open();
    await v1.table('concepts').add({ id: 'c1', text: 'swallow', lang: 'en', meanings: [] });
    await v1.table('settings').add({ id: 'default', schemaVersion: 1 });
    v1.close();

    const v2 = new DuoDB(name);
    await v2.open();
    expect((await v2.concepts.get('c1'))?.text).toBe('swallow');
    expect((await v2.settings.get('default'))?.schemaVersion).toBe(6);
    expect(await v2.importBatches.count()).toBe(0);
    expect(await v2.syncMeta.count()).toBe(0);
    v2.close();
    await Dexie.delete(name);
  });
});
