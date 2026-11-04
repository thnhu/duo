// Data model per docs/vocab-tool-spec.md section 8.

export type Lang = 'en' | 'de';
export type Verification = 'unverified' | 'verified';
export type AcquisitionStatus = 'unknown' | 'loaded' | 'acquired';
// Spec A4: where a word is loaded to — Rộng (breadth) or Sâu (depth).
export type StudyMode = 'breadth' | 'depth';

export interface Dictionary {
  id: string;
  name: string;
  lang: Lang;
  updatedAt: number;
  deletedAt?: number;
}

export interface ConceptGrammar {
  gender?: string;
  plural?: string;
  verbForms?: {
    infinitiv?: string;
    // Third-person singular present (er/sie/es): tells stem-changing verbs
    // (fahren -> fährt) apart from regular ones for the conjugation drill.
    praesens3sg?: string;
    praeteritum?: string;
    partizip2?: string;
  };
}

export interface ConceptSource {
  type: 'import' | 'quick-add' | 'lookup';
  fileName?: string;
  lesson?: string;
  row?: number;
}

// Result of an automatic dictionary lookup (spec 6.5, M3b). It is only a
// suggestion: nothing in it is copied into the concept's own fields until PO
// reviews it and the concept becomes `verified`.
export interface LookupExample {
  text: string;
  translation?: string;
}

export interface LookupDefinition {
  text: string;
  // Labels the source attaches to this sense (informal, slang, dated...):
  // shown as evidence for PO, never applied automatically.
  labels?: string[];
  examples?: LookupExample[];
}

export interface LookupEntry {
  pos?: string;
  definitions: LookupDefinition[];
  grammar?: ConceptGrammar;
}

export interface LookupSuggestion {
  status: 'found' | 'not-found';
  provider: string;
  fetchedAt: number;
  entries: LookupEntry[];
  sourceName?: string;
  sourceUrl?: string;
  license?: { name: string; url?: string };
}

export interface Concept {
  id: string;
  dictionaryId: string;
  lang: Lang;
  text: string;
  pos?: string;
  meanings: string[];
  grammar?: ConceptGrammar;
  // Undefined = breadth (concepts created before M3 have no mode).
  mode?: StudyMode;
  // Pending lookup suggestion awaiting PO review (M3b).
  lookup?: LookupSuggestion;
  verification: Verification;
  source: ConceptSource;
  status: AcquisitionStatus;
  // Set when an acquired word slipped back to `loaded` (M5): only answers
  // after this time count towards acquiring it again.
  progressResetAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// TMRND — see spec section 1.3.
export type Tone = 'Neutral' | 'Informal' | 'Formal' | 'Slightly informal' | 'Slightly formal';
export type Mode = 'Neutral' | 'Spoken' | 'Written';
export type Register =
  | 'Neutral'
  | 'Academic'
  | 'Literature'
  | 'Business'
  | 'Law'
  | 'Journalism'
  | 'Medicine'
  | 'IT'
  | 'Other';
export type Nuance = 'Neutral' | 'Old fashioned' | 'Humorous' | 'Oft positive' | 'Oft negative';
export type Dialect = 'Neutral' | 'American' | 'British' | 'Other';

export interface ExampleAttributes {
  tone: Tone;
  mode: Mode;
  register: Register;
  nuance: Nuance;
  dialect: Dialect;
}

export type AttributesStatus = 'empty' | 'suggested' | 'verified';

export interface SuggestedAttributeValue<T> {
  value: T;
  reason: string;
  confidence?: number;
}

export interface SuggestedAttributes {
  tone?: SuggestedAttributeValue<Tone>;
  mode?: SuggestedAttributeValue<Mode>;
  register?: SuggestedAttributeValue<Register>;
  nuance?: SuggestedAttributeValue<Nuance>;
  dialect?: SuggestedAttributeValue<Dialect>;
  provider: string;
  suggestedAt: number;
}

export interface ExampleHighlight {
  start: number;
  end: number;
}

export interface Example {
  id: string;
  dictionaryId: string;
  text: string;
  targetConceptId?: string;
  highlight?: ExampleHighlight;
  attributes: ExampleAttributes;
  attributesStatus: AttributesStatus;
  suggestedAttributes?: SuggestedAttributes;
  note?: string;
  verification: Verification;
  isMinimal?: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ScheduleState {
  exampleId: string;
  due: number;
  intervalDays: number;
  ease?: number;
  stability?: number;
  lapses: number;
  updatedAt: number;
}

export interface ReviewLog {
  id: string;
  conceptId: string;
  exampleId: string;
  exerciseType: string;
  correct: boolean;
  responseTimeMs: number;
  timestamp: number;
}

// Sync bookkeeping, local to each device and never synced itself (M7b).
// `r:<table>:<id>` = the version (updatedAt) of that record already in sync;
// `cursor:<uid>` = how far this device has pulled.
export interface SyncMetaRow {
  key: string;
  value: number;
}

export interface ImportMapping {
  id: string;
  name: string;
  columns: Record<string, string>;
  delimiter?: string;
  sheet?: string;
  updatedAt: number;
  deletedAt?: number;
}

// One file import (M3). Keeps what it created/changed so the latest import
// can be undone (journey J1 step 9).
export interface ImportBatch {
  id: string;
  fileName: string;
  createdConceptIds: string[];
  createdExampleIds: string[];
  // Previous values of concepts changed by a merge/update.
  updatedConcepts: Array<{ id: string; before: Partial<Concept> }>;
  createdAt: number;
  undoneAt?: number;
  updatedAt: number;
  deletedAt?: number;
}

// Spec section 2: acquisition thresholds, configurable (not hard-coded).
export interface AcquisitionCriteria {
  minCorrect: number;
  minDistinctContexts: number;
  minDistinctDays: number;
  maxResponseTimeMsDefault: number;
  maxResponseTimeMsByExerciseType: Record<string, number>;
}

export interface AttributeValueSets {
  tone: Tone[];
  mode: Mode[];
  register: Register[];
  nuance: Nuance[];
  dialect: Dialect[];
}

export interface LinkTypeSets {
  conceptConcept: Array<'association' | 'typeOf'>;
  exampleConcept: Array<
    | 'idiom'
    | 'nominal'
    | 'agent'
    | 'patient'
    | 'action'
    | 'describedBy'
    | 'describing'
    | 'otherPhrase'
  >;
}

export interface AiProviderConfig {
  enabled: boolean;
  model?: string;
}

export interface Settings {
  id: string;
  acquisitionCriteria: AcquisitionCriteria;
  attributeValueSets: AttributeValueSets;
  linkTypes: LinkTypeSets;
  enabledModules: string[];
  aiProviderConfig: AiProviderConfig;
  schemaVersion: number;
  updatedAt: number;
}
