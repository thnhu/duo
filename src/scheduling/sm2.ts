import type { Scheduler } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
// A wrong answer comes back soon, in the same sitting or later that day (G1).
export const RETRY_DELAY_MS = 10 * 60 * 1000;
const START_EASE = 2.5;
const MIN_EASE = 1.3;

// Simple SM-2 with a right/wrong answer instead of a 0-5 grade:
//   right: interval 1 day -> 6 days -> previous interval x ease
//   wrong: interval resets, ease drops 0.2 (floor 1.3), back in 10 minutes
// A right answer given before the example is due (extra practice) does not
// push the schedule further out.
export const sm2: Scheduler = {
  id: 'sm2',
  label: 'SM-2 đơn giản',
  schedule(previous, { exampleId, correct, now }) {
    const base = previous ?? {
      exampleId,
      due: now,
      intervalDays: 0,
      ease: START_EASE,
      lapses: 0,
      updatedAt: now,
    };
    const ease = base.ease ?? START_EASE;

    if (!correct) {
      return {
        ...base,
        intervalDays: 0,
        ease: Math.max(MIN_EASE, Math.round((ease - 0.2) * 100) / 100),
        lapses: base.lapses + 1,
        due: now + RETRY_DELAY_MS,
        updatedAt: now,
      };
    }

    if (previous && previous.due > now) return previous;

    const intervalDays =
      base.intervalDays <= 0 ? 1 : base.intervalDays <= 1 ? 6 : Math.round(base.intervalDays * ease);
    return { ...base, ease, intervalDays, due: now + intervalDays * DAY_MS, updatedAt: now };
  },
};
