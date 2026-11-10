import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { conceptLinkRepository } from '../db/repositories';
import { createDepthConcept, addExpression as addExpressionRaw, linkExample } from '../depth';
import { deleteConceptCascade } from '../features/library/actions';
import {
  buildTree,
  describePair,
  filterConcepts,
  linkConcepts,
  listAncestors,
  listGroupedExamples,
  listNeighbours,
  reverseConceptLink,
  saveConceptLink,
  searchAssociations,
  unlinkConcepts,
  type PairState,
  type TreeNode,
} from './index';
import { layoutGraph } from './graph';

const DICT = 'dict-en';
const make = (name: string) => createDepthConcept(DICT, name, '');

// Ordered by createdAt: avoid same-millisecond ties (flaky on fast CI).
const addExpression: typeof addExpressionRaw = async (concept, text) => {
  const example = await addExpressionRaw(concept, text);
  await new Promise((resolve) => setTimeout(resolve, 3));
  return example;
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('linking concepts (child -> parent)', () => {
  it('stores the direction child -> parent and lists neighbours both ways', async () => {
    const greeting = await make('greeting');
    const hello = await make('hello');
    const r = await linkConcepts(hello.id, greeting.id, 'typeOf');
    expect(r.ok && r.link).toMatchObject({ childId: hello.id, parentId: greeting.id, type: 'typeOf' });
    expect((await listNeighbours(hello.id)).parents.map((p) => p.concept.text)).toEqual(['greeting']);
    expect((await listNeighbours(greeting.id)).children.map((p) => p.concept.text)).toEqual(['hello']);
    expect((await listNeighbours(hello.id)).children).toEqual([]);
  });

  it('allows A -> B -> C and blocks C -> A (the M11c acceptance test)', async () => {
    const a = await make('A');
    const b = await make('B');
    const c = await make('C');
    expect((await linkConcepts(a.id, b.id)).ok).toBe(true); // A is a child of B
    expect((await linkConcepts(b.id, c.id)).ok).toBe(true); // B is a child of C
    const closing = await linkConcepts(c.id, a.id); // C child of A: a loop
    expect(closing).toEqual({ ok: false, reason: 'cycle' });
    expect(await db.conceptLinks.count()).toBe(2);
  });

  it('blocks the direct reverse and a self link, for both link types', async () => {
    const a = await make('A');
    const b = await make('B');
    await linkConcepts(a.id, b.id, 'association');
    expect(await linkConcepts(b.id, a.id, 'typeOf')).toEqual({ ok: false, reason: 'cycle' });
    expect(await linkConcepts(a.id, a.id)).toEqual({ ok: false, reason: 'self' });
  });

  it('allows a concept with two parents (a graph, not a strict tree)', async () => {
    const x = await make('x');
    const p1 = await make('p1');
    const p2 = await make('p2');
    expect((await linkConcepts(x.id, p1.id)).ok).toBe(true);
    expect((await linkConcepts(x.id, p2.id)).ok).toBe(true);
    expect((await listNeighbours(x.id)).parents).toHaveLength(2);
  });

  it('relinking the same pair only changes its type; unlink then relink revives it', async () => {
    const a = await make('A');
    const b = await make('B');
    await linkConcepts(a.id, b.id, 'association');
    await linkConcepts(a.id, b.id, 'typeOf');
    expect(await db.conceptLinks.count()).toBe(1);
    expect((await listNeighbours(a.id)).parents[0].link.type).toBe('typeOf');
    await unlinkConcepts((await listNeighbours(a.id)).parents[0].link.id);
    expect((await listNeighbours(a.id)).parents).toHaveLength(0);
    // After unlinking, the opposite direction is fine again.
    expect((await linkConcepts(b.id, a.id)).ok).toBe(true);
    await unlinkConcepts((await listNeighbours(b.id)).parents[0].link.id);
    expect((await linkConcepts(a.id, b.id)).ok).toBe(true);
    expect(await db.conceptLinks.count()).toBe(2);
  });

  it('refuses a missing concept and concepts of different dictionaries', async () => {
    const a = await make('A');
    expect(await linkConcepts(a.id, 'nope')).toEqual({ ok: false, reason: 'missing' });
    const german = await createDepthConcept('dict-de', 'Gruß', '');
    expect(await linkConcepts(a.id, german.id)).toEqual({ ok: false, reason: 'other-dictionary' });
  });

  it('deleting a concept soft-deletes its links on both sides', async () => {
    const parent = await make('parent');
    const mid = await make('mid');
    const leaf = await make('leaf');
    await linkConcepts(mid.id, parent.id);
    await linkConcepts(leaf.id, mid.id);
    await deleteConceptCascade(mid.id);
    expect((await listNeighbours(parent.id)).children).toHaveLength(0);
    expect((await listNeighbours(leaf.id)).parents).toHaveLength(0);
    expect(await db.conceptLinks.filter((l) => l.deletedAt !== undefined).count()).toBe(2);
  });
});

describe('tree view', () => {
  it('indents descendants and shows a concept under each of its parents', async () => {
    const root = await make('quantity');
    const many = await make('many');
    const few = await make('few');
    const lots = await make('lots');
    await linkConcepts(many.id, root.id);
    await linkConcepts(few.id, root.id);
    await linkConcepts(lots.id, many.id);
    await linkConcepts(lots.id, few.id); // a second parent
    const tree = (await buildTree(root.id))!;
    const shape = (n: TreeNode): unknown => [n.concept.text, n.children.map(shape)];
    expect(shape(tree)).toEqual(['quantity', [['few', [['lots', []]]], ['many', [['lots', []]]]]]);
    expect((await listAncestors(lots.id)).map((c) => c.text).sort()).toEqual(['few', 'many', 'quantity']);
  });

  it('survives a loop that sync merged in (no infinite recursion)', async () => {
    const a = await make('A');
    const b = await make('B');
    await linkConcepts(a.id, b.id);
    // Written behind the rule's back, as two devices' edits could be merged.
    await conceptLinkRepository.add({ id: 'bad', childId: b.id, parentId: a.id, type: 'typeOf', updatedAt: 1 });
    const tree = (await buildTree(b.id))!;
    expect(tree.children[0].concept.text).toBe('A');
    expect(tree.children[0].children[0]).toMatchObject({ cyclic: true, children: [] });
    expect((await listAncestors(a.id)).length).toBeLessThan(3);
  });

  it('groups examples: own examples first, linked ones by link type', async () => {
    const hello = await make('hello');
    const greeting = await make('greeting');
    const own = await addExpression(hello, 'hello there');
    const phrase = await addExpression(greeting, 'how do you do');
    await linkExample(phrase.id, hello.id, 'otherPhrase');
    const idiom = await addExpression(greeting, 'hit the road');
    await linkExample(idiom.id, hello.id, 'idiom');
    const grouped = await listGroupedExamples(hello.id);
    expect(grouped.home.map((e) => e.id)).toEqual([own.id]);
    // Group order is fixed (PVO order of link types), whatever order they were added in.
    expect(grouped.linked.map((g) => [g.type, g.examples.map((e) => e.text)])).toEqual([
      ['idiom', ['hit the road']],
      ['otherPhrase', ['how do you do']],
    ]);
  });
});

describe('link editor (M12b)', () => {
  it('saves, changes type and removes with "No link"', async () => {
    const color = await make('color');
    const blue = await make('blue');
    expect(await saveConceptLink(blue.id, color.id, 'typeOf')).toEqual({ ok: true, action: 'created' });
    expect(await saveConceptLink(blue.id, color.id, 'typeOf')).toEqual({ ok: true, action: 'unchanged' });
    expect(await saveConceptLink(blue.id, color.id, 'association')).toEqual({ ok: true, action: 'changed' });
    expect((await describePair(blue.id, color.id)).state).toBe('same');
    expect(await saveConceptLink(blue.id, color.id, undefined)).toEqual({ ok: true, action: 'removed' });
    expect((await describePair(blue.id, color.id)).state).toBe('none');
    expect(await saveConceptLink(blue.id, color.id, undefined)).toEqual({ ok: true, action: 'unchanged' });
  });

  it('asks before reversing a linked pair and reverses on confirm', async () => {
    const color = await make('color');
    const blue = await make('blue');
    await linkConcepts(blue.id, color.id, 'typeOf');
    const r = await saveConceptLink(color.id, blue.id, 'typeOf');
    expect(r.ok === false && r.reason).toBe('reversed');
    if (r.ok || r.reason !== 'reversed') return;
    expect(await reverseConceptLink(r.link, 'association')).toEqual({ ok: true, action: 'changed' });
    expect((await listNeighbours(color.id)).parents.map((p) => p.concept.text)).toEqual(['blue']);
    expect((await listNeighbours(blue.id)).parents).toEqual([]);
  });

  it('keeps the old link when the reversed direction would make a longer loop', async () => {
    const a = await make('a');
    const b = await make('b');
    const c = await make('c');
    await linkConcepts(b.id, a.id); // b -> a
    await linkConcepts(c.id, b.id); // c -> b -> a
    await linkConcepts(c.id, a.id); // c -> a as well
    // reversing c -> a into a -> c closes a -> c -> b -> a
    const old = (await describePair(c.id, a.id)) as Extract<PairState, { state: 'same' }>;
    const r = await reverseConceptLink(old.link, 'typeOf');
    expect(r.ok === false && r.reason).toBe('cycle');
    expect((await describePair(c.id, a.id)).state).toBe('same');
  });

  it('filters by word or description, ignoring diacritics', async () => {
    const q = await createDepthConcept(DICT, 'large quantity', 'số lượng nhiều');
    const other = await make('bunch');
    const hits = filterConcepts([q, other], 'so luong');
    expect(hits.map((c) => c.text)).toEqual(['large quantity']);
    expect(filterConcepts([q, other], 'bun').map((c) => c.text)).toEqual(['bunch']);
    expect(filterConcepts([q, other], '  ')).toEqual([]);
  });
});

describe('association search (R7)', () => {
  it('finds concepts linked to the selection in either direction, one step', async () => {
    const color = await make('color');
    const blue = await make('blue');
    const navy = await make('navy');
    const paint = await make('paint');
    const far = await make('far');
    await linkConcepts(blue.id, color.id, 'typeOf'); // blue -> color
    await linkConcepts(navy.id, blue.id, 'typeOf'); // navy -> blue
    await linkConcepts(color.id, paint.id, 'association'); // color -> paint
    await linkConcepts(far.id, paint.id, 'association'); // far -> paint (two steps from blue)

    const r = await searchAssociations([blue.id]);
    expect(r.nodes.map((n) => [n.concept.text, n.selected])).toEqual([
      ['blue', true],
      ['color', false],
      ['navy', false],
    ]);
    expect(r.links.map((l) => `${l.childId === blue.id ? 'blue' : 'navy'}>${l.parentId === color.id ? 'color' : 'blue'}`).sort()).toEqual([
      'blue>color',
      'navy>blue',
    ]);

    const two = await searchAssociations([blue.id, paint.id]);
    expect(two.nodes.filter((n) => n.selected).map((n) => n.concept.text)).toEqual(['blue', 'paint']);
    // color is related to both; the link color -> paint joins two shown nodes.
    expect(two.links).toHaveLength(4);
    expect((await searchAssociations([])).nodes).toEqual([]);
  });

  it('follows links several steps when asked (a whole chain shows up)', async () => {
    const war = await make('war');
    const rivalry = await make('rivalry');
    const archenemy = await make('archenemy');
    const unrelated = await make('unrelated');
    await linkConcepts(rivalry.id, war.id, 'association'); // rivalry -> war
    await linkConcepts(archenemy.id, rivalry.id, 'typeOf'); // archenemy -> rivalry

    const one = await searchAssociations([archenemy.id], 1);
    expect(one.nodes.map((n) => n.concept.text)).toEqual(['archenemy', 'rivalry']);
    const two = await searchAssociations([archenemy.id], 2);
    expect(two.nodes.map((n) => n.concept.text)).toEqual(['archenemy', 'rivalry', 'war']);
    expect(two.links).toHaveLength(2);
    expect(two.nodes.some((n) => n.concept.id === unrelated.id)).toBe(false);
  });

  it('lays nodes out inside the box, deterministically, and handles edge cases', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'b' },
    ];
    const one = layoutGraph(ids, edges, 400, 300);
    const two = layoutGraph(ids, edges, 400, 300);
    expect([...one]).toEqual([...two]);
    for (const p of one.values()) {
      expect(p.x).toBeGreaterThanOrEqual(24);
      expect(p.x).toBeLessThanOrEqual(376);
      expect(p.y).toBeGreaterThanOrEqual(24);
      expect(p.y).toBeLessThanOrEqual(276);
    }
    expect(layoutGraph(['x'], [], 400, 300).get('x')).toEqual({ x: 200, y: 150 });
    expect(layoutGraph([], [], 400, 300).size).toBe(0);
  });
});
