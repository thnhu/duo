import type { RegistrableModule } from '../core/registry';
import type { AttributeValueSets, ExampleHighlight, Lang } from '../db/types';

// AiProvider (spec 6.6 / section 7): text in, JSON out, replaceable. The
// only job is to suggest TMRND labels for ONE example the PO asked about.
// Nothing here ever becomes a graded answer: results are stored as
// `suggestedAttributes` and need the PO's acceptance (principle 8).

export type AiErrorKind =
  // No API key on this device, or AI switched off.
  | 'not-configured'
  // No connection / request blocked.
  | 'network'
  // Free quota used up or the service asked us to slow down (HTTP 429).
  | 'rate-limit'
  // The key was rejected.
  | 'auth'
  // Service down, unknown model, or an answer we cannot use.
  | 'unavailable';

// A failure that leaves all data untouched (principle 1: fail softly).
export class AiError extends Error {
  readonly kind: AiErrorKind;
  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
  }
}

export interface TmrndRequest {
  apiKey: string;
  model: string;
  lang: Lang;
  // The full example text and, if any, the phrase being learned in it.
  text: string;
  highlight?: ExampleHighlight;
  // Allowed values per attribute: the model may only pick from these.
  allowed: AttributeValueSets;
}

// What a provider hands back, before our own validation: one entry per
// attribute, value NOT yet checked against the allowed set.
export interface RawTmrndAttribute {
  value?: unknown;
  reason?: unknown;
  confidence?: unknown;
}
export type RawTmrnd = Partial<Record<keyof AttributeValueSets, RawTmrndAttribute>>;

export interface AiProvider extends RegistrableModule {
  label: string;
  // Used when Settings has no model chosen. Never hard-wired elsewhere, as
  // free-tier model names change over time.
  defaultModel: string;
  // Minimum gap between two requests, in ms (free tiers limit per minute).
  minIntervalMs: number;
  suggestTmrnd(request: TmrndRequest, signal?: AbortSignal): Promise<RawTmrnd>;
}
