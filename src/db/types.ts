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

// A word set ("bo tu", spec M13): a named group of concepts of one language,
// e.g. "IT" or "From films". A concept can belong to several sets, so the
// same word is never entered twice. Sets are only labels on concepts: the
// dictionary (one per language) still owns the data.
export interface WordSet {
  id: string;
  name: string;
  lang: Lang;
  updatedAt: number;
  deletedAt?: number;
}

// A lesson (Bản 8): a named topic inside one deck ("Family", "Daily
// activities"), about twenty words. A concept is in at most one lesson
// (`Concept.lessonId`). `setId` is the deck it belongs to; none = the General
// deck. The name is unique inside a deck (ignoring case).
export interface Lesson {
  id: string;
  lang: Lang;
  name: string;
  // Position among the lessons of the same deck (file order, can be changed).
  order: number;
  setId?: string;
  updatedAt: number;
  deletedAt?: number;
}

// A passage (a short text) that is studied as a gap-fill: the PO marks the
// words to learn, the drill hides them and asks for them back. Each gap is an
// Example (text = this passage, highlight = the gap, passageId = this row) so
// schedule, review log and acquisition keep working per example.
export interface Passage {
  id: string;
  dictionaryId: string;
  lang: Lang;
  title?: string;
  text: string;
  // The deck the passage was added to (undefined = General, and the passages
  // made before decks were remembered). The Passages screen shows one deck at
  // a time.
  setId?: string;
  // The lesson (Bản 10, M17a) of that deck the passage is listed under. Only
  // meaningful while the lesson is live and in the passage's deck; otherwise the
  // passage counts as "no lesson".
  lessonId?: string;
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

export type ConceptKind = 'word' | 'concept';

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
  // Which sub deck it shows in: a 'word' (a word/phrase with its meaning) or a
  // 'concept' (an idea, wording added later as examples). Undefined = derived
  // for older rows: depth concepts are concepts, everything else is a word.
  kind?: ConceptKind;
  // Word sets this concept belongs to (M13). Undefined/empty = in no set.
  setIds?: string[];
  // The lesson (Bản 8) of one of this concept's decks, if any.
  lessonId?: string;
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

// 'suggested' and `suggestedAttributes` / `aiProviderConfig` are legacy: the AI
// suggestion feature (M10b) was removed on 2026-11-05, but the fields stay so
// data already saved or synced is never lost (principle 9). Nothing writes them.
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
  // Further parts of the same phrase when it is split in the sentence, e.g. a
  // separable verb ("fahren … ab"). `highlight` is the first part. Optional,
  // so older data needs no migration.
  highlightExtra?: ExampleHighlight[];
  // Set when this example is one gap of a passage (see Passage).
  passageId?: string;
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

// Concept -> concept link (spec 1.4, kind 3). Direction is always
// child -> parent: "hello" (child) is a "typeOf" "greeting" (parent). Only
// concepts have parents and children, never examples. No cycles (checked
// when saving, and tolerated when reading because sync can merge two devices'
// edits into one).
export type ConceptLinkType = LinkTypeSets['conceptConcept'][number];

export interface ConceptLink {
  id: string;
  childId: string;
  parentId: string;
  type: ConceptLinkType;
  updatedAt: number;
  deletedAt?: number;
}

// Example -> concept link (spec 1.4, kind 2): an EXTRA relation beyond the
// example's own concept (`targetConceptId`). One example can be a way of
// saying several concepts.
export type ExampleLinkType = LinkTypeSets['exampleConcept'][number];

export interface ExampleLink {
  id: string;
  exampleId: string;
  conceptId: string;
  type: ExampleLinkType;
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
  // Lessons this import made (Bản 8), taken away again by the undo.
  createdLessonIds?: string[];
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

// How PO likes to study (M9c). Optional: settings stored before M9c have
// none, and the defaults in `src/settings/study.ts` apply.
export interface StudySettings {
  // Questions per session (drills, review and flash round).
  sessionCount: number;
  // Passage drill: share of gaps (%) that must be right to pass without
  // repeating, and how many repeats are asked at most. Optional for settings
  // stored before this existed.
  passagePassPercent?: number;
  passageMaxRetries?: number;
}

// Depth mode (M11a): how many different ways of saying one concept make it
// "tri-fold" complete.
export interface DepthSettings {
  minExpressions: number;
}

export interface Settings {
  id: string;
  acquisitionCriteria: AcquisitionCriteria;
  study?: StudySettings;
  depth?: DepthSettings;
  attributeValueSets: AttributeValueSets;
  linkTypes: LinkTypeSets;
  enabledModules: string[];
  aiProviderConfig: AiProviderConfig;
  schemaVersion: number;
  updatedAt: number;
}
