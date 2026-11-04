import type { ConceptGrammar } from '../../db/types';

// German verb forms for the conjugation drill. The drill must never mark a
// correct answer wrong, so a form is only produced when it is certain:
//  - regular (weak) verbs follow the rules below;
//  - for stem-changing verbs only the forms that data gives us are used
//    (er/sie/es present, Präteritum from the stored Präteritum).
// Anything else is left out instead of guessed.

export type Person = 'ich' | 'du' | 'er' | 'wir' | 'ihr' | 'sie';
export type Tense = 'praesens' | 'praeteritum';

export const PERSONS: Person[] = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'];

export const PERSON_LABEL: Record<Person, string> = {
  ich: 'ich',
  du: 'du',
  er: 'er/sie/es',
  wir: 'wir',
  ihr: 'ihr',
  sie: 'sie/Sie',
};

export const TENSE_LABEL: Record<Tense, string> = {
  praesens: 'Präsens',
  praeteritum: 'Präteritum',
};

export type FormTable = Partial<Record<Person, string[]>>;

type VerbForms = NonNullable<ConceptGrammar['verbForms']>;

export function stemOf(infinitive: string): string {
  if (infinitive.endsWith('en')) return infinitive.slice(0, -2);
  if (infinitive.endsWith('n')) return infinitive.slice(0, -1);
  return infinitive;
}

// Stems whose -st/-t endings need a linking "e": arbeiten, finden, öffnen,
// rechnen, atmen, regnen.
function needsLinkingE(stem: string): boolean {
  return /(?:[dt]|chn|ffn|gn|tm|dm)$/.test(stem);
}

const SIBILANT = /[sßzx]$/;

// Inseparable prefixes whose participle has no "ge-".
const NO_GE_PREFIX = /^(?:be|emp|ent|er|ge|miss|ver|zer)/;

export function hasSingleToken(form: string | undefined): form is string {
  return !!form && !/\s/.test(form.trim());
}

// Regular ("weak") verb: Präteritum stem+te, Partizip II ge+stem+t.
export function isWeakVerb(forms: VerbForms): boolean {
  const inf = forms.infinitiv;
  const past = forms.praeteritum;
  const participle = forms.partizip2;
  if (!hasSingleToken(inf) || !hasSingleToken(past) || !hasSingleToken(participle)) return false;
  const stem = stemOf(inf);
  const pastOk = past === `${stem}te` || past === `${stem}ete`;
  const ending = participle.endsWith('et') ? 'et' : 't';
  const participleOk =
    participle === `ge${stem}${ending}` ||
    (NO_GE_PREFIX.test(inf) && participle === `${stem}${ending}`);
  return pastOk && participleOk;
}

// Regular present tense, or undefined when the infinitive isn't usable.
export function regularPresent(infinitive: string): FormTable | undefined {
  if (!hasSingleToken(infinitive) || !/e?n$/.test(infinitive)) return undefined;
  const stem = stemOf(infinitive);
  if (stem.length < 2) return undefined;
  const e = needsLinkingE(stem);

  const ich = /(?:eln)$/.test(infinitive)
    ? [`${stem.slice(0, -2)}le`] // sammeln -> sammle
    : /(?:ern)$/.test(infinitive)
      ? [`${stem}e`, `${stem.slice(0, -2)}re`] // ändern -> ändere / ändre
      : [`${stem}e`];

  return {
    ich,
    du: [SIBILANT.test(stem) ? `${stem}t` : e ? `${stem}est` : `${stem}st`],
    er: [e ? `${stem}et` : `${stem}t`],
    wir: [infinitive],
    ihr: [e ? `${stem}et` : `${stem}t`],
    sie: [infinitive],
  };
}

// Present tense forms that are certain for this verb.
export function presentForms(forms: VerbForms): FormTable | undefined {
  const inf = forms.infinitiv;
  if (!hasSingleToken(inf)) return undefined;
  const regular = regularPresent(inf);
  if (!regular) return undefined;
  const er = forms.praesens3sg;

  if (er) {
    // Data says how er/sie/es is formed: regular verbs match the rules,
    // everything else (fährt, isst, ist, hat...) gives just that one form.
    if (regular.er?.includes(er)) return regular;
    return hasSingleToken(er) ? { er: [er] } : undefined;
  }
  // No data: only a verb proven regular by its Präteritum/Partizip II.
  return isWeakVerb(forms) ? regular : undefined;
}

// Präteritum: the stored 3rd-person form is also the ich form.
export function preteriteForms(forms: VerbForms): FormTable | undefined {
  const past = forms.praeteritum;
  if (!hasSingleToken(past)) return undefined;
  const endsInE = past.endsWith('e');
  const e = /[dt]$/.test(past);
  const table: FormTable = {
    ich: [past],
    er: [past],
    wir: [endsInE ? `${past}n` : `${past}en`],
    ihr: [endsInE ? `${past}t` : e ? `${past}et` : `${past}t`],
    sie: [endsInE ? `${past}n` : `${past}en`],
  };
  // du after s/ß/z/x is ambiguous (las -> last/lasest): not asked.
  if (!SIBILANT.test(past)) table.du = [endsInE || !e ? `${past}st` : `${past}est`];
  return table;
}

export function tensesAvailable(
  forms: VerbForms | undefined,
): Array<{ tense: Tense; table: FormTable }> {
  if (!forms) return [];
  const out: Array<{ tense: Tense; table: FormTable }> = [];
  const present = presentForms(forms);
  if (present) out.push({ tense: 'praesens', table: present });
  const past = preteriteForms(forms);
  if (past) out.push({ tense: 'praeteritum', table: past });
  return out;
}
