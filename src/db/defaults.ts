import type { AcquisitionCriteria, AttributeValueSets, LinkTypeSets, Settings } from './types';

export const SETTINGS_ID = 'default';

export const CURRENT_SCHEMA_VERSION = 1;

// Spec section 2 — proposed defaults, meant to be tuned after real use.
export const defaultAcquisitionCriteria: AcquisitionCriteria = {
  minCorrect: 5,
  minDistinctContexts: 3,
  minDistinctDays: 3,
  maxResponseTimeMsDefault: 4000,
  maxResponseTimeMsByExerciseType: {},
};

// Spec section 1.3 — PVO's default attribute value sets, used as-is.
export const defaultAttributeValueSets: AttributeValueSets = {
  tone: ['Neutral', 'Informal', 'Formal', 'Slightly informal', 'Slightly formal'],
  mode: ['Neutral', 'Spoken', 'Written'],
  register: [
    'Neutral',
    'Academic',
    'Literature',
    'Business',
    'Law',
    'Journalism',
    'Medicine',
    'IT',
    'Other',
  ],
  nuance: ['Neutral', 'Old fashioned', 'Humorous', 'Oft positive', 'Oft negative'],
  dialect: ['Neutral', 'American', 'British', 'Other'],
};

// Spec section 1.3 — full PVO link type set.
export const defaultLinkTypes: LinkTypeSets = {
  conceptConcept: ['association', 'typeOf'],
  exampleConcept: [
    'idiom',
    'nominal',
    'agent',
    'patient',
    'action',
    'describedBy',
    'describing',
    'otherPhrase',
  ],
};

export function createDefaultSettings(): Settings {
  return {
    id: SETTINGS_ID,
    acquisitionCriteria: defaultAcquisitionCriteria,
    attributeValueSets: defaultAttributeValueSets,
    linkTypes: defaultLinkTypes,
    enabledModules: [],
    aiProviderConfig: { enabled: false },
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: Date.now(),
  };
}

export function createDefaultAttributes() {
  return {
    tone: 'Neutral' as const,
    mode: 'Neutral' as const,
    register: 'Neutral' as const,
    nuance: 'Neutral' as const,
    dialect: 'Neutral' as const,
  };
}
