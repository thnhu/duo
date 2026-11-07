import type {
  AttributeValueSets,
  ConceptGrammar,
  ExampleAttributes,
  ExampleHighlight,
  Lang,
} from '../db/types';
import { PART_SEPARATOR } from '../core/highlights';
import { MEANING_SEPARATOR, type ImportFieldId } from './fields';
import type { FieldColumns } from './mapping';

// Turns the raw table + column mapping into validated rows (spec 6.4,
// A1b): row-level errors are reported, nothing is written here.

export interface BuildContext {
  attributeValueSets: AttributeValueSets;
  // Languages that have a dictionary on this device.
  languages: Lang[];
  // Used when the file has no lang column or the cell is empty (A4).
  defaultLang: Lang;
}

export interface ExampleDraft {
  text: string;
  // True when there is no real sentence: the example is just the concept
  // text (spec C4).
  isMinimal: boolean;
  highlight?: ExampleHighlight;
  // Further parts of a split phrase (separable verb): "fahren … ab".
  highlightExtra?: ExampleHighlight[];
  // A sentence whose phrase could not be located: PO highlights by hand in
  // the review step (spec 6.4, `example` column).
  needsHighlight: boolean;
  attributes?: Partial<ExampleAttributes>;
  note?: string;
}

export interface ImportRow {
  // 1-based line in the file; the header is line 1.
  rowNumber: number;
  text: string;
  lang: Lang;
  pos?: string;
  meanings: string[];
  lesson?: string;
  // Decks (word sets) named in the file (`deck` column, several separated by ;).
  setNames: string[];
  grammar?: ConceptGrammar;
  example: ExampleDraft;
}

export interface RowIssue {
  rowNumber: number;
  text?: string;
  message: string;
}

export interface BuildResult {
  rows: ImportRow[];
  errors: RowIssue[];
  warnings: RowIssue[];
  blankRows: number;
}

const ATTRIBUTE_FIELDS = ['tone', 'mode', 'register', 'nuance', 'dialect'] as const;

function clean(value: string | undefined): string {
  return (value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function findInsensitive(haystack: string, needle: string): number {
  if (!needle) return -1;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  // Case folding that changes length would shift offsets; give up then.
  if (h.length !== haystack.length || n.length !== needle.length) return -1;
  return h.indexOf(n);
}

function parseGender(value: string): string | undefined {
  const v = value.toLowerCase();
  if (v === 'der' || v === 'm' || v === 'masc' || v === 'masculine') return 'der';
  if (v === 'die' || v === 'f' || v === 'fem' || v === 'feminine') return 'die';
  if (v === 'das' || v === 'n' || v === 'neut' || v === 'neuter') return 'das';
  return undefined;
}

export function buildRows(
  table: string[][],
  columns: FieldColumns,
  context: BuildContext,
): BuildResult {
  const result: BuildResult = { rows: [], errors: [], warnings: [], blankRows: 0 };

  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    const rowNumber = i + 1;
    const cell = (field: ImportFieldId): string => {
      const index = columns[field];
      return index === undefined ? '' : clean(raw[index]);
    };

    if (raw.every((c) => clean(c) === '')) {
      result.blankRows++;
      continue;
    }

    const text = cell('text');
    if (!text) {
      result.errors.push({ rowNumber, message: 'Thiếu cột text (word/cụm).' });
      continue;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Language.
    let lang: Lang = context.defaultLang;
    const langCell = cell('lang').toLowerCase();
    if (langCell) {
      if ((context.languages as string[]).includes(langCell)) lang = langCell as Lang;
      else errors.push(`Ngôn ngữ "${cell('lang')}" không hợp lệ (có: ${context.languages.join(', ')}).`);
    }

    // TMRND: values must come from the configured sets, never invented.
    const attributes: Partial<ExampleAttributes> = {};
    for (const key of ATTRIBUTE_FIELDS) {
      const value = cell(key);
      if (!value) continue;
      const allowed = context.attributeValueSets[key] as string[];
      const canonical = allowed.find((a) => a.toLowerCase() === value.toLowerCase());
      if (canonical) (attributes as Record<string, string>)[key] = canonical;
      else errors.push(`${key}: "${value}" không thuộc bộ giá trị (${allowed.join(', ')}).`);
    }

    // Grammar (German).
    const grammar: ConceptGrammar = {};
    const genderCell = cell('gender');
    if (genderCell) {
      const gender = parseGender(genderCell);
      if (gender) grammar.gender = gender;
      else errors.push(`gender: "${genderCell}" không hiểu (dùng der/die/das hoặc m/f/n).`);
    }
    if (cell('plural')) grammar.plural = cell('plural');
    const verbForms = {
      infinitiv: cell('infinitiv') || undefined,
      praeteritum: cell('praeteritum') || undefined,
      partizip2: cell('partizip2') || undefined,
    };
    if (verbForms.infinitiv || verbForms.praeteritum || verbForms.partizip2) {
      grammar.verbForms = verbForms;
    }

    if (errors.length > 0) {
      result.errors.push({ rowNumber, text, message: errors.join(' ') });
      continue;
    }

    // Example + highlight.
    const exampleText = cell('example');
    const note = cell('note') || undefined;
    const example: ExampleDraft = {
      text: exampleText || text,
      isMinimal: !exampleText,
      needsHighlight: false,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      note,
    };
    if (exampleText) {
      const highlightCell = cell('highlight');
      let start = -1;
      let length = 0;
      if (highlightCell) {
        // "fahren … ab": a split phrase (separable verb) is several parts,
        // each found after the one before it.
        const pieces = highlightCell.split(PART_SEPARATOR).filter(Boolean);
        if (pieces.length > 1) {
          const found: Array<{ start: number; end: number }> = [];
          let from = 0;
          for (const piece of pieces) {
            const at = findInsensitive(exampleText.slice(from), piece);
            if (at === -1) break;
            found.push({ start: from + at, end: from + at + piece.length });
            from += at + piece.length;
          }
          if (found.length === pieces.length) {
            example.highlight = found[0];
            if (found.length > 1) example.highlightExtra = found.slice(1);
          } else {
            warnings.push(`Đoạn highlight "${highlightCell}" không có trong câu ví dụ theo đúng thứ tự.`);
          }
        } else {
          start = findInsensitive(exampleText, highlightCell);
          length = highlightCell.length;
          if (start === -1) warnings.push(`Đoạn highlight "${highlightCell}" không có trong câu ví dụ.`);
        }
      }
      // A split phrase was already placed above; otherwise fall back to the
      // concept text.
      if (!example.highlight) {
        if (start === -1) {
          start = findInsensitive(exampleText, text);
          length = text.length;
        }
        if (start === -1) {
          example.needsHighlight = true;
          warnings.push('Không tìm thấy cụm cần học trong câu ví dụ — cần tô sáng tay.');
        } else {
          example.highlight = { start, end: start + length };
        }
      }
    }

    for (const message of warnings) result.warnings.push({ rowNumber, text, message });

    result.rows.push({
      rowNumber,
      text,
      lang,
      pos: cell('pos') || undefined,
      meanings: cell('meaning')
        .split(MEANING_SEPARATOR)
        .map((m) => m.trim())
        .filter(Boolean),
      lesson: cell('lesson') || undefined,
      setNames: cell('deck')
        .split(MEANING_SEPARATOR)
        .map((n) => n.trim())
        .filter((n, i, all) => n && all.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i),
      grammar: Object.keys(grammar).length > 0 ? grammar : undefined,
      example,
    });
  }

  return result;
}
