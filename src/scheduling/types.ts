import type { RegistrableModule } from '../core/registry';
import type { ScheduleState } from '../db/types';

// Scheduler (spec D4): the spaced-repetition algorithm is a replaceable
// module. The unit it schedules is the example, not the concept.

export interface ScheduleInput {
  exampleId: string;
  correct: boolean;
  now: number;
}

export interface Scheduler extends RegistrableModule {
  label: string;
  // Next state after an answer. `previous` is undefined the first time the
  // example is ever answered.
  schedule(previous: ScheduleState | undefined, input: ScheduleInput): ScheduleState;
}
