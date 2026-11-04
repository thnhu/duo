import type { AttributeValueSets, Lang } from '../db/types';
import type { TmrndRequest } from './types';

const LANGUAGE_NAME: Record<Lang, string> = { en: 'English', de: 'German' };

// Shared by providers. The definitions repeat the project's glossary on
// purpose: Tone is formality, Register is the field of use (easy to mix up).
export function buildInstruction(allowed: AttributeValueSets): string {
  const list = (values: string[]) => values.map((v) => `"${v}"`).join(', ');
  return [
    'You label how a language learner should use a phrase, based on ONE example sentence.',
    'Give a value for five attributes. For each attribute choose ONLY from its allowed list.',
    `- tone (level of formality): ${list(allowed.tone)}`,
    `- mode (spoken or written use): ${list(allowed.mode)}`,
    `- register (field or domain of use, NOT formality): ${list(allowed.register)}`,
    `- nuance (connotation): ${list(allowed.nuance)}`,
    `- dialect (regional variety): ${list(allowed.dialect)}`,
    'Label the highlighted phrase as used in the sentence; the rest of the sentence is only context.',
    'If the evidence is not enough, answer "Neutral" and say so in the reason. Do not guess.',
    'Never invent a value outside the lists. If something like "slang" seems relevant, mention it in the reason only.',
    'Keep every reason to one short sentence. confidence is a number from 0 to 1.',
  ].join('\n');
}

export function buildExampleText(request: TmrndRequest): string {
  const { text, highlight, lang } = request;
  const phrase = highlight ? text.slice(highlight.start, highlight.end) : text;
  return [
    `Language: ${LANGUAGE_NAME[lang]}`,
    `Sentence: ${text}`,
    `Highlighted phrase: ${phrase}`,
  ].join('\n');
}
