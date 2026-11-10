import { describe, expect, it } from 'vitest';
import { guessValueCols, isBlankCell, isGapCell, parseTable, tableCells, tableToText, textToRows } from './table';

// Text copied from the article table of "Wir lernen Deutsch" (printed p. 33).
const PDF = `Singular Plural
maskulin neutral feminin maskulin/neutral/feminin
bestimmter Artikel der das die die
unbestimmter Artikel ein ein eine -----
unbestimmter Artikel/negativ kein kein keine keine`;

describe('parseTable (space separated, as copied from a PDF)', () => {
  it('takes the last N words of a line as cells and the rest as the row label', () => {
    const t = parseTable(PDF, 4);
    expect(t.mode).toBe('space');
    expect(t.groupLines).toEqual(['Singular Plural']);
    expect(t.rows).toEqual([
      ['', 'maskulin', 'neutral', 'feminin', 'maskulin/neutral/feminin'],
      ['bestimmter Artikel', 'der', 'das', 'die', 'die'],
      ['unbestimmter Artikel', 'ein', 'ein', 'eine', '-----'],
      ['unbestimmter Artikel/negativ', 'kein', 'kein', 'keine', 'keine'],
    ]);
  });

  it('guesses N from the header line and changing N rebuilds the grid', () => {
    expect(guessValueCols(PDF)).toBe(4);
    const three = parseTable(PDF, 3);
    // A wrong N moves words into the label: the preview shows it at once.
    expect(three.rows[1]).toEqual(['bestimmter Artikel der', 'das', 'die', 'die']);
    expect(parseTable(PDF, 0).valueCols).toBe(1);
  });

  it('marks placeholder cells as blank and real words as not blank', () => {
    expect(isBlankCell('-----')).toBe(true);
    expect(isBlankCell('-')).toBe(true);
    expect(isBlankCell('')).toBe(true);
    expect(isBlankCell('keine')).toBe(false);
  });

  it('ignores blank lines and CRLF, and gives nothing for an empty paste', () => {
    expect(parseTable('\r\n  \r\n', 2)).toMatchObject({ rows: [], groupLines: [] });
    expect(parseTable('a b c\r\n\r\nd e f\r\n', 2).rows).toEqual([['a', 'b', 'c'], ['d', 'e', 'f']]);
  });
});

describe('parseTable (cells already separated)', () => {
  it('uses tabs pasted from Sheets as they are, keeping the empty corner cell', () => {
    const tsv = '\tmaskulin\tneutral\tfeminin\nbestimmter Artikel\tder\tdas\tdie\nunbestimmter Artikel\tein\tein\teine';
    const t = parseTable(tsv, 99);
    expect(t.mode).toBe('delimited');
    expect(t.rows).toEqual([
      ['', 'maskulin', 'neutral', 'feminin'],
      ['bestimmter Artikel', 'der', 'das', 'die'],
      ['unbestimmter Artikel', 'ein', 'ein', 'eine'],
    ]);
    expect(t.valueCols).toBe(3);
  });

  it('gives the same grid from tabs, pipes and a markdown table', () => {
    const tabs = parseTable('x\tmaskulin\tfeminin\nbestimmter Artikel\tder\tdie', 1);
    const pipes = parseTable('x | maskulin | feminin\nbestimmter Artikel | der | die', 1);
    const markdown = parseTable(
      '| x | maskulin | feminin |\n|---|---|---|\n| bestimmter Artikel | der | die |',
      1,
    );
    expect(pipes.rows).toEqual(tabs.rows);
    expect(markdown.rows).toEqual(tabs.rows);
  });

  it('pads short rows so the grid is rectangular', () => {
    expect(parseTable('a | b | c\nd | e', 1).rows).toEqual([['a', 'b', 'c'], ['d', 'e', '']]);
  });
});

describe('table text', () => {
  it('round-trips through the stored text, even with an empty corner cell and empty cells', () => {
    const rows = [
      ['', 'maskulin', 'feminin'],
      ['bestimmter Artikel', 'der', ''],
      ['unbestimmter Artikel', 'ein', '-----'],
    ];
    const text = tableToText(rows);
    expect(text).toBe('|  | maskulin | feminin |\n| bestimmter Artikel | der |  |\n| unbestimmter Artikel | ein | ----- |');
    expect(textToRows(text)).toEqual(rows);
  });

  it('a stored row made only of dashes is kept, not read as a markdown separator', () => {
    const rows = [['a', 'b'], ['--', '--']];
    expect(textToRows(tableToText(rows))).toEqual(rows);
  });

  it('drops a pipe typed inside a cell so it cannot split the cell', () => {
    expect(textToRows(tableToText([['a|b', 'c']]))).toEqual([['ab', 'c']]);
  });
});

describe('table cells with offsets', () => {
  const rows = [
    ['', 'maskulin', 'feminin'],
    ['bestimmter Artikel', 'der', ''],
    ['unbestimmter Artikel', 'ein', '-----'],
  ];
  const text = tableToText(rows);

  it('agrees with textToRows and points at the exact text of each cell', () => {
    const cells = tableCells(text);
    expect(cells.map((r) => r.map((c) => c.text))).toEqual(textToRows(text));
    for (const row of cells) for (const c of row) expect(text.slice(c.start, c.end)).toBe(c.text);
    expect(text.slice(cells[1][1].start, cells[1][1].end)).toBe('der');
  });

  it('only real words outside the headers can be gaps', () => {
    const cells = tableCells(text);
    const gaps = cells.flat().filter((c) => isGapCell(c, { row: true, col: true })).map((c) => c.text);
    expect(gaps).toEqual(['der', 'ein']);
    // Without the header row and column the labels count too; blanks never do.
    const all = cells.flat().filter((c) => isGapCell(c, { row: false, col: false })).map((c) => c.text);
    expect(all).toEqual(['maskulin', 'feminin', 'bestimmter Artikel', 'der', 'unbestimmter Artikel', 'ein']);
  });
});
