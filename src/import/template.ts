import { importFields } from './fields';

// Template file (spec A1e): exactly the supported columns plus a few sample
// rows, so PO or an external tool can produce a correctly shaped file.

const SAMPLE_ROWS: Record<string, string>[] = [
  {
    text: 'Apfel',
    lang: 'de',
    pos: 'noun',
    meaning: 'quả táo',
    lesson: 'Lektion 1',
    deck: 'Deutsch A1',
    example: 'Ich esse jeden Tag einen Apfel.',
    gender: 'der',
    plural: 'Äpfel',
  },
  {
    text: 'gehen',
    lang: 'de',
    pos: 'verb',
    meaning: 'đi',
    lesson: 'Lektion 1',
    deck: 'Deutsch A1',
    example: 'Wir gehen heute ins Kino.',
    infinitiv: 'gehen',
    praesens3sg: 'geht',
    praeteritum: 'ging',
    partizip2: 'gegangen',
  },
  {
    text: 'swallow',
    lang: 'en',
    pos: 'verb',
    meaning: 'nuốt',
    lesson: 'Unit 3',
    deck: 'Phim',
    example: 'She swallowed the pill.',
    highlight: 'swallowed',
    tone: 'Neutral',
    mode: 'Neutral',
  },
  // A chain of concepts: "parent" names the concept above, "relation" says how
  // they are linked (association or typeOf). A parent missing from the library is
  // created blank, so these three rows build war - rivalry - archenemy in one go.
  { text: 'war', lang: 'en', kind: 'concept', deck: 'Phim' },
  { text: 'rivalry', lang: 'en', kind: 'concept', deck: 'Phim', parent: 'war', relation: 'association' },
  {
    text: 'archenemy',
    lang: 'en',
    deck: 'Phim',
    parent: 'rivalry',
    relation: 'typeOf',
    example: 'Batman met his archenemy again.',
  },
];

export function templateTable(): string[][] {
  const header = importFields.map((f) => f.id as string);
  return [header, ...SAMPLE_ROWS.map((row) => header.map((id) => row[id] ?? ''))];
}

function csvCell(value: string): string {
  return /[",;\n\r\t]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// UTF-8 with BOM so Excel shows ä/ö/ü/ß correctly when opening the CSV.
export function templateCsv(): string {
  return '﻿' + templateTable().map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export async function templateXlsx(): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/universal');
  const data = templateTable().map((row) => row.map((value) => ({ value })));
  return writeXlsxFile(data).toBlob();
}
