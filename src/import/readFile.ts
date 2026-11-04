import { decodeText, detectDelimiter, parseCsv, type Delimiter, type TextEncodingChoice } from './csv';

// Reads a CSV or XLSX file entirely on the device (spec 3.7, A7: nothing is
// uploaded, the original file is not stored) into a plain table of strings.

export interface ReadOptions {
  encoding?: TextEncodingChoice;
  delimiter?: Delimiter;
  sheet?: string;
}

export interface TableData {
  kind: 'csv' | 'xlsx';
  // rows[0] is the header row.
  rows: string[][];
  delimiter?: Delimiter;
  sheets?: string[];
  sheet?: string;
  encoding?: 'utf-8' | 'windows-1252';
  encodingFellBack?: boolean;
  suspectedMojibake?: boolean;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim().normalize('NFC');
}

function isXlsx(bytes: ArrayBuffer, name: string): boolean {
  // .xlsx is a ZIP container: "PK\x03\x04".
  const head = new Uint8Array(bytes.slice(0, 4));
  const zip = head[0] === 0x50 && head[1] === 0x4b;
  return zip || /\.xlsx$/i.test(name);
}

export async function readTable(
  bytes: ArrayBuffer,
  fileName: string,
  options: ReadOptions = {},
): Promise<TableData> {
  if (isXlsx(bytes, fileName)) {
    // Loaded on demand so the XLSX reader isn't part of the main bundle.
    const { default: readAll, readSheet } = await import('read-excel-file/universal');
    const sheets = (await readAll(bytes)).map((s) => s.sheet);
    const sheet = options.sheet && sheets.includes(options.sheet) ? options.sheet : sheets[0];
    const data = await readSheet(bytes, sheet);
    return {
      kind: 'xlsx',
      rows: data.map((row) => row.map(cellToString)),
      sheets,
      sheet,
    };
  }

  const decoded = decodeText(bytes, options.encoding);
  const delimiter = options.delimiter ?? detectDelimiter(decoded.text);
  return {
    kind: 'csv',
    rows: parseCsv(decoded.text, delimiter).map((row) =>
      row.map((c) => c.trim().normalize('NFC')),
    ),
    delimiter,
    encoding: decoded.encoding,
    encodingFellBack: decoded.fellBack,
    suspectedMojibake: decoded.suspectedMojibake,
  };
}
