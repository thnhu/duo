import type { Answer, Exercise, GradeResult } from './types';

// Spelling is what these drills test, so comparison is exact apart from
// surrounding/duplicate whitespace and Unicode composition (NFC): case,
// umlauts and ß all count.
export function normalizeAnswer(text: string | undefined): string {
  return (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

// Splits "Äpfel / Apfel" or "gegangen, gegangen" style alternatives into
// separate accepted answers.
export function splitAlternatives(value: string): string[] {
  return value
    .split(/\s*[/;,]\s*/)
    .map((v) => v.trim())
    .filter(Boolean);
}

// Every field must match one of its accepted answers.
export function gradeFields(
  answer: Answer,
  exercise: Exercise,
  normalize: (s: string) => string = normalizeAnswer,
): GradeResult {
  const perField: Record<string, boolean> = {};
  const expected: Record<string, string> = {};
  for (const field of exercise.fields) {
    const accepted = exercise.expected[field.key] ?? [];
    const given = normalize(answer[field.key] ?? '');
    perField[field.key] = given !== '' && accepted.some((a) => normalize(a) === given);
    expected[field.key] = accepted[0] ?? '';
  }
  return {
    correct: exercise.fields.every((f) => perField[f.key]),
    perField,
    expected,
  };
}
