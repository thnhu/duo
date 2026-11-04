import { ModuleRegistry } from '../core/registry';
import { sm2 } from './sm2';
import type { Scheduler } from './types';

export * from './types';

// Schedulers register here; swapping the algorithm means registering another
// one and changing ACTIVE_SCHEDULER_ID (nothing else knows which is used).
export const schedulers = new ModuleRegistry<Scheduler>();
schedulers.register(sm2);

export const ACTIVE_SCHEDULER_ID = 'sm2';

export function activeScheduler(): Scheduler {
  return schedulers.get(ACTIVE_SCHEDULER_ID)!;
}
