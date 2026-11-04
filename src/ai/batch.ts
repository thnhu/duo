import type { Example } from '../db/types';
import { suggestForExample } from './suggest';
import { AiError, type AiProvider } from './types';

// An example worth asking the AI about: a real sentence tied to a concept,
// with no labels yet. Minimal examples (just the word) carry no context.
export function needsSuggestion(example: Example): boolean {
  return (
    example.deletedAt === undefined &&
    example.targetConceptId !== undefined &&
    !example.isMinimal &&
    example.attributesStatus === 'empty'
  );
}

export interface BatchProgress {
  done: number;
  total: number;
}

export interface BatchResult {
  done: number;
  failed: number;
  total: number;
  // Why the run stopped early, if it did. Remaining examples are untouched.
  stoppedBy?: AiError;
  aborted: boolean;
}

export interface BatchOptions {
  provider: AiProvider;
  examples: Example[];
  onProgress?: (progress: BatchProgress) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

// Runs one example at a time, spaced by the provider's minimum interval, and
// only for the examples the PO chose (spec 6.6, G13). A network / quota /
// key problem stops the whole run at once and is not retried (the PO
// presses the button again later); a bad answer for a single example only
// skips that example.
export async function runSuggestionBatch(options: BatchOptions): Promise<BatchResult> {
  const { provider, examples, onProgress, signal } = options;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const result: BatchResult = { done: 0, failed: 0, total: examples.length, aborted: false };

  for (let i = 0; i < examples.length; i++) {
    if (signal?.aborted) {
      result.aborted = true;
      break;
    }
    if (i > 0) await sleep(provider.minIntervalMs);
    if (signal?.aborted) {
      result.aborted = true;
      break;
    }
    try {
      await suggestForExample(examples[i], provider, signal);
      result.done++;
    } catch (error) {
      if (signal?.aborted) {
        result.aborted = true;
        break;
      }
      if (error instanceof AiError && error.kind === 'unavailable') {
        result.failed++;
      } else {
        result.stoppedBy = error instanceof AiError ? error : new AiError('unavailable', String(error));
        break;
      }
    }
    onProgress?.({ done: result.done + result.failed, total: result.total });
  }
  return result;
}
