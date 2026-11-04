import type { Concept, Example } from '../../db/types';
import { gradeFields, normalizeAnswer, splitAlternatives } from '../grade';
import type { Exercise, ExerciseContext, ExerciseModule } from '../types';
import {
  hasSingleToken,
  isWeakVerb,
  PERSON_LABEL,
  PERSONS,
  tensesAvailable,
  TENSE_LABEL,
} from './conjugation';

// The four German "Rộng" drills of M4 (spec 5.1). Each is an independent
// module; none imports another.

// Article choices live here (German-specific), not in the screens.
const ARTICLES = ['der', 'die', 'das'];

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function base(concept: Concept, example: Example) {
  return { conceptId: concept.id, exampleId: example.id };
}

function meaningHint(concept: Concept): string | undefined {
  return concept.meanings[0];
}

// ---------------------------------------------------------------- dictation

// Spec 5.1 / C7: with a highlighted phrase the default is to write the
// phrase; there is an option to write the whole sentence.
export function dictationTarget(example: Example, scope: string): string {
  if (scope !== 'sentence' && example.highlight) {
    return example.text.slice(example.highlight.start, example.highlight.end);
  }
  return example.text;
}

const stripEndPunctuation = (s: string) => normalizeAnswer(s).replace(/[\s.,;:!?"„“”]+$/u, '');

export const germanDictation: ExerciseModule = {
  id: 'de.dictation',
  label: 'Nghe chép chính tả',
  description: 'Nghe phát âm rồi gõ đúng chính tả.',
  languages: ['de'],
  mode: 'breadth',
  options: [
    {
      id: 'scope',
      label: 'Chép gì',
      choices: [
        { value: 'highlight', label: 'Cụm tô sáng' },
        { value: 'sentence', label: 'Cả câu' },
      ],
      default: 'highlight',
    },
  ],
  // Needs a real example that belongs to the concept.
  isEligible: (concept, example) => example.targetConceptId === concept.id,
  generate(concept, example, context): Exercise {
    const target = dictationTarget(example, context.options.scope ?? 'highlight');
    return {
      ...base(concept, example),
      moduleId: 'de.dictation',
      title: 'Nghe và chép',
      prompt: 'Nghe rồi gõ lại đúng chính tả.',
      detail: meaningHint(concept),
      speak: { text: target, lang: 'de-DE' },
      fields: [{ key: 'answer', label: 'Bạn nghe được', type: 'text' }],
      expected: { answer: [target] },
    };
  },
  // A trailing full stop in a whole sentence is not a spelling matter.
  grade: (answer, exercise) => gradeFields(answer, exercise, stripEndPunctuation),
};

// ------------------------------------------------------- gender and plural

export const germanNounGenderPlural: ExerciseModule = {
  id: 'de.noun-gender-plural',
  label: 'Giống và số nhiều',
  description: 'Chọn der/die/das và gõ dạng số nhiều của danh từ.',
  languages: ['de'],
  mode: 'breadth',
  isEligible: (concept) => !!concept.grammar?.gender && ARTICLES.includes(concept.grammar.gender),
  generate(concept, example): Exercise {
    const gender = concept.grammar!.gender!;
    const plural = concept.grammar?.plural?.trim();
    const fields: Exercise['fields'] = [
      { key: 'gender', label: 'Giống', type: 'choice', options: ARTICLES },
    ];
    const expected: Exercise['expected'] = { gender: [gender] };
    if (plural) {
      fields.push({ key: 'plural', label: 'Số nhiều (die …)', type: 'text' });
      expected.plural = splitAlternatives(plural);
    }
    return {
      ...base(concept, example),
      moduleId: 'de.noun-gender-plural',
      title: plural ? 'Giống và số nhiều' : 'Giống',
      prompt: concept.text,
      detail: meaningHint(concept),
      fields,
      expected,
    };
  },
  grade: (answer, exercise) => gradeFields(answer, exercise),
};

// ------------------------------------------------------------- conjugation

export const germanVerbConjugation: ExerciseModule = {
  id: 'de.verb-conjugation',
  label: 'Chia động từ',
  description: 'Chia động từ theo ngôi và thì (Präsens, Präteritum).',
  languages: ['de'],
  mode: 'breadth',
  isEligible: (concept) => tensesAvailable(concept.grammar?.verbForms).length > 0,
  generate(concept, example, context: ExerciseContext): Exercise {
    const forms = concept.grammar!.verbForms!;
    const { tense, table } = pick(tensesAvailable(forms), context.rng);
    const persons = PERSONS.filter((p) => (table[p]?.length ?? 0) > 0);
    const person = pick(persons, context.rng);
    return {
      ...base(concept, example),
      moduleId: 'de.verb-conjugation',
      title: 'Chia động từ',
      prompt: forms.infinitiv ?? concept.text,
      detail: `${TENSE_LABEL[tense]} · ${PERSON_LABEL[person]}`,
      fields: [{ key: 'answer', label: `${PERSON_LABEL[person]} …`, type: 'text' }],
      expected: { answer: table[person]! },
    };
  },
  grade: (answer, exercise) => gradeFields(answer, exercise),
};

// -------------------------------------------------------- irregular verbs

export const germanIrregularForms: ExerciseModule = {
  id: 'de.irregular-verb-forms',
  label: 'Động từ bất quy tắc',
  description: 'Điền Präteritum và Partizip II từ Infinitiv.',
  languages: ['de'],
  mode: 'breadth',
  isEligible(concept) {
    const forms = concept.grammar?.verbForms;
    return (
      !!forms &&
      hasSingleToken(forms.infinitiv) &&
      hasSingleToken(forms.praeteritum) &&
      hasSingleToken(forms.partizip2) &&
      // Regular verbs are not "bất quy tắc".
      !isWeakVerb(forms)
    );
  },
  generate(concept, example): Exercise {
    const forms = concept.grammar!.verbForms!;
    return {
      ...base(concept, example),
      moduleId: 'de.irregular-verb-forms',
      title: 'Động từ bất quy tắc',
      prompt: forms.infinitiv!,
      detail: meaningHint(concept),
      fields: [
        { key: 'praeteritum', label: 'Präteritum (er/sie/es)', type: 'text' },
        { key: 'partizip2', label: 'Partizip II', type: 'text' },
      ],
      expected: {
        praeteritum: splitAlternatives(forms.praeteritum!),
        partizip2: splitAlternatives(forms.partizip2!),
      },
    };
  },
  grade: (answer, exercise) => gradeFields(answer, exercise),
};

export const germanModules: ExerciseModule[] = [
  germanDictation,
  germanNounGenderPlural,
  germanVerbConjugation,
  germanIrregularForms,
];
