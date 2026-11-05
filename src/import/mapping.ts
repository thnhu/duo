import { normalizeSearchText } from '../core/normalize';
import { importMappingRepository } from '../db/repositories';
import { createId } from '../core/id';
import type { ImportMapping } from '../db/types';
import { importFields, type ImportFieldId } from './fields';

// file column header -> field id ('' = column not used). Same shape as the
// stored ImportMapping.columns (spec A1a).
export type ColumnMapping = Record<string, ImportFieldId | ''>;

// Column index per field, resolved from headers + mapping.
export type FieldColumns = Partial<Record<ImportFieldId, number>>;

export interface MappingGuess {
  mapping: ColumnMapping;
  source: 'saved' | 'headers';
  savedName?: string;
}

function fieldForHeader(header: string): ImportFieldId | '' {
  const norm = normalizeSearchText(header);
  if (!norm) return '';
  for (const field of importFields) {
    if (field.aliases.some((alias) => normalizeSearchText(alias) === norm)) return field.id;
  }
  return '';
}

function guessFromHeaders(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<ImportFieldId>();
  for (const header of headers) {
    const field = fieldForHeader(header);
    // A field can be fed by one column only; first match wins.
    if (field && !taken.has(field)) {
      mapping[header] = field;
      taken.add(field);
    } else {
      mapping[header] = '';
    }
  }
  return mapping;
}

// A saved mapping is reused when every column it names is in the file; the
// one that covers the most columns wins. Otherwise guess from header names.
export function guessMapping(headers: string[], saved: ImportMapping[]): MappingGuess {
  const present = new Set(headers);
  let best: ImportMapping | undefined;
  for (const candidate of saved) {
    const names = Object.keys(candidate.columns);
    if (names.length === 0 || !names.every((n) => present.has(n))) continue;
    if (!best || names.length > Object.keys(best.columns).length) best = candidate;
  }
  if (best) {
    const mapping: ColumnMapping = {};
    for (const header of headers) {
      const stored = best.columns[header] as string | undefined;
      // The deck column was briefly called `set`; mappings saved then still work.
      mapping[header] = ((stored === 'set' ? 'deck' : stored) as ImportFieldId) ?? '';
    }
    return { mapping, source: 'saved', savedName: best.name };
  }
  return { mapping: guessFromHeaders(headers), source: 'headers' };
}

export function resolveColumns(headers: string[], mapping: ColumnMapping): FieldColumns {
  const columns: FieldColumns = {};
  headers.forEach((header, index) => {
    const field = mapping[header];
    if (field && columns[field] === undefined) columns[field] = index;
  });
  return columns;
}

export async function listSavedMappings(): Promise<ImportMapping[]> {
  return importMappingRepository.listActive();
}

// Saves (or updates, by name) the mapping so next time it's picked up
// automatically.
export async function saveMapping(
  name: string,
  mapping: ColumnMapping,
  extras: { delimiter?: string; sheet?: string } = {},
): Promise<void> {
  const columns: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (field) columns[header] = field;
  }
  const existing = (await importMappingRepository.listActive()).find((m) => m.name === name);
  if (existing) {
    await importMappingRepository.update(existing.id, { columns, ...extras });
  } else {
    await importMappingRepository.add({
      id: createId(),
      name,
      columns,
      ...extras,
      updatedAt: Date.now(),
    });
  }
}
