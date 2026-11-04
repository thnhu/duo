import type { Example, ExampleAttributes } from './types';

// Spec 6.6 / 11: graded exercises (S1, Bản 3) may only use TMRND labels the
// PO has verified. Suggested (AI) or empty labels never become answers, so
// every consumer must go through this helper instead of reading
// `example.attributes` directly.
export function getVerifiedAttributes(example: Example): ExampleAttributes | null {
  return example.attributesStatus === 'verified' ? example.attributes : null;
}
