import type { ConceptGrammar, ExampleAttributes } from '../../db/types';

// Plain-text summaries of what a file import (or PO) stored about a word, shared
// by the import preview and the concept screens so both show the same thing.

// "die · Pl. Adressen" and "abfahren · fährt · fuhr ab · ist abgefahren".
export function grammarLines(grammar?: ConceptGrammar): string[] {
  const lines: string[] = [];
  if (grammar?.gender || grammar?.plural) {
    lines.push([grammar.gender, grammar.plural ? `Pl. ${grammar.plural}` : undefined].filter(Boolean).join(' · '));
  }
  const forms = grammar?.verbForms;
  if (forms) {
    const line = [forms.infinitiv, forms.praesens3sg, forms.praeteritum, forms.partizip2].filter(Boolean).join(' · ');
    if (line) lines.push(line);
  }
  return lines;
}

const ATTRIBUTE_LABELS: Array<[keyof ExampleAttributes, string]> = [
  ['tone', 'Tone'],
  ['mode', 'Mode'],
  ['register', 'Register'],
  ['nuance', 'Nuance'],
  ['dialect', 'Dialect'],
];

// Only labels that say something: "Neutral" is the default and is left out.
export function labelChips(attributes?: Partial<ExampleAttributes>): string[] {
  if (!attributes) return [];
  return ATTRIBUTE_LABELS.flatMap(([key, label]) => {
    const value = attributes[key];
    return value && value !== 'Neutral' ? [`${label}: ${value}`] : [];
  });
}
