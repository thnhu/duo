import type { ConceptLinkType, ExampleLinkType } from '../db/types';

// Display names of the link types (the PVO names are kept as they are).
export const CONCEPT_LINK_LABEL: Record<ConceptLinkType, string> = {
  association: 'Association',
  typeOf: 'Type of',
};

export const EXAMPLE_LINK_LABEL: Record<ExampleLinkType, string> = {
  idiom: 'Idiom',
  nominal: 'Nominal',
  agent: 'Agent',
  patient: 'Patient',
  action: 'Action',
  describedBy: 'Described by',
  describing: 'Describing',
  otherPhrase: 'Other phrase',
};
