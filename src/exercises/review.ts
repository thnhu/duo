import { inSelectedLessons } from '../lessons/rules';
import { reviewLogRepository } from '../db/repositories';
import type { Concept, Example, Lang, ReviewLog } from '../db/types';
import { listDue } from '../scheduling/store';
import { exerciseModules } from './index';
import { loadLibrary } from './library';
import { acceptsExample, shuffle, type SessionItem } from './session';
import { inSelectedSets } from '../wordsets';
import type { ExerciseLibrary, ExerciseModule } from './types';

// Building review and flash sessions (spec D3/D4). Unlike a plain drill,
// the drill type is not chosen by PO: it is picked per question so the same
// word comes back through a different example and a different drill.

export type ReviewKind = 'review' | 'flash';

export interface ReviewRequest {
  kind: ReviewKind;
  count: number;
  lang?: Lang;
  // Only words in one of these word sets (M13); empty/undefined = all.
  setIds?: string[];
  // Only words in one of these lessons (Bản 8); empty/undefined = all.
  lessonIds?: string[];
  now?: number;
  rng?: () => number;
}

// Picks an example + drill for one word. Prefers an example and a drill
// different from the last ones used for that word, when there is a choice.
export function pickItem(
  concept: Concept,
  candidates: Example[],
  last: ReviewLog | undefined,
  modules: ExerciseModule[],
  rng: () => number,
  library?: ExerciseLibrary,
): SessionItem | null {
  const fresh = candidates.filter((e) => e.id !== last?.exampleId);
  const ordered = [...shuffle(fresh, rng), ...shuffle(candidates.filter((e) => !fresh.includes(e)), rng)];
  for (const example of ordered) {
    const usable = modules.filter(
      (m) =>
        m.languages.includes(concept.lang) &&
        (concept.mode ?? 'breadth') === m.mode &&
        acceptsExample(m, example) &&
        m.isEligible(concept, example, library),
    );
    if (usable.length === 0) continue;
    const other = usable.filter((m) => m.id !== last?.exerciseType);
    const pool = other.length > 0 ? other : usable;
    return { concept, example, module: pool[Math.floor(rng() * pool.length)] };
  }
  return null;
}

async function latestLogs(): Promise<Map<string, ReviewLog>> {
  const latest = new Map<string, ReviewLog>();
  for (const log of await reviewLogRepository.listAll()) {
    const seen = latest.get(log.conceptId);
    if (!seen || log.timestamp > seen.timestamp) latest.set(log.conceptId, log);
  }
  return latest;
}

// review: words that have an example due now (most overdue first).
// flash: any word that can be drilled, due or not, for quick-fire practice.
export async function loadReviewItems(request: ReviewRequest): Promise<SessionItem[]> {
  const { kind, count, lang, setIds, lessonIds, now = Date.now(), rng = Math.random } = request;
  const [library, logs, due] = await Promise.all([loadLibrary(), latestLogs(), listDue(now)]);
  const { concepts, examples } = { concepts: library.concepts, examples: library.examples! };
  const dueAt = new Map(due.map((s) => [s.exampleId, s.due]));
  const byConcept = new Map<string, Example[]>();
  for (const example of examples) {
    if (!example.targetConceptId) continue;
    const list = byConcept.get(example.targetConceptId) ?? [];
    list.push(example);
    byConcept.set(example.targetConceptId, list);
  }

  const modules = exerciseModules.list();
  const entries: Array<{ item: SessionItem; overdue: number }> = [];
  for (const concept of concepts) {
    if (lang && concept.lang !== lang) continue;
    if (!inSelectedSets(concept, setIds)) continue;
    if (!inSelectedLessons(concept, lessonIds)) continue;
    const all = byConcept.get(concept.id) ?? [];
    const dueExamples = all.filter((e) => dueAt.has(e.id));
    if (kind === 'review' && dueExamples.length === 0) continue;
    const item = pickItem(concept, kind === 'review' ? dueExamples : all, logs.get(concept.id), modules, rng, library);
    if (!item) continue;
    const overdue = Math.min(...dueExamples.map((e) => dueAt.get(e.id)!), Infinity);
    entries.push({ item, overdue });
  }

  const chosen =
    kind === 'review'
      ? entries.sort((a, b) => a.overdue - b.overdue).slice(0, Math.max(0, count))
      : shuffle(entries, rng).slice(0, Math.max(0, count));
  // A passage is asked once per session even when several of its words are due.
  const seenPassages = new Set<string>();
  const items = chosen
    .map((e) => e.item)
    .filter((item) => {
      if (!item.module.passage || !item.example.passageId) return true;
      if (seenPassages.has(item.example.passageId)) return false;
      seenPassages.add(item.example.passageId);
      return true;
    });
  return shuffle(items, rng);
}

// How many words can be reviewed right now (Today screen, J7): counted
// through the same selection as the session, so the number is never a lie.
export async function countDueWords(
  now: number = Date.now(),
  setIds?: string[],
  lessonIds?: string[],
): Promise<number> {
  return (await loadReviewItems({ kind: 'review', count: Infinity, now, setIds, lessonIds })).length;
}
