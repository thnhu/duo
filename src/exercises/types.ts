import type { RegistrableModule } from '../core/registry';
import type { AttributeValueSets, Concept, Example, ExampleLink, Lang, StudyMode } from '../db/types';

// ExerciseModule (spec section 7): every exercise type is a module behind
// this one interface, registered in a registry. The runner and the screens
// know nothing about German dictation, genders or verbs.

export interface FieldSpec {
  key: string;
  label: string;
  // 'choice' renders buttons from `options`; 'text' renders a text box.
  type: 'text' | 'choice';
  options?: string[];
}

export interface Exercise {
  moduleId: string;
  conceptId: string;
  exampleId: string;
  // Short name of the drill, e.g. "Nghe và chép".
  title: string;
  // The main thing shown (a word, a sentence, an instruction).
  prompt: string;
  // Secondary line (meaning hint, tense and person...).
  detail?: string;
  // Text to read aloud with the device voice, if any.
  speak?: { text: string; lang: string };
  fields: FieldSpec[];
  // Accepted answers per field key; the first is shown when PO is wrong.
  expected: Record<string, string[]>;
  // A question that asks several examples at once (a passage with many gaps):
  // one entry per gap field, so each gap is logged, scheduled and counted
  // towards acquisition on its own example. Absent = the single example above.
  parts?: ExercisePart[];
  // A passage drill draws its answer boxes inside the text: the passage cut
  // into plain text and gap fields (`field` is a key of `fields`). When set,
  // the screen shows the passage with the boxes in place instead of a prompt
  // followed by a list of boxes.
  segments?: Array<{ text: string } | { field: string }>;
}

export interface ExercisePart {
  field: string;
  conceptId: string;
  exampleId: string;
}

export type Answer = Record<string, string>;

export interface GradeResult {
  correct: boolean;
  perField: Record<string, boolean>;
  // What to show as the right answer, per field.
  expected: Record<string, string>;
}

export interface ModuleOptionChoice {
  value: string;
  label: string;
}

// Per-module setting PO can change before a session (e.g. dictation:
// phrase only or whole sentence).
export interface ModuleOption {
  id: string;
  label: string;
  choices: ModuleOptionChoice[];
  default: string;
}

// What a module needs from the screens, declared by the module itself so the
// screens stay free of any one language (spec section 7: languages are
// configuration, not hard-coded).
export interface SpeechRequirement {
  // BCP-47 tag of the voice the drill reads aloud with, e.g. "de-DE".
  tag: string;
  // Language name for messages, e.g. "tiếng Đức".
  label: string;
}

export interface InputConfig {
  // `lang` attribute of the answer box (spelling/keyboard hints).
  lang: string;
  // One-tap buttons for characters that are hard to type on a phone.
  specialKeys?: string[];
}

// Other words a drill may draw on (e.g. wrong choices for a meaning quiz).
// Supplied by the runner; a module must cope with it being absent.
export interface ExerciseLibrary {
  concepts: Concept[];
  // Depth drills: a concept's ways of saying it are its own examples plus
  // the examples linked to it.
  examples?: Example[];
  exampleLinks?: ExampleLink[];
  // The TMRND value sets PO configured (labelling drills offer these).
  valueSets?: AttributeValueSets;
}

export interface ExerciseContext {
  rng: () => number;
  options: Record<string, string>;
  library?: ExerciseLibrary;
}

export interface ExerciseModule extends RegistrableModule {
  label: string;
  description: string;
  languages: Lang[];
  mode: StudyMode;
  options?: ModuleOption[];
  // Set when the drill reads text aloud: the Learn screen then checks the
  // device has such a voice and warns/disables the drill if not.
  speech?: SpeechRequirement;
  // How the answer box behaves for this language.
  input?: InputConfig;
  // Shown when no word has the data this drill needs.
  unavailableHint?: string;
  // True for drills built on a passage's gap examples (and only those); every
  // other drill ignores passage gaps, which are not standalone sentences.
  passage?: boolean;
  // Can this concept (with this example) be drilled? A noun without a
  // gender, for example, can't be used for the gender drill.
  isEligible(concept: Concept, example: Example, library?: ExerciseLibrary): boolean;
  generate(concept: Concept, example: Example, context: ExerciseContext): Exercise;
  // Reaction time is measured by the core, never by the module.
  grade(answer: Answer, exercise: Exercise): GradeResult;
}
