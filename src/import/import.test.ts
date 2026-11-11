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
import { conceptKind, createWordSet, listWordSets } from '../wordsets';
import { listNeighbours } from '../links';
import { parseRelation } from './relations';
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
  await db.wordSets.clear();
  await db.conceptLinks.clear();
  await db.dictionaries.clear();
  await ensureDefaultDictionaries();
});

async function importCsv(
  csv: string,
  duplicateAction: 'skip' | 'merge' | 'update' = 'merge',
  targetSetName?: string,
) {
  const table = await readTable(bytes(csv), 'words.csv');
  const headers = table.rows[0];
  const { mapping } = guessMapping(headers, []);
  const built = buildRows(table.rows, resolveColumns(headers, mapping), context);
  const groups = planGroups(built.rows, await conceptRepository.listActive());
  const result = await commitImport(groups, {
    fileName: 'words.csv',
    mode: 'breadth',
    duplicateAction,
    targetSetName,
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

  it('highlights a split phrase (separable verb) written with an ellipsis', () => {
    const sentence = 'Wir fahren um zwölf Uhr ab.';
    const table = [
      ['text', 'example', 'highlight'],
      ['abfahren', sentence, 'fahren … ab'],
      ['abfahren', sentence, 'fahren ... ab'],
      ['abfahren', sentence, 'ab … fahren'], // wrong order: not found
    ];
    const { mapping } = guessMapping(table[0], []);
    const built = buildRows(table, resolveColumns(table[0], mapping), context);
    for (const row of built.rows.slice(0, 2)) {
      expect(row.example.highlight).toEqual({ start: 4, end: 10 });
      expect(row.example.highlightExtra).toEqual([{ start: 24, end: 26 }]);
      expect(row.example.needsHighlight).toBe(false);
    }
    expect(built.rows[2].example.needsHighlight).toBe(true);
    expect(built.warnings.some((w) => w.rowNumber === 4 && /thứ tự/.test(w.message))).toBe(true);
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

  it('reads the Präsens er/sie/es column, and a re-import adds it to a word with other forms', async () => {
    const first = 'text,lang,pos,infinitiv,praeteritum,partizip2\nabfahren,de,verb,abfahren,fuhr ab,ist abgefahren';
    await importCsv(first);
    let [concept] = await conceptRepository.listActive();
    expect(concept.grammar?.verbForms).toEqual({
      infinitiv: 'abfahren',
      praeteritum: 'fuhr ab',
      partizip2: 'ist abgefahren',
    });

    // The second file brings only the new column (header alias "Präsens er/sie/es").
    await importCsv('text,lang,pos,Präsens er/sie/es\nabfahren,de,verb,fährt ab', 'merge');
    [concept] = await conceptRepository.listActive();
    expect(concept.grammar?.verbForms).toEqual({
      infinitiv: 'abfahren',
      praesens3sg: 'fährt ab',
      praeteritum: 'fuhr ab',
      partizip2: 'ist abgefahren',
    });
  });

  it('the template has the Präsens er/sie/es column', () => {
    expect(templateTable()[0]).toContain('praesens3sg');
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

describe('word sets in import', () => {
  const setNamesOf = async (text: string) => {
    const concept = (await conceptRepository.listActive()).find((c) => c.text === text)!;
    const sets = await listWordSets(concept.lang);
    return (concept.setIds ?? []).map((id) => sets.find((s) => s.id === id)?.name).sort();
  };

  it('puts every imported word in the target set, creating it once', async () => {
    const { result } = await importCsv('text,lang\nswallow,en\nchew,en\nApfel,de', 'merge', 'Phim');
    expect(result.createdConcepts).toBe(3);
    expect(await setNamesOf('swallow')).toEqual(['Phim']);
    expect(await setNamesOf('Apfel')).toEqual(['Phim']);
    expect((await listWordSets('en')).map((s) => s.name)).toEqual(['Phim']);
    expect((await listWordSets('de')).map((s) => s.name)).toEqual(['Phim']); // one per language
  });

  it('reads the set column (several sets with ;) and reuses sets by name, ignoring case', async () => {
    await importCsv('text,lang,set\nswallow,en,IT;Phim\nchew,en,it');
    expect(await setNamesOf('swallow')).toEqual(['IT', 'Phim']);
    expect(await setNamesOf('chew')).toEqual(['IT']);
    expect((await listWordSets('en')).map((s) => s.name)).toEqual(['IT', 'Phim']);
  });

  it('puts words in a chosen existing set by id, only those of its language', async () => {
    const field = await createWordSet('en', 'IT field');
    if (!field.ok) throw new Error('setup');
    const table = await readTable(bytes('text,lang\nserver,en\nApfel,de'), 'words.csv');
    const { mapping } = guessMapping(table.rows[0], []);
    const built = buildRows(table.rows, resolveColumns(table.rows[0], mapping), context);
    const groups = planGroups(built.rows, await conceptRepository.listActive());
    await commitImport(groups, {
      fileName: 'w.csv',
      mode: 'breadth',
      duplicateAction: 'merge',
      targetSetId: field.set.id,
    });
    expect(await setNamesOf('server')).toEqual(['IT field']);
    expect(await setNamesOf('Apfel')).toEqual([]);
    // no second "IT field" was created
    expect((await listWordSets('en')).map((x) => x.name)).toEqual(['IT field']);
  });

  it('adds a word that already exists to the set without duplicating it, even when skipping duplicates', async () => {
    await importCsv('text,lang\nball,en');
    const again = await importCsv('text,lang\nball,en', 'skip', 'Phim');
    expect(again.result.addedToSets).toBe(1);
    expect(again.result.skippedDuplicates).toBe(0);
    expect((await conceptRepository.listActive()).filter((c) => c.text === 'ball')).toHaveLength(1);
    expect(await setNamesOf('ball')).toEqual(['Phim']);
    // importing the same file again changes nothing
    const third = await importCsv('text,lang\nball,en', 'skip', 'Phim');
    expect(third.result.addedToSets).toBe(0);
    expect(third.result.skippedDuplicates).toBe(1);
  });

  it('undo restores the sets of a word the import only added to a set', async () => {
    await importCsv('text,lang\nball,en', 'merge', 'IT');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await importCsv('text,lang\nball,en', 'merge', 'Phim');
    expect(await setNamesOf('ball')).toEqual(['IT', 'Phim']);
    expect(await undoImport(second.result.batchId!)).toBe(true);
    expect(await setNamesOf('ball')).toEqual(['IT']);
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
    expect(built.rows.map((r) => r.text)).toEqual(['Apfel', 'gehen', 'swallow', 'war', 'rivalry', 'archenemy']);
    expect(built.rows[5].links).toEqual([{ parent: 'rivalry', type: 'typeOf' }]);
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
    expect((await v2.settings.get('default'))?.schemaVersion).toBe(11);
    expect(await v2.importBatches.count()).toBe(0);
    expect(await v2.syncMeta.count()).toBe(0);
    v2.close();
    await Dexie.delete(name);
  });
});

describe('lessons from the lesson column (M15c)', () => {
  beforeEach(async () => {
    await db.lessons.clear();
  });

  const FILE = [
    'text,lang,lesson,deck',
    'Mutter,de,Family,Goethe A1',
    'Vater,de,Family,Goethe A1',
    'aufstehen,de,Daily activities,Goethe A1',
    'Haus,de,Home,',
  ].join('\n');

  async function lessonNames(setId: string | undefined) {
    const { listLessons } = await import('../lessons');
    return (await listLessons('de', setId)).map((l) => l.name);
  }

  it('makes the lessons in the deck of the word, in file order, and puts the words in them', async () => {
    const { result } = await importCsv(FILE);
    const [deck] = await listWordSets('de');
    expect(await lessonNames(deck.id)).toEqual(['Family', 'Daily activities']);
    expect(await lessonNames(undefined)).toEqual(['Home']); // no deck: General
    expect(result).toMatchObject({ lessonsCreated: 3, lessonsAssigned: 4 });

    const byText = Object.fromEntries((await conceptRepository.listActive()).map((c) => [c.text, c]));
    expect(byText.Mutter.lessonId).toBe(byText.Vater.lessonId);
    expect(byText.Mutter.lessonId).not.toBe(byText.aufstehen.lessonId);
    expect(byText.Mutter.source.lesson).toBe('Family'); // the file's text is kept
  });

  it('importing the same file again does not repeat the lessons', async () => {
    await importCsv(FILE);
    const again = await importCsv(FILE);
    const [deck] = await listWordSets('de');
    expect(await lessonNames(deck.id)).toEqual(['Family', 'Daily activities']);
    expect(again.result.lessonsCreated).toBe(0);
    expect(await db.lessons.count()).toBe(3);
  });

  it('merge fills an empty lesson but keeps a set one; update replaces it; skip leaves it', async () => {
    await importCsv('text,lang,deck\nMutter,de,Goethe A1');
    const [deck] = await listWordSets('de');
    const lessonOfMutter = async () => (await conceptRepository.listActive())[0].lessonId;

    await importCsv('text,lang,deck,lesson\nMutter,de,Goethe A1,Family', 'skip');
    expect(await lessonOfMutter()).toBeUndefined();

    await importCsv('text,lang,deck,lesson\nMutter,de,Goethe A1,Family', 'merge');
    const family = await lessonOfMutter();
    expect(family).toBeDefined();

    await importCsv('text,lang,deck,lesson\nMutter,de,Goethe A1,Travel', 'merge');
    expect(await lessonOfMutter()).toBe(family);

    await importCsv('text,lang,deck,lesson\nMutter,de,Goethe A1,Travel', 'update');
    expect(await lessonOfMutter()).not.toBe(family);
    expect(await lessonNames(deck.id)).toEqual(['Family', 'Travel']);
  });

  it('undoing the import takes away the lessons it made and restores the old lesson', async () => {
    const first = await importCsv('text,lang,deck,lesson\nMutter,de,Goethe A1,Family', 'merge');
    const second = await importCsv('text,lang,deck,lesson\nMutter,de,Goethe A1,Travel\nVater,de,Goethe A1,Travel', 'update');
    const [deck] = await listWordSets('de');
    expect(await lessonNames(deck.id)).toEqual(['Family', 'Travel']);

    expect(await undoImport(second.result.batchId!)).toBe(true);
    expect(await lessonNames(deck.id)).toEqual(['Family']);
    const mutter = (await conceptRepository.listActive()).find((c) => c.text === 'Mutter');
    const familyId = (await db.lessons.filter((l) => l.name === 'Family').toArray())[0].id;
    expect(mutter?.lessonId).toBe(familyId);
    expect((await conceptRepository.listActive()).map((c) => c.text)).toEqual(['Mutter']);
    expect(first.result.lessonsCreated).toBe(1);
  });

  it('the xlsx export writes the lesson name, and the file can be imported again', async () => {
    const { exportTable } = await import('../backup/table');
    await importCsv(FILE);
    const lessons = await db.lessons.toArray();
    const sets = await listWordSets('de');
    const [header, ...rows] = exportTable(await conceptRepository.listActive(), [], sets, lessons);
    const at = header.indexOf('lesson');
    expect(rows.map((r) => r[at]).sort()).toEqual(['Daily activities', 'Family', 'Family', 'Home']);
  });
});

describe('exporting a scope and importing it again (M16b)', () => {
  it('a scope exported to xlsx lands in the right language, deck and lesson in an empty library', async () => {
    const { exportTable } = await import('../backup/table');
    const { conceptsInScope } = await import('../backup/scope');
    const { createLesson, assignLesson, listLessons } = await import('../lessons');
    const { createWordSet, setConceptSets } = await import('../wordsets');
    const { saveQuickWord } = await import('../features/quick-add/actions');
    await db.lessons.clear();

    const a1 = await createWordSet('de', 'Goethe A1');
    const a2 = await createWordSet('de', 'Goethe A2');
    if (!a1.ok || !a2.ok) throw new Error('decks');
    const family = await createLesson('de', a1.set.id, 'Family');
    const home = await createLesson('de', a2.set.id, 'Home');
    if (!family.ok || !home.ok) throw new Error('lessons');
    const make = async (text: string, decks: string[], lessonId?: string) => {
      const c = (await saveQuickWord('dict-de', 'de', text)).concept;
      await setConceptSets(c.id, decks);
      if (lessonId) await assignLesson(c.id, lessonId);
      return c;
    };
    await make('Mutter', [a1.set.id], family.lesson.id);
    // In both decks; its lesson is the one of the SECOND deck.
    await make('Haus', [a1.set.id, a2.set.id], home.lesson.id);
    await make('Tisch', []);
    await saveQuickWord('dict-en', 'en', 'hello');

    const sets = await listWordSets('de');
    const lessons = await db.lessons.toArray();
    const concepts = await conceptRepository.listActive();
    const examples = await exampleRepository.listActive();
    const inScope = conceptsInScope(concepts, { lang: 'de', deck: a2.set.id }, new Set(sets.map((s) => s.id)));
    expect(inScope.map((c) => c.text)).toEqual(['Haus']);
    const table = exportTable(inScope, examples, sets, lessons);
    // The deck of the lesson comes first in the file.
    const header = table[0];
    expect(table[1][header.indexOf('deck')]).toBe('Goethe A2; Goethe A1');
    expect(table[1][header.indexOf('lesson')]).toBe('Home');

    // A new library: import the file.
    await db.concepts.clear();
    await db.examples.clear();
    await db.wordSets.clear();
    await db.lessons.clear();
    const { mapping } = guessMapping(header, []);
    const built = buildRows(table, resolveColumns(header, mapping), context);
    await commitImport(planGroups(built.rows, []), { fileName: 'scope.xlsx', mode: 'breadth', duplicateAction: 'merge' });

    const [haus] = await conceptRepository.listActive();
    expect(haus.lang).toBe('de');
    const decks = await listWordSets('de');
    expect(decks.map((d) => d.name).sort()).toEqual(['Goethe A1', 'Goethe A2']);
    const a2New = decks.find((d) => d.name === 'Goethe A2')!;
    expect((await listLessons('de', a2New.id)).map((l) => l.name)).toEqual(['Home']);
    expect(haus.lessonId).toBe((await listLessons('de', a2New.id))[0].id);
  });
});

describe('parent + relation columns', () => {
  const CHAIN = [
    'text,lang,parent,relation,example',
    'war,en,,,',
    'rivalry,en,war,association,',
    'archenemy,en,rivalry,typeOf,Batman met his archenemy.',
    'archenemy,en,,,He fought his archenemy.',
  ].join('\n');

  async function idOf(text: string) {
    return (await conceptRepository.listActive()).find((c) => c.text === text)!.id;
  }

  it('understands relation names, never guesses a missing one', () => {
    expect(parseRelation('typeOf')).toBe('typeOf');
    expect(parseRelation(' Type of ')).toBe('typeOf');
    expect(parseRelation('Liên tưởng')).toBe('association');
    expect(parseRelation('')).toBeUndefined();
    expect(parseRelation('friends')).toBeUndefined();
  });

  it('a parent without a relation (or an unknown one) is a row error', async () => {
    const { built } = await importCsv(
      'text,lang,parent,relation\na,en,b,\nc,en,d,friends\ne,en,f;g,typeOf;association;typeOf',
    );
    expect(built.rows).toHaveLength(0);
    expect(built.errors.map((e) => e.message).join(' ')).toContain('thiếu relation');
    expect(built.errors.map((e) => e.message).join(' ')).toContain('không hiểu');
    expect(built.errors.map((e) => e.message).join(' ')).toContain('2 parent nhưng 3 relation');
  });

  it('builds a chain from one file and creates a missing parent blank', async () => {
    const { result } = await importCsv(CHAIN);
    expect(result.linksCreated).toBe(2);
    expect(result.parentsCreated).toBe(0);
    const rivalry = await idOf('rivalry');
    const archenemy = await idOf('archenemy');
    expect((await listNeighbours(archenemy)).parents.map((p) => [p.concept.text, p.link.type])).toEqual([['rivalry', 'typeOf']]);
    expect((await listNeighbours(rivalry)).parents.map((p) => [p.concept.text, p.link.type])).toEqual([['war', 'association']]);

    // A parent that is not in the library nor in the file becomes a blank concept.
    const second = await importCsv('text,lang,parent,relation\ncomrade,en,friend,association');
    expect(second.result.parentsCreated).toBe(1);
    const friend = (await conceptRepository.listActive()).find((c) => c.text === 'friend')!;
    expect(conceptKind(friend)).toBe('concept');
    expect((await exampleRepository.listActive()).filter((e) => e.targetConceptId === friend.id)).toHaveLength(0);
  });

  it('importing again changes nothing, and the undo takes the links away', async () => {
    await importCsv(CHAIN);
    const again = await importCsv(CHAIN);
    expect(again.result.linksCreated).toBe(0);
    expect(again.result.linksChanged).toBe(0);

    await importCsv('text,lang,parent,relation\nloner,en,solo,typeOf');
    const batch = (await getLatestUndoableBatch())!;
    expect(await undoImport(batch.id)).toBe(true);
    const loner = (await db.concepts.toArray()).find((c) => c.text === 'loner')!;
    expect((await db.conceptLinks.where('childId').equals(loner.id).toArray()).every((l) => l.deletedAt !== undefined)).toBe(true);
  });

  it('reports a link that would make a cycle instead of failing the import', async () => {
    await importCsv(CHAIN);
    const { result } = await importCsv('text,lang,parent,relation\nwar,en,archenemy,association');
    expect(result.linksCreated).toBe(0);
    expect(result.linkProblems).toHaveLength(1);
    expect(result.linkProblems[0]).toContain('vòng tròn');
  });

  it('exports parent and relation so the chain survives export then import', async () => {
    await importCsv(CHAIN);
    const { exportTable } = await import('../backup/table');
    const links = await db.conceptLinks.toArray();
    const table = exportTable(await conceptRepository.listActive(), await exampleRepository.listActive(), [], [], links);
    const [header, ...rows] = table;
    const parentCol = header.indexOf('parent');
    const relationCol = header.indexOf('relation');
    const textCol = header.indexOf('text');
    const archRows = rows.filter((r) => r[textCol] === 'archenemy');
    expect(archRows).toHaveLength(2);
    expect(archRows.every((r) => r[parentCol] === 'rivalry' && r[relationCol] === 'typeOf')).toBe(true);
    expect(rows.find((r) => r[textCol] === 'war')![parentCol]).toBe('');

    // Fresh library: the exported table recreates the same links.
    await db.concepts.clear();
    await db.examples.clear();
    await db.conceptLinks.clear();
    const headers = table[0];
    const { mapping } = guessMapping(headers, []);
    const built = buildRows(table, resolveColumns(headers, mapping), context);
    expect(built.errors).toEqual([]);
    const result = await commitImport(planGroups(built.rows, []), { fileName: 'x.csv', mode: 'breadth', duplicateAction: 'merge' });
    expect(result.linksCreated).toBe(2);
  });
});

describe('kind column: concepts without a minimal example', () => {
  const FILE = [
    'text,lang,kind,meaning,deck,parent,relation,example,highlight,tone,mode',
    'Chiến tranh,en,concept,,D,,,,,,',
    'Đối đầu,en,concept,,D,Chiến tranh,association,,,,',
    'archenemy,en,concept,kẻ thù không đội trời chung,D,Đối đầu,association,Batman met his archenemy again.,,Neutral,Written',
    'archenemy,en,concept,,D,Đối đầu,association,He is my sworn enemy.,sworn enemy,Informal,Spoken',
    'plain,en,,,D,,,,,,',
  ].join('\n');

  it('makes a depth concept with no minimal example, and keeps a sentence without the name as an expression', async () => {
    const { built, result } = await importCsv(FILE);
    expect(built.errors).toEqual([]);
    expect(built.warnings).toEqual([]);
    expect(result.linkProblems).toEqual([]);
    expect(result.parentsCreated).toBe(0);

    const concepts = await conceptRepository.listActive();
    const group = concepts.find((c) => c.text === 'Chiến tranh')!;
    const mid = concepts.find((c) => c.text === 'Đối đầu')!;
    const arch = concepts.find((c) => c.text === 'archenemy')!;
    for (const c of [group, mid, arch]) {
      expect(conceptKind(c)).toBe('concept');
      expect(c.mode).toBe('depth');
    }
    const examples = await exampleRepository.listActive();
    expect(examples.filter((e) => e.targetConceptId === group.id)).toHaveLength(0);
    expect(examples.filter((e) => e.targetConceptId === mid.id)).toHaveLength(0);
    const archExamples = examples.filter((e) => e.targetConceptId === arch.id);
    expect(archExamples.map((e) => e.text).sort()).toEqual(['Batman met his archenemy again.', 'He is my sworn enemy.']);
    expect(archExamples.every((e) => !e.isMinimal)).toBe(true);
    // No name in the second sentence: kept as an expression, not sent to the inbox.
    expect(examples.filter((e) => e.targetConceptId === undefined)).toHaveLength(0);

    // Blank kind stays a word with a minimal example (old behaviour).
    const plain = concepts.find((c) => c.text === 'plain')!;
    expect(conceptKind(plain)).toBe('word');
    expect(examples.filter((e) => e.targetConceptId === plain.id)).toHaveLength(1);

    // The chain group > mid > archenemy is made from the file alone.
    expect((await listNeighbours(arch.id)).parents.map((p) => p.concept.text)).toEqual(['Đối đầu']);
    expect((await listNeighbours(mid.id)).parents.map((p) => p.concept.text)).toEqual(['Chiến tranh']);
  });

  it('rejects an unknown kind, and exports kind so it survives a round trip', async () => {
    const bad = await importCsv('text,lang,kind\nx,en,thing');
    expect(bad.built.errors[0].message).toContain('kind');

    await importCsv(FILE);
    const { exportTable } = await import('../backup/table');
    const table = exportTable(await conceptRepository.listActive(), await exampleRepository.listActive(), [], [], await db.conceptLinks.toArray());
    const kindCol = table[0].indexOf('kind');
    const textCol = table[0].indexOf('text');
    expect(table.slice(1).find((r) => r[textCol] === 'Đối đầu')![kindCol]).toBe('concept');
    expect(table.slice(1).find((r) => r[textCol] === 'plain')![kindCol]).toBe('');
  });
});

describe('vocab-import skill output (tools/vocab-import)', () => {
  const files = import.meta.glob('../../tools/vocab-import/skill/vocab-import/**/*.{csv,py}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const pick = (suffix: string) => Object.entries(files).find(([k]) => k.endsWith(suffix))![1];

  it('the script keeps the same columns as importFields (update the script when fields change)', async () => {
    const { importFields } = await import('./fields');
    const py = pick('build_import.py');
    const block = py.slice(py.indexOf('COLUMNS = ['), py.indexOf(']', py.indexOf('COLUMNS = [')));
    const ids = [...block.matchAll(/'([A-Za-z0-9]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(importFields.map((f) => f.id));
  });

  it('its CSV imports cleanly: groups, depth concepts, 3 expressions, no inbox, chain of associations', async () => {
    const csv = pick('mini-import.csv');
    const { built, result } = await importCsv(csv);
    expect(built.errors).toEqual([]);
    expect(built.warnings).toEqual([]);
    expect(result.linkProblems).toEqual([]);
    expect(result.parentsCreated).toBe(0);
    expect(result.inboxExamples).toBe(0);

    const concepts = await conceptRepository.listActive();
    const examples = await exampleRepository.listActive();
    const concepts_ = concepts.filter((c) => conceptKind(c) === 'concept');
    expect(concepts_.map((c) => c.text).sort()).toEqual(
      ['Chiến tranh & xung đột', 'Tranh luận & thuyết phục', 'Đối đầu', 'archenemy', 'debate', 'polar opposite'].sort(),
    );
    expect(concepts_.every((c) => c.mode === 'depth')).toBe(true);
    const byText = (t: string) => concepts.find((c) => c.text === t)!;
    expect(examples.filter((e) => e.targetConceptId === byText('Đối đầu').id && !e.isMinimal)).toHaveLength(0);
    expect(examples.filter((e) => e.targetConceptId === byText('archenemy').id)).toHaveLength(3);
    expect(examples.filter((e) => e.targetConceptId === byText('polar opposite').id)).toHaveLength(2);

    // Each highlighted phrase became a Word (not the ones equal to the concept's own name),
    // in the same deck, with its Vietnamese meaning and its own copy of the sentence.
    expect(result.wordsCreated).toBe(4);
    const words = concepts.filter((c) => conceptKind(c) === 'word');
    expect(words.map((w) => w.text).sort()).toEqual(['implacable foes', 'polar opposites', 'sworn enemy', 'total opposites']);
    expect(byText('sworn enemy').meanings).toEqual(['kẻ thù không đội trời chung']);
    expect(byText('sworn enemy').setIds).toEqual(byText('archenemy').setIds);
    expect(words.every((w) => w.meanings.length === 1)).toBe(true);
    const wordExamples = examples.filter((e) => e.targetConceptId === byText('sworn enemy').id);
    expect(wordExamples.map((e) => e.text)).toEqual(["He's my sworn enemy, the guy I can't stand."]);
    expect(wordExamples[0].highlight).toBeDefined();
    expect(examples.every((e) => e.attributesStatus === 'verified' && !e.isMinimal)).toBe(true);
    expect(byText('archenemy').meanings).toEqual(['kẻ thù không đội trời chung']);

    const parentOf = async (t: string) => (await listNeighbours(byText(t).id)).parents.map((p) => [p.concept.text, p.link.type]);
    expect(await parentOf('archenemy')).toEqual([['Đối đầu', 'association']]);
    expect(await parentOf('Đối đầu')).toEqual([['Chiến tranh & xung đột', 'association']]);
    expect(await parentOf('debate')).toEqual([['Tranh luận & thuyết phục', 'association']]);
  });
});

describe('highlighted phrases become words on import', () => {
  const FILE = [
    'text,lang,kind,meaning,example,highlight,highlightMeaning',
    'archenemy,en,concept,kẻ thù không đội trời chung,He is my sworn enemy.,sworn enemy,kẻ thù không đội trời chung',
    'foe,en,concept,kẻ thù,A sworn enemy attacked.,sworn enemy,',
  ].join('\n');

  it('reuses one word for the same phrase, keeps its meaning, and the undo removes the words too', async () => {
    const { result } = await importCsv(FILE);
    expect(result.wordsCreated).toBe(1);
    const words = (await conceptRepository.listActive()).filter((c) => conceptKind(c) === 'word');
    expect(words).toHaveLength(1);
    expect(words[0].meanings).toEqual(['kẻ thù không đội trời chung']);
    const ex = (await exampleRepository.listActive()).filter((e) => e.targetConceptId === words[0].id);
    expect(ex).toHaveLength(2);

    // Importing again changes nothing.
    const again = await importCsv(FILE);
    expect(again.result.wordsCreated).toBe(0);
    expect((await exampleRepository.listActive()).filter((e) => e.targetConceptId === words[0].id)).toHaveLength(2);

    // Undo the first import's batch (the second made nothing).
    const batch = (await getLatestUndoableBatch())!;
    expect(batch.id).toBe(result.batchId);
    expect(await undoImport(batch.id)).toBe(true);
    expect(await conceptRepository.listActive()).toHaveLength(0);
    expect(await exampleRepository.listActive()).toHaveLength(0);
  });

  it('a word-kind row does not make words from its highlight', async () => {
    const { result } = await importCsv('text,lang,example,highlight\nswallow,en,She swallowed the pill.,swallowed');
    expect(result.wordsCreated).toBe(0);
  });
});
