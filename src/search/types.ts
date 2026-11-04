import type { RegistrableModule } from '../core/registry';
import type { AcquisitionStatus, ConceptSource, ExampleAttributes, Lang, Verification } from '../db/types';

// SearchService interface (spec section 7 / 6.7). Callers depend on this,
// never on a concrete implementation, so the engine can be swapped.

export type SearchKind = 'concept' | 'example';
export type SearchSort = 'relevance' | 'recent' | 'alphabetical';

export interface SearchFilters {
  lang?: Lang;
  status?: AcquisitionStatus;
  verification?: Verification;
  // TMRND — applies to examples only (spec: attributes live on Example).
  attributes?: Partial<ExampleAttributes>;
  lesson?: string;
  sourceType?: ConceptSource['type'];
  // "câu chưa gắn concept" only.
  unlinkedOnly?: boolean;
}

export interface SearchQuery {
  text: string;
  filters?: SearchFilters;
  sort?: SearchSort;
  // Restrict which kinds of hit come back (default: both).
  kinds?: SearchKind[];
  // 'all' (default): every word must match. 'related': any word may match,
  // and a concept also matches when the query contains its text
  // ("swallowed" finds "swallow") — used to suggest concepts to link to.
  mode?: 'all' | 'related';
  limit?: number;
}

export type SearchField = 'text' | 'meaning' | 'note' | 'lesson';

export interface SearchSnippet {
  field: SearchField;
  text: string;
  // [start, end) ranges in `text` to emphasize.
  ranges: Array<[number, number]>;
}

export interface SearchHit {
  kind: SearchKind;
  id: string;
  // Concept to open for this hit (the concept itself, or the example's
  // target concept). Undefined for an unlinked example (lives in the inbox).
  conceptId?: string;
  lang: Lang;
  // The concept's text, or the example's sentence.
  text: string;
  // Ranges in `text` that matched.
  ranges: Array<[number, number]>;
  // Matches found in other fields (meaning, note, lesson).
  snippets: SearchSnippet[];
  status?: AcquisitionStatus;
  verification: Verification;
  score: number;
  updatedAt: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  // Total matches before `limit` was applied.
  total: number;
}

export interface SearchFacets {
  lessons: string[];
}

export interface SearchService extends RegistrableModule {
  search(query: SearchQuery): Promise<SearchResponse>;
  getFacets(): Promise<SearchFacets>;
  // Drop the derived index; it is rebuilt on next use. Call after bulk
  // changes made outside the repositories (e.g. restoring a backup).
  invalidate(): void;
}
