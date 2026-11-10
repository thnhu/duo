import { createId } from '../core/id';
import { normalizeWithMap } from '../core/normalize';
import { defaultLinkTypes } from '../db/defaults';
import { db } from '../db/schema';
import { conceptLinkRepository } from '../db/repositories';
import type { Concept, ConceptLink, ConceptLinkType, Example, ExampleLinkType } from '../db/types';

// Concept -> concept links and the tree view (spec 1.4, M11c).
// Direction is ALWAYS child -> parent ("hello" typeOf "greeting"). Only
// concepts have parents and children; examples never do. The "tree" is only
// a way of looking at these links, it has no table of its own.

export type LinkResult =
  | { ok: true; link: ConceptLink }
  | { ok: false; reason: 'self' | 'cycle' | 'missing' | 'other-dictionary' };

export const LINK_FAILURE_TEXT: Record<Exclude<LinkResult, { ok: true }>['reason'], string> = {
  self: 'Một concept không thể là cha hoặc con của chính nó.',
  cycle: 'Liên kết này tạo vòng tròn (concept cha đang là con cháu của concept con).',
  missing: 'Không tìm thấy concept.',
  'other-dictionary': 'Hai concept phải cùng một bộ từ điển.',
};

interface Graph {
  concepts: Map<string, Concept>;
  links: ConceptLink[];
  childrenOf: Map<string, ConceptLink[]>; // by parentId
  parentsOf: Map<string, ConceptLink[]>; // by childId
}

// Active links between active concepts only: a deleted concept drops out of
// every view without its links having to be cleaned first.
async function loadGraph(): Promise<Graph> {
  const [allConcepts, allLinks] = await Promise.all([db.concepts.toArray(), db.conceptLinks.toArray()]);
  const concepts = new Map(allConcepts.filter((c) => c.deletedAt === undefined).map((c) => [c.id, c]));
  const links = allLinks.filter(
    (l) => l.deletedAt === undefined && concepts.has(l.childId) && concepts.has(l.parentId),
  );
  const childrenOf = new Map<string, ConceptLink[]>();
  const parentsOf = new Map<string, ConceptLink[]>();
  for (const l of links) {
    childrenOf.set(l.parentId, [...(childrenOf.get(l.parentId) ?? []), l]);
    parentsOf.set(l.childId, [...(parentsOf.get(l.childId) ?? []), l]);
  }
  return { concepts, links, childrenOf, parentsOf };
}

// Every concept below `id` (children, their children...), `id` excluded.
// Safe on a graph that already contains a cycle.
function descendantIds(graph: Graph, id: string): Set<string> {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const l of graph.childrenOf.get(current) ?? []) {
      if (!seen.has(l.childId)) {
        seen.add(l.childId);
        queue.push(l.childId);
      }
    }
  }
  seen.delete(id);
  return seen;
}

// Adding child -> parent closes a loop when the parent is already the child
// itself or one of the child's descendants.
function wouldCreateCycle(graph: Graph, childId: string, parentId: string): boolean {
  if (childId === parentId) return true;
  return descendantIds(graph, childId).has(parentId);
}

// One link per ordered pair: linking the same pair again only changes its
// type. The cycle rule applies to both link types.
export async function linkConcepts(
  childId: string,
  parentId: string,
  type: ConceptLinkType = 'typeOf',
): Promise<LinkResult> {
  if (childId === parentId) return { ok: false, reason: 'self' };
  const graph = await loadGraph();
  const child = graph.concepts.get(childId);
  const parent = graph.concepts.get(parentId);
  if (!child || !parent) return { ok: false, reason: 'missing' };
  if (child.dictionaryId !== parent.dictionaryId) return { ok: false, reason: 'other-dictionary' };

  const existing = graph.links.find((l) => l.childId === childId && l.parentId === parentId);
  if (existing) {
    await conceptLinkRepository.update(existing.id, { type });
    return { ok: true, link: { ...existing, type } };
  }
  if (wouldCreateCycle(graph, childId, parentId)) return { ok: false, reason: 'cycle' };

  // Revive a soft-deleted link for the same pair instead of piling up rows.
  const all = await db.conceptLinks.where('childId').equals(childId).toArray();
  const dead = all.find((l) => l.parentId === parentId);
  if (dead) {
    await conceptLinkRepository.update(dead.id, { type, deletedAt: undefined });
    return { ok: true, link: { ...dead, type, deletedAt: undefined } };
  }
  const link: ConceptLink = { id: createId(), childId, parentId, type, updatedAt: Date.now() };
  await conceptLinkRepository.add(link);
  return { ok: true, link };
}

export async function unlinkConcepts(linkId: string): Promise<void> {
  await conceptLinkRepository.softDelete(linkId);
}

// Soft-deleting a concept also soft-deletes the links on either side of it.
export async function deleteLinksOfConceptNode(conceptId: string): Promise<void> {
  const [asChild, asParent] = await Promise.all([
    db.conceptLinks.where('childId').equals(conceptId).toArray(),
    db.conceptLinks.where('parentId').equals(conceptId).toArray(),
  ]);
  await Promise.all(
    [...asChild, ...asParent]
      .filter((l) => l.deletedAt === undefined)
      .map((l) => conceptLinkRepository.softDelete(l.id)),
  );
}

export interface LinkedConcept {
  link: ConceptLink;
  concept: Concept;
}

export interface ConceptNeighbours {
  parents: LinkedConcept[];
  children: LinkedConcept[];
}

export async function listNeighbours(conceptId: string): Promise<ConceptNeighbours> {
  const graph = await loadGraph();
  const byText = (a: LinkedConcept, b: LinkedConcept) => a.concept.text.localeCompare(b.concept.text);
  return {
    parents: (graph.parentsOf.get(conceptId) ?? [])
      .map((link) => ({ link, concept: graph.concepts.get(link.parentId)! }))
      .sort(byText),
    children: (graph.childrenOf.get(conceptId) ?? [])
      .map((link) => ({ link, concept: graph.concepts.get(link.childId)! }))
      .sort(byText),
  };
}

export interface TreeNode {
  concept: Concept;
  // The link from this node up to its parent in the tree (absent at the root).
  link?: ConceptLink;
  children: TreeNode[];
  // True when this node already appears above it on the same path: a loop
  // that sync merged in. The branch stops here instead of repeating forever.
  cyclic?: boolean;
}

// The root with all its descendants, indented by depth. A concept with two
// parents shows up under each of them (it is a graph, not a strict tree).
export async function buildTree(rootId: string): Promise<TreeNode | null> {
  const graph = await loadGraph();
  const root = graph.concepts.get(rootId);
  if (!root) return null;
  const walk = (concept: Concept, link: ConceptLink | undefined, path: Set<string>): TreeNode => {
    if (path.has(concept.id)) return { concept, link, children: [], cyclic: true };
    const next = new Set(path).add(concept.id);
    const children = (graph.childrenOf.get(concept.id) ?? [])
      .map((l) => ({ l, c: graph.concepts.get(l.childId)! }))
      .sort((a, b) => a.c.text.localeCompare(b.c.text))
      .map(({ l, c }) => walk(c, l, next));
    return { concept, link, children };
  };
  return walk(root, undefined, new Set());
}

// Everything that sits above the concept (parents, their parents...), nearest
// first, for the "where does this idea belong" line.
export async function listAncestors(conceptId: string): Promise<Concept[]> {
  const graph = await loadGraph();
  const out: Concept[] = [];
  const seen = new Set<string>([conceptId]);
  let level = [conceptId];
  while (level.length > 0) {
    const next: string[] = [];
    for (const id of level) {
      for (const l of graph.parentsOf.get(id) ?? []) {
        if (seen.has(l.parentId)) continue;
        seen.add(l.parentId);
        out.push(graph.concepts.get(l.parentId)!);
        next.push(l.parentId);
      }
    }
    level = next;
  }
  return out;
}

export interface GroupedExamples {
  // Examples whose own concept (targetConceptId) is this one.
  home: Example[];
  // Examples linked here with an ExampleLink, grouped by link type.
  linked: Array<{ type: ExampleLinkType; examples: Example[] }>;
}

// The "Examples" part of the tree screen. The auto-created minimal example
// only repeats the concept, so it is left out.
export async function listGroupedExamples(conceptId: string): Promise<GroupedExamples> {
  const [home, links] = await Promise.all([
    db.examples.where('targetConceptId').equals(conceptId).toArray(),
    db.exampleLinks.where('conceptId').equals(conceptId).toArray(),
  ]);
  const live = (e: Example | undefined): e is Example => e !== undefined && e.deletedAt === undefined && !e.isMinimal;
  const homeList = home.filter(live).sort((a, b) => a.createdAt - b.createdAt);
  const activeLinks = links.filter((l) => l.deletedAt === undefined);
  const linkedExamples = await db.examples.bulkGet(activeLinks.map((l) => l.exampleId));
  const byType = new Map<ExampleLinkType, Example[]>();
  activeLinks.forEach((l, i) => {
    const e = linkedExamples[i];
    // Already shown as a home example: do not list it twice.
    if (!live(e) || homeList.some((h) => h.id === e.id)) return;
    byType.set(l.type, [...(byType.get(l.type) ?? []), e]);
  });
  // Fixed group order (the PVO order of the link types), never the order
  // rows happen to come out of the database.
  const order = defaultLinkTypes.exampleConcept;
  return {
    home: homeList,
    linked: [...byType.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([type, examples]) => ({
        type,
        examples: examples.sort((a, b) => a.createdAt - b.createdAt),
      })),
  };
}

// ---- Link editor (M12b, rules R1-R4) -------------------------------------

export type PairState =
  | { state: 'none' }
  | { state: 'same'; link: ConceptLink } // child -> parent already linked
  | { state: 'reversed'; link: ConceptLink }; // parent -> child is linked instead

// How the two chosen concepts are linked right now, read as child -> parent.
export async function describePair(childId: string, parentId: string): Promise<PairState> {
  const graph = await loadGraph();
  const same = graph.links.find((l) => l.childId === childId && l.parentId === parentId);
  if (same) return { state: 'same', link: same };
  const reversed = graph.links.find((l) => l.childId === parentId && l.parentId === childId);
  if (reversed) return { state: 'reversed', link: reversed };
  return { state: 'none' };
}

export type SaveLinkResult =
  | { ok: true; action: 'created' | 'changed' | 'removed' | 'unchanged' }
  | { ok: false; reason: 'self' | 'cycle' | 'missing' | 'other-dictionary' }
  // The pair is linked the other way round: the caller asks before reversing.
  | { ok: false; reason: 'reversed'; link: ConceptLink };

// The Save button of the editor. "No link" (type undefined) removes the link.
export async function saveConceptLink(
  childId: string,
  parentId: string,
  type: ConceptLinkType | undefined,
): Promise<SaveLinkResult> {
  const pair = await describePair(childId, parentId);
  if (type === undefined) {
    if (pair.state !== 'same') return { ok: true, action: 'unchanged' };
    await unlinkConcepts(pair.link.id);
    return { ok: true, action: 'removed' };
  }
  if (pair.state === 'reversed') return { ok: false, reason: 'reversed', link: pair.link };
  if (pair.state === 'same' && pair.link.type === type) return { ok: true, action: 'unchanged' };
  const result = await linkConcepts(childId, parentId, type);
  if (!result.ok) return result;
  return { ok: true, action: pair.state === 'same' ? 'changed' : 'created' };
}

// Confirmed "change the direction": drop the old link and write the new one.
// When the new direction is refused (a longer loop), the old link comes back.
export async function reverseConceptLink(
  oldLink: ConceptLink,
  type: ConceptLinkType,
): Promise<SaveLinkResult> {
  await conceptLinkRepository.softDelete(oldLink.id);
  const result = await linkConcepts(oldLink.parentId, oldLink.childId, type);
  if (!result.ok) {
    await conceptLinkRepository.update(oldLink.id, { deletedAt: undefined });
    return result;
  }
  return { ok: true, action: 'changed' };
}

// Picker search: matches the word or any meaning/description, ignoring case
// and diacritics (spec F4). Text matches come first.
export function filterConcepts(concepts: Concept[], query: string, limit = 8): Concept[] {
  const q = normalizeWithMap(query.trim()).text;
  if (!q) return [];
  const scored: Array<{ concept: Concept; score: number }> = [];
  for (const concept of concepts) {
    const text = normalizeWithMap(concept.text).text;
    if (text.startsWith(q)) scored.push({ concept, score: 0 });
    else if (text.includes(q)) scored.push({ concept, score: 1 });
    else if (concept.meanings.some((m) => normalizeWithMap(m).text.includes(q))) scored.push({ concept, score: 2 });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.concept.text.localeCompare(b.concept.text))
    .slice(0, limit)
    .map((s) => s.concept);
}

// ---- Concept association search (R7) --------------------------------------

export const MAX_ASSOCIATION_SELECTION = 10;

export interface AssociationNode {
  concept: Concept;
  selected: boolean;
}

export interface AssociationResult {
  // Selected concepts first (in the order given), then the related ones by name.
  nodes: AssociationNode[];
  // Every active link between two shown concepts, child -> parent.
  links: ConceptLink[];
}

export const MAX_ASSOCIATION_DEPTH = 4;

// "Search Concept Association": from the chosen concepts, every concept linked
// to one of them (either direction), following links `depth` steps outwards
// (1 = only direct neighbours; 2 also shows neighbours of neighbours, so a chain
// like war - confrontation - archemy appears whole). Links between two shown
// concepts are included too, so the picture shows the whole small network.
export async function searchAssociations(selectedIds: string[], depth = 1): Promise<AssociationResult> {
  const graph = await loadGraph();
  const selectedSet = new Set(selectedIds.filter((id) => graph.concepts.has(id)));
  const selected = [...new Set(selectedIds)].filter((id) => selectedSet.has(id));
  const related = new Set<string>();
  const steps = Math.max(1, Math.min(MAX_ASSOCIATION_DEPTH, Math.floor(depth)));
  let frontier = new Set(selectedSet);
  for (let step = 0; step < steps; step++) {
    const next = new Set<string>();
    for (const l of graph.links) {
      for (const [from, to] of [[l.childId, l.parentId], [l.parentId, l.childId]]) {
        if (frontier.has(from) && !selectedSet.has(to) && !related.has(to)) {
          related.add(to);
          next.add(to);
        }
      }
    }
    if (next.size === 0) break;
    frontier = next;
  }
  const shown = new Set([...selected, ...related]);
  return {
    nodes: [
      ...selected.map((id) => ({ concept: graph.concepts.get(id)!, selected: true })),
      ...[...related]
        .map((id) => ({ concept: graph.concepts.get(id)!, selected: false }))
        .sort((a, b) => a.concept.text.localeCompare(b.concept.text)),
    ],
    links: graph.links.filter((l) => shown.has(l.childId) && shown.has(l.parentId)),
  };
}
