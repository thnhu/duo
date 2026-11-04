import type { RegistrableModule } from '../core/registry';
import type { Lang, LookupSuggestion } from '../db/types';

// LookupProvider (spec 6.5 / section 7): one per language, replaceable.
// Only a single word is ever sent to a provider.

export type LookupResult = Omit<LookupSuggestion, 'provider' | 'fetchedAt'>;

export type LookupErrorKind =
  // No connection / request blocked.
  | 'network'
  // The service asked us to slow down (HTTP 429) or its quota is used up.
  | 'rate-limit'
  // The service is down or answered nonsense.
  | 'unavailable';

// A failure that should pause lookups and leave data untouched (principle 1:
// external services fail softly).
export class LookupError extends Error {
  readonly kind: LookupErrorKind;
  // Seconds the service asked us to wait, if it said.
  readonly retryAfterSeconds?: number;

  constructor(kind: LookupErrorKind, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'LookupError';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface LookupProvider extends RegistrableModule {
  languages: Lang[];
  // Minimum gap between two requests to this service, in ms.
  minIntervalMs: number;
  // Resolves with `status: 'not-found'` when the word simply isn't there;
  // throws LookupError when the service can't be used right now.
  lookup(word: string, signal?: AbortSignal): Promise<LookupResult>;
}

export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;

// Shared HTTP handling for providers.
export async function fetchOrThrow(
  fetchFn: FetchLike,
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchFn(url, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new LookupError('network', 'Không kết nối được tới dịch vụ tra cứu.');
  }
  if (response.status === 429) {
    const retry = Number(response.headers.get('retry-after'));
    throw new LookupError(
      'rate-limit',
      'Dịch vụ tra cứu báo đã hết lượt tạm thời.',
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
  }
  if (response.status >= 500) {
    throw new LookupError('unavailable', `Dịch vụ tra cứu đang lỗi (${response.status}).`);
  }
  return response;
}
