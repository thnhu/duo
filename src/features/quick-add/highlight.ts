export interface Selection {
  start: number;
  end: number;
}

// A user's drag-select on a <textarea> often includes leading/trailing
// whitespace at the edges; trim it so the stored highlight (and the
// concept created from it) is the clean phrase, not " swallow " or "swallow ".
export function normalizeSelection(text: string, selection: Selection): Selection | null {
  let { start, end } = selection;
  if (end < start) [start, end] = [end, start];

  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;

  if (start >= end) return null;
  return { start, end };
}

export function textForSelection(text: string, selection: Selection): string {
  return text.slice(selection.start, selection.end);
}
