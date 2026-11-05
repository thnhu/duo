import type { Concept, Example } from '../../db/types';
import { gradeFields, normalizeAnswer } from '../grade';
import { dictationTarget, stripEndPunctuation } from '../shared';
import type { Exercise, ExerciseLibrary, ExerciseModule } from '../types';
import { posClass, wordCount } from './pos';

// English "Rộng" drills (spec 5.2, M9b). Each is an independent module.
//
//  - en.cloze: the highlighted phrase is hidden in its sentence; type it.
//  - en.meaning-to-word: given the meaning, type the noun.
//  - en.word-to-meaning: given the word/phrase, pick its meaning.
//  - en.dictation: listen and type (optional).
//
// Answers are not case-sensitive (English has no capitalised nouns).
// Meaning-based drills only use `verified` words: a lookup result that PO
// has not yet checked and translated is a suggestion, never an answer.

const INPUT = { lang: 'en' };
const SPEECH = { tag: 'en-US', label: 'tiếng Anh' };
const CHOICES = 4; // the right meaning + 3 wrong ones
const BLANK = '＿＿＿＿＿';

const normalize = (s: string) => normalizeAnswer(s).toLowerCase();
const normalizeSentence = (s: string) => stripEndPunctuation(s).toLowerCase();

function base(concept: Concept, example: Example) {
  return { conceptId: concept.id, exampleId: example.id };
}

function isEnglishWord(concept: Concept, example: Example): boolean {
  return concept.lang === 'en' && example.targetConceptId === concept.id;
}

function hasVerifiedMeaning(concept: Concept): boolean {
  return concept.verification === 'verified' && !!concept.meanings[0]?.trim();
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ------------------------------------------------------------------- cloze

function highlightedPhrase(example: Example): string | undefined {
  if (!example.highlight || example.isMinimal) return undefined;
  const { start, end } = example.highlight;
  const phrase = example.text.slice(start, end);
  // Highlighting the whole sentence would leave nothing to read as context.
  if (!phrase.trim() || phrase.length >= example.text.trim().length) return undefined;
  return phrase;
}

export const englishCloze: ExerciseModule = {
  id: 'en.cloze',
  label: 'Điền cụm vào câu',
  description: 'Câu ví dụ bị che cụm đã tô sáng; gõ lại cụm đó.',
  languages: ['en'],
  mode: 'breadth',
  input: INPUT,
  unavailableHint:
    'Cần câu ví dụ có cụm được tô sáng. Ghi nhanh một câu rồi tô sáng cụm cần học, hoặc nhập file có cột example.',
  isEligible: (concept, example) =>
    isEnglishWord(concept, example) && highlightedPhrase(example) !== undefined,
  generate(concept, example): Exercise {
    const phrase = highlightedPhrase(example)!;
    const { start, end } = example.highlight!;
    const hints: string[] = [];
    // The sentence may use another form (swallowed / swallow): say which word.
    if (normalize(phrase) !== normalize(concept.text)) hints.push(`Word gốc: ${concept.text}`);
    if (hasVerifiedMeaning(concept)) hints.push(concept.meanings.join('; '));
    return {
      ...base(concept, example),
      moduleId: 'en.cloze',
      title: 'Điền cụm vào câu',
      prompt: example.text.slice(0, start) + BLANK + example.text.slice(end),
      detail: hints.join(' · ') || undefined,
      fields: [{ key: 'answer', label: 'Cụm bị che', type: 'text' }],
      expected: { answer: [phrase] },
    };
  },
  grade: (answer, exercise) => gradeFields(answer, exercise, normalize),
};

// --------------------------------------------------------- meaning -> word

export const englishMeaningToWord: ExerciseModule = {
  id: 'en.meaning-to-word',
  label: 'Nghĩa → word',
  description: 'Cho nghĩa tiếng Việt, gõ danh từ tiếng Anh.',
  languages: ['en'],
  mode: 'breadth',
  input: INPUT,
  unavailableHint:
    'Cần danh từ đã duyệt (verified), có loại từ "noun" và nghĩa. Duyệt kết quả Tra cứu tự động ở Thư viện.',
  isEligible: (concept, example) =>
    isEnglishWord(concept, example) &&
    hasVerifiedMeaning(concept) &&
    posClass(concept.pos) === 'noun' &&
    wordCount(concept.text) === 1,
  generate(concept, example): Exercise {
    const text = concept.text.trim();
    return {
      ...base(concept, example),
      moduleId: 'en.meaning-to-word',
      title: 'Nghĩa → word',
      prompt: concept.meanings.slice(0, 3).join('; '),
      // Several words can share a meaning, so give the length and first letter.
      detail: `${text.length} chữ cái, bắt đầu bằng "${text[0]}"`,
      fields: [{ key: 'answer', label: 'Danh từ tiếng Anh', type: 'text' }],
      expected: { answer: [text] },
    };
  },
  grade: (answer, exercise) => gradeFields(answer, exercise, normalize),
};

// --------------------------------------------------------- word -> meaning

// Wrong choices: meanings of other verified English words, never one that
// equals the right answer.
export function distractorMeanings(
  concept: Concept,
  library: ExerciseLibrary | undefined,
): string[] {
  const right = normalize(concept.meanings[0] ?? '');
  const seen = new Set([right]);
  const result: string[] = [];
  for (const other of library?.concepts ?? []) {
    if (other.id === concept.id || other.deletedAt !== undefined) continue;
    if (other.lang !== 'en' || !hasVerifiedMeaning(other)) continue;
    const meaning = other.meanings[0].trim();
    if (seen.has(normalize(meaning))) continue;
    seen.add(normalize(meaning));
    result.push(meaning);
  }
  return result;
}

export const englishWordToMeaning: ExerciseModule = {
  id: 'en.word-to-meaning',
  label: 'Word/cụm → nghĩa',
  description: 'Cho động từ hoặc cụm tiếng Anh, chọn nghĩa đúng.',
  languages: ['en'],
  mode: 'breadth',
  input: INPUT,
  unavailableHint:
    'Cần động từ hoặc cụm đã duyệt (verified) có nghĩa, và ít nhất 3 concept tiếng Anh đã duyệt khác để làm đáp án nhiễu.',
  isEligible: (concept, example, library) =>
    isEnglishWord(concept, example) &&
    hasVerifiedMeaning(concept) &&
    (posClass(concept.pos) === 'verb' || wordCount(concept.text) >= 2) &&
    distractorMeanings(concept, library).length >= CHOICES - 1,
  generate(concept, example, context): Exercise {
    const right = concept.meanings[0].trim();
    const wrong = shuffled(distractorMeanings(concept, context.library), context.rng).slice(0, CHOICES - 1);
    const options = shuffled([right, ...wrong], context.rng);
    return {
      ...base(concept, example),
      moduleId: 'en.word-to-meaning',
      title: 'Word/cụm → nghĩa',
      prompt: concept.text,
      // A real sentence gives the context (spec 5.2: "sau đó ghép vào ngữ cảnh").
      detail: example.isMinimal ? undefined : example.text,
      fields: [{ key: 'answer', label: 'Nghĩa', type: 'choice', options }],
      expected: { answer: [right] },
    };
  },
  grade: (answer, exercise) => gradeFields(answer, exercise, normalize),
};

// --------------------------------------------------------------- dictation

export const englishDictation: ExerciseModule = {
  id: 'en.dictation',
  label: 'Nghe chép (tiếng Anh)',
  description: 'Nghe phát âm rồi gõ lại đúng chính tả.',
  languages: ['en'],
  mode: 'breadth',
  input: INPUT,
  speech: SPEECH,
  unavailableHint: 'Cần concept tiếng Anh có ví dụ.',
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
  isEligible: (concept, example) => isEnglishWord(concept, example),
  generate(concept, example, context): Exercise {
    const target = dictationTarget(example, context.options.scope ?? 'highlight');
    return {
      ...base(concept, example),
      moduleId: 'en.dictation',
      title: 'Nghe và chép',
      prompt: 'Nghe rồi gõ lại đúng chính tả.',
      detail: hasVerifiedMeaning(concept) ? concept.meanings[0] : undefined,
      speak: { text: target, lang: SPEECH.tag },
      fields: [{ key: 'answer', label: 'Bạn nghe được', type: 'text' }],
      expected: { answer: [target] },
    };
  },
  grade: (answer, exercise) => gradeFields(answer, exercise, normalizeSentence),
};

export const englishModules: ExerciseModule[] = [
  englishCloze,
  englishMeaningToWord,
  englishWordToMeaning,
  englishDictation,
];
