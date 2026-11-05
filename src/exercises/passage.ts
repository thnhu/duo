import type { Concept, Example, Lang } from '../db/types';
import { gapsIn } from '../passages';
import { gradeFields } from './grade';
import type { Exercise, ExerciseModule, FieldSpec } from './types';

// Passage gap-fill ("học theo ngữ cảnh"): a whole passage is shown with the
// chosen words hidden, and the PO types them back. One module per language.
// Gaps whose word is already `acquired` stay readable in the text instead of
// being asked again; a passage with nothing left to ask is skipped.

const BLANK = '_____';

function validGap(example: Example): boolean {
  const h = example.highlight;
  return !!h && h.start >= 0 && h.end <= example.text.length && h.start < h.end;
}

function makePassageModule(lang: Lang, label: string, input: ExerciseModule['input']): ExerciseModule {
  return {
    id: `${lang}.passage-cloze`,
    label: 'Điền vào đoạn văn',
    description: `Đoạn văn ${label} bị đục lỗ ở những word cần học; điền từng chỗ trống.`,
    languages: [lang],
    mode: 'breadth',
    passage: true,
    input,
    unavailableHint: `Chưa có đoạn văn ${label}. Thêm bằng nút (+) → Thêm đoạn văn.`,

    isEligible(concept, example) {
      return (
        concept.lang === lang &&
        example.passageId !== undefined &&
        example.targetConceptId === concept.id &&
        validGap(example)
      );
    },

    generate(concept, example, context): Exercise {
      const library = context.library;
      const all = library?.examples ?? [example];
      const byId = new Map<string, Concept>((library?.concepts ?? [concept]).map((c) => [c.id, c]));
      // The gaps of this passage, in reading order; the clicked example is
      // always among them even if the library list is missing.
      const gaps = gapsIn(example.passageId!, all);
      if (!gaps.some((g) => g.id === example.id)) gaps.push(example);
      gaps.sort((a, b) => a.highlight!.start - b.highlight!.start);

      const asked = gaps.filter((g) => {
        const c = g.targetConceptId ? byId.get(g.targetConceptId) : undefined;
        return validGap(g) && c !== undefined && (c.status !== 'acquired' || g.id === example.id);
      });

      const text = example.text;
      const fields: FieldSpec[] = [];
      const expected: Record<string, string[]> = {};
      const parts: NonNullable<Exercise['parts']> = [];
      let prompt = '';
      const segments: NonNullable<Exercise['segments']> = [];
      let cursor = 0;
      asked.forEach((gap, i) => {
        const { start, end } = gap.highlight!;
        if (start < cursor) return; // overlapping gap: not asked
        const key = `g${i + 1}`;
        prompt += text.slice(cursor, start) + `(${i + 1}) ${BLANK}`;
        if (start > cursor) segments.push({ text: text.slice(cursor, start) });
        segments.push({ field: key });
        cursor = end;
        fields.push({ key, label: `Chỗ trống ${i + 1}`, type: 'text' });
        expected[key] = [text.slice(start, end)];
        parts.push({ field: key, conceptId: gap.targetConceptId!, exampleId: gap.id });
      });
      prompt += text.slice(cursor);
      if (cursor < text.length) segments.push({ text: text.slice(cursor) });

      return {
        moduleId: `${lang}.passage-cloze`,
        conceptId: concept.id,
        exampleId: example.id,
        title: 'Điền vào đoạn văn',
        prompt,
        detail: `${fields.length} chỗ trống`,
        fields,
        expected,
        parts,
        segments,
      };
    },

    grade: (answer, exercise) => gradeFields(answer, exercise),
  };
}

export const englishPassage = makePassageModule('en', 'tiếng Anh', { lang: 'en' });
export const germanPassage = makePassageModule('de', 'tiếng Đức', {
  lang: 'de',
  specialKeys: ['ä', 'ö', 'ü', 'ß'],
});

export const passageModules: ExerciseModule[] = [englishPassage, germanPassage];
