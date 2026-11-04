import type { Concept, Lang, LookupSuggestion } from '../db/types';
import { LookupError, type LookupErrorKind, type LookupProvider } from './types';

// Background lookup queue (spec 6.5, journey J3): words are looked up one at
// a time with a gap between requests, results are saved as they arrive, and
// any service problem pauses the queue with the data left as it was. There
// is no automatic retry: PO presses "Thử lại".

export interface LookupQueueState {
  status: 'idle' | 'running' | 'paused';
  total: number;
  done: number;
  found: number;
  notFound: number;
  // Not looked up: phrases (only single words are sent) or no provider.
  skipped: number;
  error?: { kind: LookupErrorKind; message: string };
}

export interface LookupQueueDeps {
  getProvider(lang: Lang): LookupProvider | undefined;
  loadConcept(id: string): Promise<Concept | undefined>;
  saveSuggestion(id: string, suggestion: LookupSuggestion): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
  isOnline(): boolean;
}

const EMPTY: LookupQueueState = {
  status: 'idle',
  total: 0,
  done: 0,
  found: 0,
  notFound: 0,
  skipped: 0,
};

// Only single words leave the device (spec 3.7 / 6.5).
export function isSingleWord(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && !/\s/.test(t);
}

export class LookupQueue {
  private readonly deps: LookupQueueDeps;
  private pending: string[] = [];
  private state: LookupQueueState = EMPTY;
  private listeners = new Set<() => void>();
  private running = false;
  private abort: AbortController | null = null;
  private lastRequestAt = new Map<string, number>();

  constructor(deps: LookupQueueDeps) {
    this.deps = deps;
  }

  getState = (): LookupQueueState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(patch: Partial<LookupQueueState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  // Adds words to look up and starts working. A finished run's counters
  // start over; a run in progress just grows.
  enqueue(conceptIds: string[]): void {
    const fresh = conceptIds.filter((id) => !this.pending.includes(id));
    if (fresh.length === 0) return;
    const finished = this.state.status === 'idle';
    this.pending.push(...fresh);
    this.setState(
      finished
        ? { ...EMPTY, total: fresh.length }
        : { total: this.state.total + fresh.length },
    );
    void this.start();
  }

  // Starts, or resumes after a pause.
  async start(): Promise<void> {
    if (this.running || this.pending.length === 0) return;
    this.running = true;
    this.abort = new AbortController();
    this.setState({ status: 'running', error: undefined });
    try {
      await this.loop();
    } finally {
      this.running = false;
      this.abort = null;
    }
  }

  // User pressed stop: keep what is left so it can be resumed.
  stop(): void {
    this.abort?.abort();
    if (this.state.status === 'running') this.setState({ status: 'paused', error: undefined });
  }

  // Forget the rest of the queue.
  clear(): void {
    this.abort?.abort();
    this.pending = [];
    this.setState({ ...EMPTY });
  }

  private pause(error: LookupQueueState['error']) {
    this.setState({ status: 'paused', error });
  }

  private async loop(): Promise<void> {
    const signal = this.abort!.signal;
    while (this.pending.length > 0 && !signal.aborted) {
      if (!this.deps.isOnline()) {
        this.pause({ kind: 'network', message: 'Đang offline — tra cứu tạm dừng, các từ vẫn giữ nguyên.' });
        return;
      }

      const id = this.pending[0];
      const concept = await this.deps.loadConcept(id);
      if (!concept || concept.deletedAt !== undefined) {
        this.pending.shift();
        this.setState({ done: this.state.done + 1, skipped: this.state.skipped + 1 });
        continue;
      }

      const provider = this.deps.getProvider(concept.lang);
      if (!provider || !isSingleWord(concept.text)) {
        this.pending.shift();
        this.setState({ done: this.state.done + 1, skipped: this.state.skipped + 1 });
        continue;
      }

      // Space requests out per provider.
      const wait =
        (this.lastRequestAt.get(provider.id) ?? 0) + provider.minIntervalMs - this.deps.now();
      if (wait > 0) await this.deps.sleep(wait);
      if (signal.aborted) return;
      this.lastRequestAt.set(provider.id, this.deps.now());

      try {
        const result = await provider.lookup(concept.text.trim(), signal);
        if (signal.aborted) return;
        await this.deps.saveSuggestion(id, {
          ...result,
          provider: provider.id,
          fetchedAt: this.deps.now(),
        });
        this.pending.shift();
        this.setState({
          done: this.state.done + 1,
          found: this.state.found + (result.status === 'found' ? 1 : 0),
          notFound: this.state.notFound + (result.status === 'found' ? 0 : 1),
        });
      } catch (error) {
        if (signal.aborted) return;
        // The word stays at the front of the queue for the next attempt.
        if (error instanceof LookupError) {
          this.pause({ kind: error.kind, message: error.message });
        } else {
          this.pause({ kind: 'unavailable', message: 'Tra cứu gặp lỗi bất ngờ — thử lại sau.' });
        }
        return;
      }
    }
    if (!signal.aborted) this.setState({ status: 'idle' });
  }
}
