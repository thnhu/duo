import type { DuoDB } from '../db/schema';
import { db as defaultDb } from '../db/schema';
import type { AcquisitionStatus, Concept, ConceptSource, Example, Lang, Verification } from '../db/types';
import { normalizeWithMap, tokenize, type NormalizedText } from '../core/normalize';
import type {
  SearchField,
  SearchFacets,
  SearchHit,
  SearchQuery,
  SearchResponse,
  SearchService,
  SearchSnippet,
} from './types';

// Local, offline search (spec 6.7). The index is derived data: built from
// IndexedDB in memory, never synced, rebuilt lazily after any write.

const FIELD_WEIGHT = {
  conceptText: 10,
  meaning: 6,
  exampleText: 5,
  note: 3,
  lesson: 2,
  expression: 4,
} as const;

interface IndexedField {
  field: SearchField;
  weight: number;
  raw: string;
  norm: NormalizedText;
}

interface IndexedDoc {
  kind: 'concept' | 'example';
  id: string;
  conceptId?: string;
  lang: Lang;
  text: string;
  fields: IndexedField[];
  status?: AcquisitionStatus;
  verification: Verification;
  lesson?: string;
  sourceType?: ConceptSource['type'];
  attributes?: Example['attributes'];
  unlinked: boolean;
  expressions?: string[];
  updatedAt: number;
}

function makeField(field: SearchField, weight: number, raw: string): IndexedField {
  return { field, weight, raw, norm: normalizeWithMap(raw) };
}

function wordStartAt(norm: string, index: number): boolean {
  return index === 0 || !/[a-z0-9]/.test(norm[index - 1]);
}

// Merge overlapping [start, end) ranges.
function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

// Find every occurrence of `token` in the field and translate back to
// ranges in the original (un-normalized) text.
function findRanges(field: IndexedField, token: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const { text, starts, ends } = field.norm;
  let from = 0;
  for (;;) {
    const at = text.indexOf(token, from);
    if (at === -1) break;
    ranges.push([starts[at], ends[at + token.length - 1]]);
    from = at + token.length;
  }
  return ranges;
}

// Score of one token against one field, or 0 for no match.
function scoreToken(field: IndexedField, token: string, related: boolean): number {
  const text = field.norm.text;
  if (text === token) return field.weight * 5;
  const at = text.indexOf(token);
  if (at === 0) return field.weight * 4;
  if (at > 0) return field.weight * (wordStartAt(text, at) ? 3 : 1);
  if (related && field.field === 'text' && text.length >= 3 && token.includes(text)) {
    return field.weight * 2;
  }
  return 0;
}

export class LocalSearchService implements SearchService {
  readonly id = 'local';

  private readonly db: DuoDB;
  private docs: IndexedDoc[] = [];
  private lessons: string[] = [];
  // Bumped on every write; the index is current when builtVersion matches.
  private version = 0;
  private builtVersion = -1;
  private building: Promise<void> | null = null;

  constructor(db: DuoDB = defaultDb) {
    this.db = db;
    const touch = () => this.invalidate();
    for (const table of [db.concepts, db.examples, db.exampleLinks, db.dictionaries]) {
      // Dexie hooks: invalidate immediately, and again after commit so a
      // rebuild that started mid-transaction can't leave the index stale.
      table.hook('creating', function () {
        touch();
        this.onsuccess = touch;
      });
      table.hook('updating', function () {
        touch();
        this.onsuccess = touch;
        return undefined;
      });
      table.hook('deleting', function () {
        touch();
        this.onsuccess = touch;
      });
    }
  }

  invalidate(): void {
    this.version++;
  }

  private async ensureIndex(): Promise<void> {
    while (this.builtVersion !== this.version) {
      if (!this.building) {
        const version = this.version;
        this.building = this.build()
          .then(() => {
            this.builtVersion = version;
          })
          .finally(() => {
            this.building = null;
          });
      }
      await this.building;
    }
  }

  private async build(): Promise<void> {
    const [dictionaries, concepts, examples, exampleLinks] = await Promise.all([
      this.db.dictionaries.toArray(),
      this.db.concepts.toArray(),
      this.db.examples.toArray(),
      this.db.exampleLinks.toArray(),
    ]);
    const langByDict = new Map(dictionaries.map((d) => [d.id, d.lang]));
    const activeConcepts = concepts.filter((c) => c.deletedAt === undefined);
    const conceptById = new Map<string, Concept>(activeConcepts.map((c) => [c.id, c]));
    const lessons = new Set<string>();

    // Ways of saying each depth concept: examples whose home it is, plus
    // examples linked to it (ExampleLink), without duplicates.
    const activeExamples = new Map(examples.filter((e) => e.deletedAt === undefined).map((e) => [e.id, e]));
    const expressionsByConcept = new Map<string, Map<string, Example>>();
    const addExpression = (conceptId: string, e: Example) => {
      const bucket = expressionsByConcept.get(conceptId) ?? new Map<string, Example>();
      bucket.set(e.id, e);
      expressionsByConcept.set(conceptId, bucket);
    };
    for (const e of activeExamples.values()) {
      if (e.targetConceptId && !e.isMinimal) addExpression(e.targetConceptId, e);
    }
    for (const link of exampleLinks) {
      const e = activeExamples.get(link.exampleId);
      if (link.deletedAt === undefined && e) addExpression(link.conceptId, e);
    }

    const docs: IndexedDoc[] = [];

    for (const c of activeConcepts) {
      const fields: IndexedField[] = [makeField('text', FIELD_WEIGHT.conceptText, c.text)];
      for (const meaning of c.meanings) {
        fields.push(makeField('meaning', FIELD_WEIGHT.meaning, meaning));
      }
      const expressions =
        c.mode === 'depth'
          ? [...(expressionsByConcept.get(c.id)?.values() ?? [])]
              .sort((a, b) => a.createdAt - b.createdAt)
              .map((e) => e.text)
          : undefined;
      for (const text of expressions ?? []) {
        fields.push(makeField('expression', FIELD_WEIGHT.expression, text));
      }
      if (c.source.lesson) {
        fields.push(makeField('lesson', FIELD_WEIGHT.lesson, c.source.lesson));
        lessons.add(c.source.lesson);
      }
      docs.push({
        kind: 'concept',
        id: c.id,
        conceptId: c.id,
        lang: c.lang,
        text: c.text,
        fields,
        status: c.status,
        verification: c.verification,
        lesson: c.source.lesson,
        sourceType: c.source.type,
        unlinked: false,
        expressions,
        updatedAt: c.updatedAt,
      });
    }

    for (const e of examples) {
      if (e.deletedAt !== undefined) continue;
      // Skip the auto-created minimal example: it only repeats the concept.
      if (e.isMinimal) continue;
      const concept = e.targetConceptId ? conceptById.get(e.targetConceptId) : undefined;
      // Linked to a concept that no longer exists: treat as orphan, hide it.
      if (e.targetConceptId && !concept) continue;
      const lang = concept?.lang ?? langByDict.get(e.dictionaryId);
      if (!lang) continue;
      const fields: IndexedField[] = [makeField('text', FIELD_WEIGHT.exampleText, e.text)];
      if (e.note) fields.push(makeField('note', FIELD_WEIGHT.note, e.note));
      docs.push({
        kind: 'example',
        id: e.id,
        conceptId: concept?.id,
        lang,
        text: e.text,
        fields,
        status: concept?.status,
        verification: e.verification,
        lesson: concept?.source.lesson,
        sourceType: concept?.source.type,
        attributes: e.attributes,
        unlinked: concept === undefined,
        updatedAt: e.updatedAt,
      });
    }

    this.docs = docs;
    this.lessons = [...lessons].sort((a, b) => a.localeCompare(b));
  }

  async getFacets(): Promise<SearchFacets> {
    await this.ensureIndex();
    return { lessons: this.lessons };
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    await this.ensureIndex();

    const tokens = tokenize(query.text);
    const filters = query.filters ?? {};
    const kinds = query.kinds ?? ['concept', 'example'];
    const related = query.mode === 'related';
    const attributeFilters = Object.entries(filters.attributes ?? {}).filter(
      ([, value]) => value !== undefined,
    );
    // Attribute and "unlinked" filters only make sense for examples.
    const examplesOnly = attributeFilters.length > 0 || filters.unlinkedOnly === true;
    const hasFilters =
      examplesOnly ||
      filters.lang !== undefined ||
      filters.status !== undefined ||
      filters.verification !== undefined ||
      filters.lesson !== undefined ||
      filters.sourceType !== undefined;

    // Empty query with no filter: nothing to show (callers list normally).
    if (tokens.length === 0 && !hasFilters) return { hits: [], total: 0 };

    const hits: SearchHit[] = [];
    for (const doc of this.docs) {
      if (!kinds.includes(doc.kind)) continue;
      if (examplesOnly && doc.kind !== 'example') continue;
      if (filters.lang && doc.lang !== filters.lang) continue;
      if (filters.status && doc.status !== filters.status) continue;
      if (filters.verification && doc.verification !== filters.verification) continue;
      if (filters.lesson && doc.lesson !== filters.lesson) continue;
      if (filters.sourceType && doc.sourceType !== filters.sourceType) continue;
      if (filters.unlinkedOnly && !doc.unlinked) continue;
      if (
        attributeFilters.some(
          ([key, value]) => doc.attributes?.[key as keyof Example['attributes']] !== value,
        )
      ) {
        continue;
      }

      const hit = this.matchDoc(doc, tokens, related);
      if (hit) hits.push(hit);
    }

    const sort = query.sort ?? 'relevance';
    if (sort === 'recent') hits.sort((a, b) => b.updatedAt - a.updatedAt);
    else if (sort === 'alphabetical') hits.sort((a, b) => a.text.localeCompare(b.text));
    else hits.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);

    const limit = query.limit ?? 100;
    return { hits: hits.slice(0, limit), total: hits.length };
  }

  private matchDoc(doc: IndexedDoc, tokens: string[], related: boolean): SearchHit | null {
    const base = {
      kind: doc.kind,
      id: doc.id,
      conceptId: doc.conceptId,
      lang: doc.lang,
      text: doc.text,
      status: doc.status,
      verification: doc.verification,
      ...(doc.expressions ? { isDepth: true, expressions: doc.expressions } : {}),
      updatedAt: doc.updatedAt,
    };

    // Filter-only browsing: everything that passed the filters is a hit.
    if (tokens.length === 0) {
      return { ...base, ranges: [], snippets: [], score: 0 };
    }

    let score = 0;
    let matchedTokens = 0;
    const rangesByField = new Map<IndexedField, Array<[number, number]>>();

    for (const token of tokens) {
      let best = 0;
      for (const field of doc.fields) {
        const s = scoreToken(field, token, related);
        if (s === 0) continue;
        best = Math.max(best, s);
        const found = findRanges(field, token);
        if (found.length > 0) {
          rangesByField.set(field, [...(rangesByField.get(field) ?? []), ...found]);
        }
      }
      if (best > 0) {
        matchedTokens++;
        score += best;
      } else if (!related) {
        return null;
      }
    }
    if (matchedTokens === 0) return null;

    let ranges: Array<[number, number]> = [];
    const snippets: SearchSnippet[] = [];
    for (const [field, found] of rangesByField) {
      const merged = mergeRanges(found);
      if (field.field === 'text') ranges = merged;
      else snippets.push({ field: field.field, text: field.raw, ranges: merged });
    }
    // At most two extra snippets keeps result rows compact.
    return { ...base, ranges, snippets: snippets.slice(0, 2), score };
  }
}
