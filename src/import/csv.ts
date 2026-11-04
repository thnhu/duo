// CSV reading (spec 6.4): comma / semicolon / tab auto-detected, UTF-8 with
// or without BOM, quoted fields with embedded delimiters and newlines.

export type Delimiter = ',' | ';' | '\t';
const DELIMITERS: Delimiter[] = [',', ';', '\t'];

export type TextEncodingChoice = 'auto' | 'utf-8' | 'windows-1252';

export interface DecodedText {
  text: string;
  encoding: 'utf-8' | 'windows-1252';
  // Auto mode: the bytes were not valid UTF-8, so windows-1252 was used.
  fellBack: boolean;
  // Looks like UTF-8 text that was decoded as something else (e.g. "Ã¤"
  // where "ä" was meant) — German letters would be wrong.
  suspectedMojibake: boolean;
}

const MOJIBAKE = /Ã[¤¶¼Ÿ„–œ\u0084\u0096\u009c\u009f]/;

export function decodeText(bytes: ArrayBuffer, choice: TextEncodingChoice = 'auto'): DecodedText {
  let encoding: 'utf-8' | 'windows-1252' = choice === 'windows-1252' ? 'windows-1252' : 'utf-8';
  let fellBack = false;
  let text: string;
  if (encoding === 'utf-8') {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      if (choice === 'utf-8') {
        text = new TextDecoder('utf-8').decode(bytes);
      } else {
        encoding = 'windows-1252';
        fellBack = true;
        text = new TextDecoder('windows-1252').decode(bytes);
      }
    }
  } else {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, encoding, fellBack, suspectedMojibake: MOJIBAKE.test(text) || text.includes('�') };
}

export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += ch;
      }
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
    }
    i++;
  }
  // Last line without trailing newline.
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

// Pick the delimiter that splits the first rows into the most consistent,
// widest table.
export function detectDelimiter(text: string): Delimiter {
  let best: Delimiter = ',';
  let bestScore = -1;
  for (const candidate of DELIMITERS) {
    const sample = parseCsv(text.slice(0, 20000), candidate).slice(0, 10);
    const width = sample[0]?.length ?? 0;
    if (width < 2) continue;
    const consistent = sample.filter((r) => r.length === width).length;
    const score = consistent * 1000 + width;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}
