import type { Concept, Lang } from '../db/types';

// What an export covers (Bản 9). Language first, then optionally a deck, then
// optionally a lesson of that deck. Nothing chosen = everything.
//
//   lang undefined          every language
//   deck 'general'          words in no deck
//   deck <deck id>          words in that deck
//   lessonId                words of that lesson (needs a deck)
export const GENERAL_SCOPE_DECK = 'general';

export interface ExportScope {
  lang?: Lang;
  deck?: string;
  lessonId?: string;
}

// A deck belongs to a language and a lesson to a deck: choosing a wider level
// drops the narrower ones.
export function normalizeScope(scope: ExportScope): ExportScope {
  const lang = scope.lang;
  const deck = lang ? scope.deck : undefined;
  const lessonId = deck ? scope.lessonId : undefined;
  return { ...(lang ? { lang } : {}), ...(deck ? { deck } : {}), ...(lessonId ? { lessonId } : {}) };
}

export function isWholeKit(scope: ExportScope): boolean {
  const s = normalizeScope(scope);
  return !s.lang && !s.deck && !s.lessonId;
}

// Pure. The live concepts inside the scope. `liveSetIds` are the decks that
// still exist: a deck label of a deleted deck does not count.
export function conceptsInScope(concepts: Concept[], scope: ExportScope, liveSetIds: Set<string>): Concept[] {
  const s = normalizeScope(scope);
  return concepts.filter((c) => {
    if (c.deletedAt !== undefined) return false;
    if (s.lang && c.lang !== s.lang) return false;
    if (s.deck) {
      const own = (c.setIds ?? []).filter((id) => liveSetIds.has(id));
      if (s.deck === GENERAL_SCOPE_DECK ? own.length > 0 : !own.includes(s.deck)) return false;
    }
    if (s.lessonId && c.lessonId !== s.lessonId) return false;
    return true;
  });
}

// A short piece for a file name: no accents, no spaces, nothing a file system
// dislikes ("Goethe A1" -> "Goethe-A1").
export function fileSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Names for the parts of a scope, used in the file name and in messages.
export interface ScopeNames {
  deckName?: string;
  lessonName?: string;
}

export function scopeLabel(scope: ExportScope, names: ScopeNames = {}): string {
  const s = normalizeScope(scope);
  if (isWholeKit(s)) return 'tất cả';
  const parts: string[] = [];
  if (s.lang) parts.push(s.lang === 'de' ? 'tiếng Đức' : 'tiếng Anh');
  if (s.deck) parts.push(s.deck === GENERAL_SCOPE_DECK ? 'General' : (names.deckName ?? 'deck'));
  if (s.lessonId) parts.push(names.lessonName ?? 'bài');
  return parts.join(' · ');
}

export function scopeSlug(scope: ExportScope, names: ScopeNames = {}): string {
  const s = normalizeScope(scope);
  if (isWholeKit(s)) return 'all';
  const parts: string[] = [];
  if (s.lang) parts.push(s.lang);
  if (s.deck) parts.push(s.deck === GENERAL_SCOPE_DECK ? 'General' : fileSlug(names.deckName ?? 'deck'));
  if (s.lessonId) parts.push(fileSlug(names.lessonName ?? 'lesson'));
  return parts.filter(Boolean).join('-');
}

// File name of an xlsx export: `duo-words-2026-11-07.xlsx` for everything,
// `duo-de-Goethe-A1-2026-11-07.xlsx` for a scope.
export function xlsxFileName(scope: ExportScope, names: ScopeNames, date: string): string {
  return isWholeKit(scope) ? `duo-words-${date}.xlsx` : `duo-${scopeSlug(scope, names)}-${date}.xlsx`;
}
