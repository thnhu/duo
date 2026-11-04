import { ModuleRegistry } from '../core/registry';
import { firebaseAdapter } from './firebase';
import type { SyncAdapter } from './types';

export * from './types';

// Sync providers register here (spec section 7). Screens and the manager ask
// for the active adapter and never import Firebase directly.
export const syncAdapters = new ModuleRegistry<SyncAdapter>();
syncAdapters.register(firebaseAdapter);

export const ACTIVE_SYNC_ADAPTER_ID = 'firebase';

export function activeSyncAdapter(): SyncAdapter {
  return syncAdapters.get(ACTIVE_SYNC_ADAPTER_ID)!;
}
