import { getVerifiedAttributes } from '../../db/attributes';
import type { Concept, Example, ExampleAttributes } from '../../db/types';
import { expressionsIn } from '../../depth';
import { gradeFields, normalizeAnswer } from '../grade';
import type { Exercise, ExerciseLibrary, ExerciseModule } from '../types';
import { SCENE_ATTRIBUTE_ORDER, situationFor, type AttributeKey } from './situations';

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

export const englishDeepModules: ExerciseModule[] = [englishDeepSituation];
