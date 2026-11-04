// Data model per docs/vocab-tool-spec.md section 8.

export type Lang = 'en' | 'de';
export type Verification = 'unverified' | 'verified';
export type AcquisitionStatus = 'unknown' | 'loaded' | 'acquired';

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

export interface Concept {
  id: string;
  dictionaryId: string;
  lang: Lang;
  text: string;
  pos?: string;
  meanings: string[];
  grammar?: ConceptGrammar;
  verification: Verification;
  source: ConceptSource;
  status: AcquisitionStatus;
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

export interface ImportMapping {
  id: string;
  name: string;
  columns: Record<string, string>;
  delimiter?: string;
  sheet?: string;
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
