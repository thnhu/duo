import type { ConceptGrammar, Lang } from '../../db/types';

// Which extra boxes "Thêm word" shows for a language and part of speech
// (Bản 7, M14c). This is configuration: a language or part of speech with
// its own boxes just gets an entry here, the screen does not change. English
// has none, so its form stays at deck / word / meaning / part of speech.

export type GrammarKey = 'gender' | 'plural' | 'infinitiv' | 'praesens3sg' | 'praeteritum' | 'partizip2';

export interface GrammarFieldSpec {
  key: GrammarKey;
  label: string;
  // 'choice' = select box from `options`, 'text' = a text box.
  kind: 'choice' | 'text';
  options?: string[];
  placeholder?: string;
}

export type GrammarValues = Record<GrammarKey, string>;

const NOUN: GrammarFieldSpec[] = [
  { key: 'gender', label: 'Giống (gender)', kind: 'choice', options: ['der', 'das', 'die'] },
  { key: 'plural', label: 'Số nhiều (plural, dạng đầy đủ)', kind: 'text', placeholder: 'vd: Adressen' },
];

const VERB: GrammarFieldSpec[] = [
  { key: 'infinitiv', label: 'Infinitiv', kind: 'text', placeholder: 'tự điền bằng word' },
  { key: 'praesens3sg', label: 'Präsens er/sie/es', kind: 'text', placeholder: 'vd: fährt ab' },
  { key: 'praeteritum', label: 'Präteritum', kind: 'text', placeholder: 'vd: fuhr ab' },
  { key: 'partizip2', label: 'Partizip II', kind: 'text', placeholder: 'vd: ist abgefahren' },
];

// language -> part-of-speech value (see posOptions) -> boxes
const FORMS: Partial<Record<Lang, Record<string, GrammarFieldSpec[]>>> = {
  de: { noun: NOUN, verb: VERB },
};

export function grammarFieldsFor(lang: Lang, pos: string): GrammarFieldSpec[] {
  return FORMS[lang]?.[pos] ?? [];
}

export function emptyGrammarValues(): GrammarValues {
  return { gender: '', plural: '', infinitiv: '', praesens3sg: '', praeteritum: '', partizip2: '' };
}

export function valuesFromGrammar(grammar?: ConceptGrammar): GrammarValues {
  return {
    gender: grammar?.gender ?? '',
    plural: grammar?.plural ?? '',
    infinitiv: grammar?.verbForms?.infinitiv ?? '',
    praesens3sg: grammar?.verbForms?.praesens3sg ?? '',
    praeteritum: grammar?.verbForms?.praeteritum ?? '',
    partizip2: grammar?.verbForms?.partizip2 ?? '',
  };
}

// Only the boxes that are shown count, and only filled ones are stored. A verb
// without an Infinitiv gets the word itself. Nothing filled = no grammar.
export function grammarFromValues(
  values: GrammarValues,
  fields: GrammarFieldSpec[],
  word: string,
): ConceptGrammar | undefined {
  const shown = new Set(fields.map((f) => f.key));
  const get = (key: GrammarKey) => (shown.has(key) ? values[key].trim() : '');
  const forms = {
    infinitiv: get('infinitiv') || (shown.has('infinitiv') ? word.trim() : ''),
    praesens3sg: get('praesens3sg'),
    praeteritum: get('praeteritum'),
    partizip2: get('partizip2'),
  };
  const verbForms = Object.fromEntries(Object.entries(forms).filter(([, v]) => v)) as NonNullable<
    ConceptGrammar['verbForms']
  >;
  const grammar: ConceptGrammar = {
    ...(get('gender') ? { gender: get('gender') } : {}),
    ...(get('plural') ? { plural: get('plural') } : {}),
    ...(Object.keys(verbForms).length > 0 ? { verbForms } : {}),
  };
  return Object.keys(grammar).length > 0 ? grammar : undefined;
}
