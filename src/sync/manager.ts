import { db } from '../db/schema';
import { syncOnce, resetSyncState } from './engine';
import { activeSyncAdapter } from './index';
import { SYNC_TABLES, SyncError, type SyncAdapter, type SyncErrorKind, type SyncUser } from './types';

// Runs sync in the background (spec 6.3): after start-up, when the network
// comes back, when the app is reopened, after local edits, and every few
// minutes. Everything fails softly: a failure is shown as a status, local
// data is never touched, and nothing is retried in a tight loop.

export type SyncPhase =
  | 'unconfigured' // no provider setup on this device
  | 'signed-out'
  | 'idle' // signed in, nothing running
  | 'syncing'
  | 'error';

export interface SyncState {
  phase: SyncPhase;
  user: SyncUser | null;
  lastSyncAt: number | null;
  lastReport: { pushed: number; pulled: number } | null;
  error: { kind: SyncErrorKind; message: string } | null;
}

const LAST_SYNC_KEY = 'duo.sync.lastSyncAt';
const DEBOUNCE_MS = 5_000;
const INTERVAL_MS = 5 * 60_000;
// Minimum gap between two failed attempts started by timers/events.
const ERROR_BACKOFF_MS = 60_000;

type Listener = () => void;

export class SyncManager {
  private state: SyncState;
  private readonly listeners = new Set<Listener>();
  private running: Promise<void> | null = null;
  private started = false;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private lastFailureAt = 0;

  private readonly getAdapter: () => SyncAdapter;

  constructor(getAdapter: () => SyncAdapter) {
    this.getAdapter = getAdapter;
    const last = Number(localStorage.getItem(LAST_SYNC_KEY));
    this.state = {
      phase: this.getAdapter().isConfigured() ? 'signed-out' : 'unconfigured',
      user: null,
      lastSyncAt: Number.isFinite(last) && last > 0 ? last : null,
      lastReport: null,
      error: null,
    };
  }

  // useSyncExternalStore plumbing.
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = (): SyncState => this.state;

  private set(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  // Call once after the database is ready.
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    window.addEventListener('online', () => void this.syncNow(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.syncNow(false);
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncNow(false);
    }, INTERVAL_MS);
    // Local edits schedule a sync a few seconds later (batched).
    for (const [table] of SYNC_TABLES) {
      const hookTable = db.table(table);
      const trigger = () => this.scheduleSoon();
      hookTable.hook('creating', function () {
        this.onsuccess = trigger;
      });
      hookTable.hook('updating', function () {
        this.onsuccess = trigger;
      });
    }
    await this.refreshUser();
    if (this.state.phase === 'idle') await this.syncNow(false);
  }

  private scheduleSoon(): void {
    if (this.state.phase === 'unconfigured' || this.state.phase === 'signed-out') return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.syncNow(false), DEBOUNCE_MS);
  }

  private async refreshUser(): Promise<void> {
    const adapter = this.getAdapter();
    if (!adapter.isConfigured()) {
      this.set({ phase: 'unconfigured', user: null, error: null });
      return;
    }
    try {
      const user = await adapter.getUser();
      this.set({ phase: user ? 'idle' : 'signed-out', user, error: null });
    } catch (error) {
      this.fail(error);
      this.set({ phase: 'signed-out', user: null });
    }
  }

  // `manual` = PO pressed the button: ignore the error back-off.
  syncNow(manual = true): Promise<void> {
    if (this.running) return this.running;
    if (this.state.phase !== 'idle' && this.state.phase !== 'error') return Promise.resolve();
    if (!manual && Date.now() - this.lastFailureAt < ERROR_BACKOFF_MS) return Promise.resolve();
    if (!this.state.user) return Promise.resolve();

    this.running = (async () => {
      this.set({ phase: 'syncing', error: null });
      try {
        const report = await syncOnce(this.getAdapter());
        const now = Date.now();
        localStorage.setItem(LAST_SYNC_KEY, String(now));
        this.set({ phase: 'idle', lastSyncAt: now, lastReport: report, error: null });
      } catch (error) {
        this.fail(error);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  // Forget what was synced, then sync: this device sends every record again and
  // pulls everything from the start. Safe (newest `updatedAt` wins per record);
  // for when a device and the cloud have drifted apart.
  async resyncAll(): Promise<void> {
    if (this.running) await this.running;
    await resetSyncState();
    await this.syncNow(true);
  }

  private fail(error: unknown): void {
    const known = error instanceof SyncError ? error : new SyncError('other', String((error as Error)?.message ?? error));
    this.lastFailureAt = Date.now();
    this.set({
      phase: this.state.user ? 'error' : this.state.phase,
      error: { kind: known.kind, message: known.message },
    });
  }

  // --- setup and sign-in, used by the Settings screen ---

  configure(text: string): void {
    this.getAdapter().configure(text); // throws SyncError on bad text
    this.set({ phase: 'signed-out', error: null });
    void this.refreshUser();
  }

  async removeConfiguration(): Promise<void> {
    await this.signOut();
    this.getAdapter().clearConfiguration();
    this.set({ phase: 'unconfigured', user: null, error: null });
  }

  async signIn(email: string, password: string, createAccount: boolean): Promise<boolean> {
    return this.authenticate(() => this.getAdapter().signInWithEmail(email, password, createAccount));
  }

  async signInWithGoogle(): Promise<boolean> {
    const adapter = this.getAdapter();
    if (!adapter.signInWithGoogle) return false;
    return this.authenticate(() => adapter.signInWithGoogle!());
  }

  private async authenticate(login: () => Promise<SyncUser>): Promise<boolean> {
    try {
      const user = await login();
      this.set({ phase: 'idle', user, error: null });
      void this.syncNow(true);
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.state.user) await this.getAdapter().signOut();
    } catch {
      // Signing out locally is enough; ignore provider errors.
    }
    // The next account starts clean: everything is offered to it again.
    await resetSyncState();
    this.set({ phase: this.getAdapter().isConfigured() ? 'signed-out' : 'unconfigured', user: null, error: null });
  }
}

export const syncManager = new SyncManager(activeSyncAdapter);
