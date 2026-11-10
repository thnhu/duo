// Tables (Bản 11, M18b). A grammar table is a passage whose text is cells
// separated by `|` (one row per line), drawn as a grid. This file only turns
// pasted text into rows; it does not read PDFs or guess anything with AI.
//
// What a PDF copy gives: one row per line, cells separated by spaces. A cell is
// one word, but a row label may be several words (`bestimmter Artikel`), so the
// PO says how many value columns N the table has and each line takes its last
// N words as cells; what is left at the start is the row label. A line with
// tabs or `|` (pasted from Sheets/Excel) already has its cells, so it is used
// as it is.

export interface ParsedTable {
  rows: string[][];
  // Lines with fewer than N words in space mode (e.g. `Singular Plural`): a
  // caption, not part of the grid. The PO drops them or edits the header.
  groupLines: string[];
  // The number of value columns used (space mode) or the widest row minus the
  // label column (delimited mode).
  valueCols: number;
  mode: 'space' | 'delimited';
}

// A cell that is a placeholder for "nothing here" (`-----`, `-`, empty): shown,
// never made a gap.
export function isBlankCell(cell: string): boolean {
  return /^[-–—_]*$/u.test(cell.trim());
}

function wordsOf(line: string): string[] {
  return line.split(/\s+/u).filter(Boolean);
}

function cleanLines(raw: string): string[] {
  return raw
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/u, ''))
    .filter((l) => l.trim() !== '');
}

function hasDelimiter(lines: string[]): boolean {
  return lines.some((l) => l.includes('\t') || l.includes('|'));
}

// Pure. A guess of N for pasted space-separated text: the header line has
// the fewest words among lines of 3 or more words (a caption such as
// `Singular Plural` has fewer). Falls back to the shortest line. The PO fixes it
// with the +/- buttons.
export function guessValueCols(raw: string): number {
  const lines = cleanLines(raw);
  if (lines.length === 0 || hasDelimiter(lines)) return 1;
  const counts = lines.map((l) => wordsOf(l).length);
  const big = counts.filter((c) => c >= 3);
  return Math.max(1, big.length > 0 ? Math.min(...big) : Math.min(...counts));
}

function pad(rows: string[][]): string[][] {
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => (r.length === width ? r : [...r, ...Array<string>(width - r.length).fill('')]));
}

// A markdown separator row (`---|---`): not content.
function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/u.test(c.trim()) || c.trim() === '');
}

function splitDelimited(lines: string[], dropSeparator: boolean): string[][] {
  const tabs = lines.some((l) => l.includes('\t'));
  const rows: string[][] = [];
  for (const line of lines) {
    let cells: string[];
    if (tabs) {
      cells = line.split('\t').map((c) => c.trim());
    } else {
      let body = line.trim();
      if (body.startsWith('|')) body = body.slice(1);
      if (body.endsWith('|')) body = body.slice(0, -1);
      cells = body.split('|').map((c) => c.trim());
    }
    if (dropSeparator && !tabs && isSeparatorRow(cells) && cells.some((c) => c.trim() !== '')) continue;
    rows.push(cells);
  }
  return pad(rows);
}

// Pure. Pasted text to rows. `valueCols` is N for space-separated text (ignored
// when the text already has tabs or `|`). Row 0 of a table with column headers
// has an empty first cell.
export function parseTable(raw: string, valueCols: number): ParsedTable {
  const lines = cleanLines(raw);
  if (lines.length === 0) return { rows: [], groupLines: [], valueCols: Math.max(1, valueCols), mode: 'space' };
  if (hasDelimiter(lines)) {
    const rows = splitDelimited(lines, true);
    const width = rows[0]?.length ?? 1;
    return { rows, groupLines: [], valueCols: Math.max(1, width - 1), mode: 'delimited' };
  }
  const n = Math.max(1, Math.floor(valueCols));
  const rows: string[][] = [];
  const groupLines: string[] = [];
  for (const line of lines) {
    const words = wordsOf(line);
    if (words.length < n) {
      groupLines.push(line.trim());
    } else {
      rows.push([words.slice(0, words.length - n).join(' '), ...words.slice(words.length - n)]);
    }
  }
  return { rows, groupLines, valueCols: n, mode: 'space' };
}

// Pure. The rows as the text a table passage stores: `| a | b |`, one row per
// line (the outer pipes keep an empty corner cell from being lost). Spaces
// inside a cell are kept; a `|` typed in a cell is dropped because it would
// split the cell.
export function tableToText(rows: string[][]): string {
  return rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, '').trim()).join(' | ')} |`).join('\n');
}

// Pure. The stored text of a table passage back into rows (what the grid
// draws). Only `|` splits cells here; a stored table never has tabs.
export function textToRows(text: string): string[][] {
  return splitDelimited(cleanLines(text.replace(/\t/g, ' ')), false);
}

// A cell of a stored table with where its text sits in the passage text, so a
// gap (a `start`/`end` on the text) can be a whole cell.
export interface TableCell {
  row: number;
  col: number;
  // The trimmed content of the cell; an empty cell has start === end.
  start: number;
  end: number;
  text: string;
}

// Pure. The cells of a stored table (`| a | b |` per line) with their offsets.
// Rows and columns are numbered like `textToRows`, which it agrees with.
export function tableCells(text: string): TableCell[][] {
  const rows: TableCell[][] = [];
  let lineStart = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const offset = lineStart;
    lineStart += rawLine.length + 1;
    if (line.trim() === '') continue;
    // Cut at every pipe; the pipe at either end only frames the row.
    const bounds: Array<[number, number]> = [];
    let from = 0;
    for (let i = 0; i <= line.length; i++) {
      if (i === line.length || line[i] === '|') {
        bounds.push([from, i]);
        from = i + 1;
      }
    }
    if (line.trimStart().startsWith('|')) bounds.shift();
    if (line.trimEnd().endsWith('|')) bounds.pop();
    const row = rows.length;
    rows.push(
      bounds.map(([a, b], col) => {
        const piece = line.slice(a, b);
        const lead = piece.length - piece.trimStart().length;
        const content = piece.trim();
        const start = offset + a + (content === '' ? 0 : lead);
        return { row, col, start, end: start + content.length, text: content };
      }),
    );
  }
  return rows;
}

// Pure. Whether a cell can be made a gap: it has a word, and it is not part of
// a header row or column.
export function isGapCell(cell: TableCell, headers: { row: boolean; col: boolean } | undefined): boolean {
  const h = headers ?? { row: true, col: true };
  if (isBlankCell(cell.text)) return false;
  return !(h.row && cell.row === 0) && !(h.col && cell.col === 0);
}
