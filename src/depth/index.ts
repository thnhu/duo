import { createId } from '../core/id';
import { createDefaultAttributes, SETTINGS_ID } from '../db/defaults';
import { db } from '../db/schema';
import {
  conceptRepository,
  exampleLinkRepository,
  exampleRepository,
  settingsRepository,
} from '../db/repositories';
import type {
  Concept,
  DepthSettings,
  Example,
  ExampleAttributes,
  ExampleLink,
  ExampleLinkType,
} from '../db/types';
import { getVerifiedAttributes } from '../db/attributes';

// Depth mode (spec 1.4, M11a). A depth concept is an IDEA ("số lượng nhiều");
// its examples are the different ways of saying it, each with its own TMRND
// labels. Tri-fold: learn at least N ways that differ in some label.

export const MIN_EXPRESSIONS_RANGE = { min: 2, max: 10 };
export const defaultDepthSettings: DepthSettings = { minExpressions: 3 };

export function sanitizeDepth(value: Partial<DepthSettings> | undefined): DepthSettings {
  const n = value?.minExpressions;
  const ok =
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= MIN_EXPRESSIONS_RANGE.min &&
    n <= MIN_EXPRESSIONS_RANGE.max;
  return { minExpressions: ok ? n : defaultDepthSettings.minExpressions };
}

export async function loadDepthSettings(): Promise<DepthSettings> {
  const settings = await settingsRepository.getById(SETTINGS_ID);
  return sanitizeDepth(settings?.depth);
}

export async function saveDepthSettings(depth: DepthSettings): Promise<void> {
  await settingsRepository.update(SETTINGS_ID, { depth: sanitizeDepth(depth) });
}

// The idea itself: a name (free text) and a Vietnamese description (stored in
// `meanings[0]`, like HUST PVO's Description box). English only for now.
export async function createDepthConcept(
  dictionaryId: string,
  name: string,
  description: string,
): Promise<Concept> {
  const now = Date.now();
  const concept: Concept = {
    id: createId(),
    dictionaryId,
    lang: 'en',
    text: name.trim(),
    meanings: description.trim() ? [description.trim()] : [],
    mode: 'depth',
    verification: 'verified', // PO wrote it themself
    source: { type: 'quick-add' },
    status: 'loaded',
    createdAt: now,
    updatedAt: now,
  };
  await conceptRepository.add(concept);
  return concept;
}

// One way of saying the concept. Its home concept is this one
// (`targetConceptId`), no highlight: the whole text IS the expression.
export async function addExpression(concept: Concept, text: string): Promise<Example> {
  const now = Date.now();
  const example: Example = {
    id: createId(),
    dictionaryId: concept.dictionaryId,
    text: text.trim(),
    targetConceptId: concept.id,
    attributes: createDefaultAttributes(),
    attributesStatus: 'empty',
    verification: 'unverified',
    createdAt: now,
    updatedAt: now,
  };
  await exampleRepository.add(example);
  return example;
}

export async function listLinksOfExample(exampleId: string): Promise<ExampleLink[]> {
  const links = await db.exampleLinks.where('exampleId').equals(exampleId).toArray();
  return links.filter((l) => l.deletedAt === undefined);
}

// Adds (or revives / retypes) the extra link example -> concept. Linking an
// example to its own home concept is pointless and refused.
export async function linkExample(
  exampleId: string,
  conceptId: string,
  type: ExampleLinkType = 'otherPhrase',
): Promise<ExampleLink | null> {
  const example = await exampleRepository.getById(exampleId);
  if (!example || example.deletedAt !== undefined) return null;
  if (example.targetConceptId === conceptId) return null;
  const all = await db.exampleLinks.where('exampleId').equals(exampleId).toArray();
  const existing = all.find((l) => l.conceptId === conceptId);
  if (existing) {
    await exampleLinkRepository.update(existing.id, { type, deletedAt: undefined });
    return (await exampleLinkRepository.getById(existing.id)) ?? null;
  }
  const link: ExampleLink = { id: createId(), exampleId, conceptId, type, updatedAt: Date.now() };
  await exampleLinkRepository.add(link);
  return link;
}

export async function unlinkExample(linkId: string): Promise<void> {
  await exampleLinkRepository.softDelete(linkId);
}

// Ways of saying the concept: examples whose home is the concept, plus
// examples linked to it. Deleted rows and a deleted example are skipped.
export async function listExpressions(conceptId: string): Promise<Example[]> {
  const [home, links] = await Promise.all([
    db.examples.where('targetConceptId').equals(conceptId).toArray(),
    db.exampleLinks.where('conceptId').equals(conceptId).toArray(),
  ]);
  const linkedIds = links.filter((l) => l.deletedAt === undefined).map((l) => l.exampleId);
  const linked = (await db.examples.bulkGet(linkedIds)).filter((e): e is Example => e !== undefined);
  const byId = new Map<string, Example>();
  for (const e of [...home, ...linked]) if (e.deletedAt === undefined) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

const KEYS: Array<keyof ExampleAttributes> = ['tone', 'mode', 'register', 'nuance', 'dialect'];
const combo = (a: ExampleAttributes): string => KEYS.map((k) => a[k]).join('|');

export interface TriFoldProgress {
  // Different label combinations among labelled (`verified`) expressions.
  distinct: number;
  needed: number;
  complete: boolean;
  // Expressions that do not count yet, with the reason.
  unlabelled: Example[]; // no verified labels
  duplicates: Example[]; // same labels as an earlier expression
}

// Pure. Only `verified` labels count (suggested/empty never do); two
// expressions with identical labels are one "way" for this purpose.
export function triFoldProgress(expressions: Example[], needed: number): TriFoldProgress {
  const seen = new Set<string>();
  const unlabelled: Example[] = [];
  const duplicates: Example[] = [];
  for (const e of expressions) {
    const attrs = getVerifiedAttributes(e);
    if (!attrs) {
      unlabelled.push(e);
      continue;
    }
    const key = combo(attrs);
    if (seen.has(key)) duplicates.push(e);
    else seen.add(key);
  }
  return { distinct: seen.size, needed, complete: seen.size >= needed, unlabelled, duplicates };
}

export interface ExpressionGroup {
  // The attribute value shared by the group; null = not labelled yet.
  value: string | null;
  expressions: Example[];
}

// Pure. Groups expressions by one TMRND attribute (e.g. all the Informal
// ways together), in the order of the configured value set; values missing
// from it come after, and unlabelled expressions (no verified labels, so no
// trustworthy value) come last.
export function groupExpressions(
  expressions: Example[],
  key: keyof ExampleAttributes,
  order: string[],
): ExpressionGroup[] {
  const byValue = new Map<string, Example[]>();
  const unlabelled: Example[] = [];
  for (const e of expressions) {
    const attrs = getVerifiedAttributes(e);
    if (!attrs) {
      unlabelled.push(e);
      continue;
    }
    const value = attrs[key] as string;
    byValue.set(value, [...(byValue.get(value) ?? []), e]);
  }
  const known = order.filter((v) => byValue.has(v));
  const extra = [...byValue.keys()].filter((v) => !order.includes(v));
  const groups: ExpressionGroup[] = [...known, ...extra].map((value) => ({
    value,
    expressions: byValue.get(value)!,
  }));
  if (unlabelled.length > 0) groups.push({ value: null, expressions: unlabelled });
  return groups;
}

// Soft-deleting a concept also soft-deletes the extra links pointing to it.
export async function deleteLinksOfConcept(conceptId: string): Promise<void> {
  const links = await db.exampleLinks.where('conceptId').equals(conceptId).toArray();
  await Promise.all(
    links.filter((l) => l.deletedAt === undefined).map((l) => exampleLinkRepository.softDelete(l.id)),
  );
}

export async function deleteLinksOfExample(exampleId: string): Promise<void> {
  const links = await listLinksOfExample(exampleId);
  await Promise.all(links.map((l) => exampleLinkRepository.softDelete(l.id)));
}
