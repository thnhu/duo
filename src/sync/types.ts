import type { RegistrableModule } from '../core/registry';

// SyncAdapter (spec 6.3, section 7): the sync service sits behind this
// interface so the provider can be swapped. The engine knows nothing about
// Firebase; the adapter knows nothing about Dexie tables.

// Tables that are synced. Not synced on purpose:
//  - settings: a fresh device creates default settings stamped "now", which
//    would beat PO's real ones under last-write-wins (revisit once Settings
//    has an editing UI);
//  - importBatches: undo data, only meaningful on the device that imported;
//  - syncMeta and the search index: derived / per-device.
export const SYNC_TABLES = [
  ['dictionaries', 'id'],
  ['concepts', 'id'],
  ['examples', 'id'],
  ['exampleLinks', 'id'],
  ['conceptLinks', 'id'],
  ['wordSets', 'id'],
  ['lessons', 'id'],
  ['passages', 'id'],
  ['choiceSets', 'id'],
  ['scheduleStates', 'exampleId'],
  ['reviewLogs', 'id'],
  ['importMappings', 'id'],
] as const;

export type SyncTableName = (typeof SYNC_TABLES)[number][0];

// One record on the wire: the full row as JSON text (Firestore refuses
// `undefined` values, and the engine owns the row shape anyway).
export interface RemoteRecord {
  table: SyncTableName;
  id: string;
  // The row's own updatedAt (reviewLogs: their timestamp). Last write wins.
  updatedAt: number;
  payload: string;
}

export interface PullResult {
  records: RemoteRecord[];
  // Pass this back next time to get only what changed since.
  cursor: number;
}

export interface SyncUser {
  id: string;
  label: string;
}

export type SyncErrorKind = 'offline' | 'auth' | 'quota' | 'other';

export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  constructor(kind: SyncErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface SyncAdapter extends RegistrableModule {
  label: string;
  // Has the provider been set up on this device (e.g. a Firebase config)?
  isConfigured(): boolean;
  // Per-device setup text (for Firebase: the firebaseConfig block). Stored
  // locally only. Throws SyncError if the text is not understood.
  configure(text: string): void;
  clearConfiguration(): void;
  getUser(): Promise<SyncUser | null>;
  signInWithEmail(email: string, password: string, createAccount: boolean): Promise<SyncUser>;
  // Optional: not every provider offers it.
  signInWithGoogle?(): Promise<SyncUser>;
  signOut(): Promise<void>;
  // Throw SyncError on failure; never leave the data half-written without
  // saying so.
  push(records: RemoteRecord[]): Promise<void>;
  pull(cursor: number): Promise<PullResult>;
}
