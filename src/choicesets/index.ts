import { createId } from '../core/id';
import { choiceSetRepository } from '../db/repositories';
import type { ChoiceSet, Lang } from '../db/types';
import type { Selection } from '../features/quick-add/highlight';

// Answer tiles (Bản 10, M17b). A ChoiceSet is a named list the PO makes
// ("Bestimmter Artikel": der das die den dem des). A grammar passage is
// answered by tapping these tiles; the set is data, never hard-coded.

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const key = (s: string) => s.trim().toLowerCase();
const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

// Pure. Tiles typed as one text (commas, semicolons, new lines or spaces
// between them): trimmed, empty ones dropped, repeats (ignoring case) dropped,
// the order kept.
export function parseItems(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n\t ]+/u)) {
    const item = part.trim();
    if (!item || seen.has(key(item))) continue;
    seen.add(key(item));
    out.push(item);
  }
  return out;
}

// Pure. Every whole word of the text that is one of the tiles becomes a gap
// (ignoring case), so one tap makes all the gaps of an article drill.
export function autoGaps(text: string, items: string[]): Selection[] {
  const wanted = new Set(items.map(key));
  const gaps: Selection[] = [];
  for (const m of text.matchAll(WORD)) {
    if (wanted.has(key(m[0]))) gaps.push({ start: m.index!, end: m.index! + m[0].length });
  }
  return gaps;
}

// Pure. The answers of these gaps that are not among the tiles (lower-case,
// each once, in reading order): the PO is asked to add them, or the drill
// could not be answered.
export function missingFromSet(text: string, gaps: Selection[], items: string[]): string[] {
  const have = new Set(items.map(key));
  const missing: string[] = [];
  for (const g of [...gaps].sort((a, b) => a.start - b.start)) {
    const answer = key(text.slice(g.start, g.end));
    if (answer && !have.has(answer) && !missing.includes(answer)) missing.push(answer);
  }
  return missing;
}

export type ChoiceSetResult =
  | { ok: true; set: ChoiceSet }
  | { ok: false; reason: 'empty' | 'no-items' | 'duplicate' | 'missing' };

export async function listChoiceSets(lang: Lang): Promise<ChoiceSet[]> {
  const all = await choiceSetRepository.listActive();
  return all.filter((s) => s.lang === lang).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createChoiceSet(lang: Lang, name: string, items: string[]): Promise<ChoiceSetResult> {
  const trimmed = cleanName(name);
  if (!trimmed) return { ok: false, reason: 'empty' };
  const tiles = parseItems(items.join('\n'));
  if (tiles.length === 0) return { ok: false, reason: 'no-items' };
  if ((await listChoiceSets(lang)).some((s) => key(s.name) === key(trimmed))) return { ok: false, reason: 'duplicate' };
  const set: ChoiceSet = { id: createId(), lang, name: trimmed, items: tiles, updatedAt: Date.now() };
  await choiceSetRepository.add(set);
  return { ok: true, set };
}

export async function updateChoiceSet(
  id: string,
  patch: { name?: string; items?: string[] },
): Promise<ChoiceSetResult> {
  const current = await choiceSetRepository.getById(id);
  if (!current || current.deletedAt !== undefined) return { ok: false, reason: 'missing' };
  const next: Partial<ChoiceSet> = {};
  if (patch.name !== undefined) {
    const trimmed = cleanName(patch.name);
    if (!trimmed) return { ok: false, reason: 'empty' };
    const clash = (await listChoiceSets(current.lang)).some((s) => s.id !== id && key(s.name) === key(trimmed));
    if (clash) return { ok: false, reason: 'duplicate' };
    next.name = trimmed;
  }
  if (patch.items !== undefined) {
    const tiles = parseItems(patch.items.join('\n'));
    if (tiles.length === 0) return { ok: false, reason: 'no-items' };
    next.items = tiles;
  }
  await choiceSetRepository.update(id, next);
  return { ok: true, set: { ...current, ...next } };
}

// Adds tiles at the end (those already there are skipped).
export async function addItemsToSet(id: string, extra: string[]): Promise<ChoiceSetResult> {
  const current = await choiceSetRepository.getById(id);
  if (!current || current.deletedAt !== undefined) return { ok: false, reason: 'missing' };
  return updateChoiceSet(id, { items: [...current.items, ...extra] });
}

// Soft delete: passages keep their id, but a deleted set no longer answers them.
export async function deleteChoiceSet(id: string): Promise<void> {
  await choiceSetRepository.softDelete(id);
}

export async function restoreChoiceSet(id: string): Promise<void> {
  await choiceSetRepository.update(id, { deletedAt: undefined });
}
