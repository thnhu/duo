import { SETTINGS_ID } from '../db/defaults';
import { conceptRepository, exampleRepository, settingsRepository } from '../db/repositories';
import type {
  AttributeValueSets,
  Example,
  ExampleAttributes,
  SuggestedAttributes,
} from '../db/types';
import { loadApiKey, recordCall } from './local';
import {
  AiError,
  type AiProvider,
  type RawTmrnd,
} from './types';

const KEYS = ['tone', 'mode', 'register', 'nuance', 'dialect'] as const;

// The provider's answer is only trusted after this check: a value outside
// the PVO sets is dropped (the AI may not create values, spec 6.6), never
// coerced. If nothing usable is left, the call counts as a failure.
export function validateSuggestion(
  raw: RawTmrnd,
  allowed: AttributeValueSets,
  providerId: string,
  now = Date.now(),
): SuggestedAttributes {
  const result: SuggestedAttributes = { provider: providerId, suggestedAt: now };
  let kept = 0;
  for (const key of KEYS) {
    const item = raw[key];
    if (!item || typeof item.value !== 'string') continue;
    const value = item.value;
    if (!(allowed[key] as string[]).includes(value)) continue;
    const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
    const confidence =
      typeof item.confidence === 'number' && Number.isFinite(item.confidence)
        ? Math.min(1, Math.max(0, item.confidence))
        : undefined;
    (result as unknown as Record<string, unknown>)[key] = {
      value,
      reason,
      ...(confidence !== undefined ? { confidence } : {}),
    };
    kept++;
  }
  if (kept === 0) throw new AiError('unavailable', 'AI không trả về nhãn hợp lệ nào.');
  return result;
}

// Asks for suggestions for ONE example (the PO pressed the button or chose
// a batch). The result is stored as `suggestedAttributes`. An example that
// is already `verified` stays verified: a new suggestion never downgrades
// or overwrites labels the PO accepted.
export async function suggestForExample(
  example: Example,
  provider: AiProvider,
  signal?: AbortSignal,
): Promise<SuggestedAttributes> {
  const settings = await settingsRepository.getById(SETTINGS_ID);
  if (!settings?.aiProviderConfig.enabled) {
    throw new AiError('not-configured', 'AI đang tắt. Bật trong Cài đặt → AI gợi ý nhãn.');
  }
  const apiKey = loadApiKey();
  if (!apiKey) throw new AiError('not-configured', 'Chưa nhập khóa API trên máy này (Cài đặt → AI gợi ý nhãn).');

  const concept = example.targetConceptId
    ? await conceptRepository.getById(example.targetConceptId)
    : undefined;
  if (!concept) throw new AiError('unavailable', 'Example chưa gắn concept, hãy tô sáng cụm trước.');

  recordCall();
  const raw = await provider.suggestTmrnd(
    {
      apiKey,
      model: settings.aiProviderConfig.model?.trim() || provider.defaultModel,
      lang: concept.lang,
      text: example.text,
      highlight: example.highlight,
      allowed: settings.attributeValueSets,
    },
    signal,
  );
  const suggestion = validateSuggestion(raw, settings.attributeValueSets, provider.id);

  await exampleRepository.update(example.id, {
    suggestedAttributes: suggestion,
    ...(example.attributesStatus === 'empty' ? { attributesStatus: 'suggested' as const } : {}),
  });
  return suggestion;
}

// Turn the suggested values into the example's real labels. Attributes the
// AI left out keep their current value. This is the PO accepting them.
export function attributesFromSuggestion(
  current: ExampleAttributes,
  suggestion: SuggestedAttributes,
): ExampleAttributes {
  const next = { ...current };
  for (const key of KEYS) {
    const item = suggestion[key];
    if (item) (next as Record<string, string>)[key] = item.value;
  }
  return next;
}

export async function acceptSuggestion(example: Example): Promise<void> {
  if (!example.suggestedAttributes) return;
  await exampleRepository.update(example.id, {
    attributes: attributesFromSuggestion(example.attributes, example.suggestedAttributes),
    attributesStatus: 'verified',
    suggestedAttributes: undefined,
  });
}

// PO rejects the suggestion: drop it; labels fall back to empty only if
// nothing had been verified.
export async function dismissSuggestion(example: Example): Promise<void> {
  await exampleRepository.update(example.id, {
    suggestedAttributes: undefined,
    ...(example.attributesStatus === 'suggested' ? { attributesStatus: 'empty' as const } : {}),
  });
}
