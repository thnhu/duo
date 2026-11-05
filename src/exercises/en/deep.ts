import { getVerifiedAttributes } from '../../db/attributes';
import { defaultAttributeValueSets } from '../../db/defaults';
import type { Concept, Example, ExampleAttributes } from '../../db/types';
import { expressionsIn } from '../../depth';
import { gradeFields, normalizeAnswer } from '../grade';
import type { Exercise, ExerciseLibrary, ExerciseModule } from '../types';
import { ATTRIBUTE_HINT, ATTRIBUTE_TITLE, SCENE_ATTRIBUTE_ORDER, situationFor, type AttributeKey } from './situations';

// English "Sâu" drills (spec 5.2, M11d). In depth mode a concept is an IDEA
// and its examples are different ways of saying it, each with its own TMRND
// labels (tri-fold, spec 1.4). This drill gives a scene and PO picks the way
// of saying the idea that fits it.
//
// Fairness rule: the scene is built from ONE label on which the right way
// differs from every wrong choice, so exactly one choice fits. Only
// `verified` labels are used (suggested or empty labels never become answers).

const CHOICES = 4; // the right way + up to 3 others
const normalize = (s: string) => normalizeAnswer(s).toLowerCase();

const KEYS: AttributeKey[] = ['tone', 'mode', 'register', 'nuance', 'dialect'];
const comboOf = (a: ExampleAttributes) => KEYS.map((k) => a[k]).join('|');

function shuffled<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface SceneChoice {
  // Right way first, then the wrong ones (not shuffled).
  options: Example[];
  key: AttributeKey;
  value: string;
  scene: string;
}

// Attributes that can set a scene on which `target` differs from every one of
// `others`: the scene fits the target and none of them.
function sceneKeys(target: ExampleAttributes, others: ExampleAttributes[]): AttributeKey[] {
  return SCENE_ATTRIBUTE_ORDER.filter(
    (key) => situationFor(key, target[key]) !== undefined && others.every((o) => o[key] !== target[key]),
  );
}

// Picks the wrong choices and the label the scene is built from. Null when
// the concept has no other way of saying it that the target can be told apart
// from (fewer than two usable choices).
export function buildSceneChoice(
  concept: Concept,
  target: Example,
  library: ExerciseLibrary | undefined,
  rng: () => number,
): SceneChoice | null {
  const targetAttrs = getVerifiedAttributes(target);
  if (!targetAttrs || !library?.examples) return null;

  // Distinct ways only: two expressions with identical labels cannot be told
  // apart by a scene, and equal texts would make duplicate buttons.
  const seenCombos = new Set([comboOf(targetAttrs)]);
  const seenTexts = new Set([normalize(target.text)]);
  const others: Array<{ example: Example; attrs: ExampleAttributes }> = [];
  for (const e of expressionsIn(concept.id, library.examples, library.exampleLinks ?? [])) {
    if (e.id === target.id) continue;
    const attrs = getVerifiedAttributes(e);
    if (!attrs) continue;
    const combo = comboOf(attrs);
    if (seenCombos.has(combo) || seenTexts.has(normalize(e.text))) continue;
    seenCombos.add(combo);
    seenTexts.add(normalize(e.text));
    others.push({ example: e, attrs });
  }

  const chosen: typeof others = [];
  for (const candidate of shuffled(others, rng)) {
    if (chosen.length >= CHOICES - 1) break;
    // Keep a wrong choice only if a scene can still single the target out.
    if (sceneKeys(targetAttrs, [...chosen, candidate].map((c) => c.attrs)).length > 0) chosen.push(candidate);
  }
  if (chosen.length === 0) return null;

  const keys = sceneKeys(targetAttrs, chosen.map((c) => c.attrs));
  // A scene about a marked value ("Informal") says more than "Neutral".
  const key = keys.find((k) => targetAttrs[k] !== 'Neutral') ?? keys[0];
  const value = targetAttrs[key] as string;
  return {
    options: [target, ...chosen.map((c) => c.example)],
    key,
    value,
    scene: situationFor(key, value)!,
  };
}

export const englishDeepSituation: ExerciseModule = {
  id: 'en.deep-situation',
  label: 'Chọn cách nói hợp ngữ cảnh (Sâu)',
  description: 'Cho một tình huống, chọn cách diễn đạt phù hợp nhất cho cùng một ý.',
  languages: ['en'],
  mode: 'depth',
  // Choice buttons only, but the answer language is declared like every `en.*` drill.
  input: { lang: 'en' },
  unavailableHint:
    'Cần một concept Sâu có ít nhất 2 cách diễn đạt đã gắn nhãn TMRND khác nhau (ở Tone, Register, Mode, Nuance hoặc Dialect). Thêm cách diễn đạt và gắn nhãn ở màn concept.',
  isEligible: (concept, example, library) =>
    concept.lang === 'en' &&
    concept.mode === 'depth' &&
    example.targetConceptId === concept.id &&
    buildSceneChoice(concept, example, library, () => 0.5) !== null,
  generate(concept, example, context): Exercise {
    const choice = buildSceneChoice(concept, example, context.library, context.rng);
    if (!choice) throw new Error('No scene for this expression: check isEligible first.');
    const options = shuffled(choice.options.map((e) => e.text.trim()), context.rng);
    const meaning = concept.meanings[0]?.trim();
    return {
      moduleId: 'en.deep-situation',
      conceptId: concept.id,
      exampleId: example.id,
      title: 'Chọn cách nói hợp ngữ cảnh',
      prompt: choice.scene,
      detail: `Ý cần diễn đạt: ${concept.text}${meaning ? ` (${meaning})` : ''}`,
      fields: [{ key: 'answer', label: 'Cách nói phù hợp nhất', type: 'choice', options }],
      expected: { answer: [example.text.trim()] },
    };
  },
  grade: (answer, exercise) => gradeFields(answer, exercise, normalize),
};

// ------------------------------------------------------------ S1: labelling

const LABEL_COUNTS = [1, 2, 3, 5];
const DEFAULT_LABEL_COUNT = 2;

// How many labels to ask about each time (configurable per session). A value
// that is not one of the offered counts falls back to the default.
export function labelCount(option: string | undefined): number {
  const n = Number(option);
  return LABEL_COUNTS.includes(n) ? n : DEFAULT_LABEL_COUNT;
}

// Which labels to ask about: random, but if the expression has any marked
// (non-Neutral) label at least one of them is asked, because a question made
// only of "Neutral" answers teaches nothing.
export function pickLabelKeys(attrs: ExampleAttributes, count: number, rng: () => number): AttributeKey[] {
  const picked = shuffled(KEYS, rng).slice(0, Math.min(count, KEYS.length));
  const marked = KEYS.filter((k) => attrs[k] !== 'Neutral');
  if (marked.length > 0 && !picked.some((k) => marked.includes(k))) {
    picked[picked.length - 1] = shuffled(marked, rng)[0];
  }
  return KEYS.filter((k) => picked.includes(k)); // fixed display order
}

export const englishDeepLabel: ExerciseModule = {
  id: 'en.deep-label',
  label: 'Gắn nhãn cách diễn đạt (Sâu)',
  description: 'Cho một cách diễn đạt, chọn nhãn Tone, Mode, Register, Nuance, Dialect của nó.',
  languages: ['en'],
  mode: 'depth',
  input: { lang: 'en' },
  unavailableHint:
    'Cần một cách diễn đạt của concept Sâu mà bạn đã gắn nhãn TMRND (nhãn chưa duyệt không được dùng làm đáp án). Gắn nhãn ở màn Sửa / gắn nhãn.',
  options: [
    {
      id: 'count',
      label: 'Hỏi mấy nhãn mỗi câu',
      choices: LABEL_COUNTS.map((n) => ({ value: String(n), label: String(n) })),
      default: String(DEFAULT_LABEL_COUNT),
    },
  ],
  // Graded against the labels PO verified: nothing else can be an answer.
  isEligible: (concept, example) =>
    concept.lang === 'en' &&
    concept.mode === 'depth' &&
    example.targetConceptId === concept.id &&
    getVerifiedAttributes(example) !== null,
  generate(concept, example, context): Exercise {
    const attrs = getVerifiedAttributes(example);
    if (!attrs) throw new Error('No verified labels: check isEligible first.');
    const sets = context.library?.valueSets ?? defaultAttributeValueSets;
    const keys = pickLabelKeys(attrs, labelCount(context.options.count), context.rng);
    const meaning = concept.meanings[0]?.trim();
    return {
      moduleId: 'en.deep-label',
      conceptId: concept.id,
      exampleId: example.id,
      title: 'Gắn nhãn cách diễn đạt',
      prompt: example.text.trim(),
      detail: `Cách nói cho ý: ${concept.text}${meaning ? ` (${meaning})` : ''}`,
      fields: keys.map((key) => {
        const right = attrs[key] as string;
        const offered = (sets[key] as string[]).includes(right) ? (sets[key] as string[]) : [...sets[key], right];
        return {
          key,
          label: `${ATTRIBUTE_TITLE[key]} (${ATTRIBUTE_HINT[key]})`,
          type: 'choice' as const,
          options: offered,
        };
      }),
      expected: Object.fromEntries(keys.map((key) => [key, [attrs[key] as string]])),
    };
  },
  grade: (answer, exercise) => gradeFields(answer, exercise, normalize),
};

export const englishDeepModules: ExerciseModule[] = [englishDeepSituation, englishDeepLabel];
