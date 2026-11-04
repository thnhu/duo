import { useSyncExternalStore } from 'react';
import { lookupQueue, type LookupQueueState } from '../../lookup';

// The queue runs in the background of the whole app; screens just read its
// state, so it keeps going when PO navigates elsewhere.
export function useLookupQueue(): LookupQueueState {
  return useSyncExternalStore(lookupQueue.subscribe, lookupQueue.getState);
}
