import { createId } from '../../core/id';
import { createDefaultAttributes } from '../../db/defaults';
import { findConceptByExactText } from '../../db/queries';
import { conceptRepository, exampleRepository } from '../../db/repositories';
import type { Concept, Example, Lang } from '../../db/types';
import { normalizeSelection, textForSelection, type Selection } from './highlight';

function newConcept(dictionaryId: string, lang: Lang, text: string): Concept {
  const now = Date.now();
  return {
    id: createId(),
    dictionaryId,
    lang,
    text,
    meanings: [],
    verification: 'unverified',
    source: { type: 'quick-add' },
    status: 'loaded',
    createdAt: now,
    updatedAt: now,
  };
}

function newExample(
  dictionaryId: string,
  text: string,
  overrides: Partial<Example> = {},
): Example {
  const now = Date.now();
  return {
    id: createId(),
    dictionaryId,
    text,
    attributes: createDefaultAttributes(),
    attributesStatus: 'empty',
    verification: 'unverified',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export type SaveOutcome = 'created' | 'duplicate';

// J2 Cách 1: a bare word/phrase, no sentence. Spec C4 — a concept always
// needs at least one example, so a minimal one (the concept's own text)
// is created alongside it.
export async function saveQuickWord(
  dictionaryId: string,
  lang: Lang,
  text: string,
): Promise<{ outcome: SaveOutcome; concept: Concept }> {
  const trimmed = text.trim();
  const existing = await findConceptByExactText(dictionaryId, trimmed);
  if (existing) {
    return { outcome: 'duplicate', concept: existing };
  }

  const concept = newConcept(dictionaryId, lang, trimmed);
  await conceptRepository.add(concept);

  const minimalExample = newExample(dictionaryId, trimmed, {
    targetConceptId: concept.id,
    isMinimal: true,
  });
  await exampleRepository.add(minimalExample);

  return { outcome: 'created', concept };
}

export type ConceptOutcome = 'created' | 'linked';

async function resolveConceptForPhrase(
  dictionaryId: string,
  lang: Lang,
  phrase: string,
): Promise<{ outcome: ConceptOutcome; concept: Concept }> {
  const existing = await findConceptByExactText(dictionaryId, phrase);
  if (existing) return { outcome: 'linked', concept: existing };

  const concept = newConcept(dictionaryId, lang, phrase);
  await conceptRepository.add(concept);
  return { outcome: 'created', concept };
}

// J2 Cách 2 / J10: a full sentence with one highlighted phrase — the
// highlighted phrase becomes (or is linked to) the concept; the rest of
// the sentence is just context (spec C7).
export async function saveSentenceWithHighlight(
  dictionaryId: string,
  lang: Lang,
  sentenceText: string,
  rawSelection: Selection,
): Promise<{ conceptOutcome: ConceptOutcome; concept: Concept; example: Example } | null> {
  const selection = normalizeSelection(sentenceText, rawSelection);
  if (!selection) return null;

  const phrase = textForSelection(sentenceText, selection);
  const { outcome: conceptOutcome, concept } = await resolveConceptForPhrase(
    dictionaryId,
    lang,
    phrase,
  );

  const example = newExample(dictionaryId, sentenceText, {
    targetConceptId: concept.id,
    highlight: selection,
  });
  await exampleRepository.add(example);

  return { conceptOutcome, concept, example };
}

// J2 Cách 3: sentence saved without highlighting yet — goes to the Hộp
// chờ duyệt (inbox) as a "câu chưa gắn concept" (spec C7).
export async function saveSentenceToInbox(
  dictionaryId: string,
  sentenceText: string,
): Promise<Example> {
  const example = newExample(dictionaryId, sentenceText);
  await exampleRepository.add(example);
  return example;
}

// From the inbox: highlight a phrase in an already-saved unresolved
// sentence, turning it into a real linked example in place.
export async function resolveInboxExample(
  example: Example,
  lang: Lang,
  rawSelection: Selection,
): Promise<{ conceptOutcome: ConceptOutcome; concept: Concept } | null> {
  const selection = normalizeSelection(example.text, rawSelection);
  if (!selection) return null;

  const phrase = textForSelection(example.text, selection);
  const { outcome: conceptOutcome, concept } = await resolveConceptForPhrase(
    example.dictionaryId,
    lang,
    phrase,
  );

  await exampleRepository.update(example.id, {
    targetConceptId: concept.id,
    highlight: selection,
  });

  return { conceptOutcome, concept };
}
