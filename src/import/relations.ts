import type { ConceptLinkType } from '../db/types';

// Names accepted in the file's `relation` column for each link type. The file
// must say the relation: there is no default (PO 2026-11-10), because a wrong
// guess would put a concept in the wrong place of the tree.
const RELATION_ALIASES: Record<ConceptLinkType, string[]> = {
  association: ['association', 'associate', 'assoc', 'liên tưởng', 'lien tuong', 'liên kết', 'gợi nhớ'],
  typeOf: ['typeof', 'type of', 'type_of', 'type-of', 'is a', 'is a type of', 'là một loại của', 'là một loại', 'loại của', 'thuộc loại', 'phân loại'],
};

export function parseRelation(value: string): ConceptLinkType | undefined {
  const v = value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [type, names] of Object.entries(RELATION_ALIASES)) {
    if (names.includes(v)) return type as ConceptLinkType;
  }
  return undefined;
}

export interface ParsedLink {
  parent: string;
  type: ConceptLinkType;
}

export type RelationParse = { ok: true; links: ParsedLink[]; ignoredRelation?: boolean } | { ok: false; message: string };

// `parent` holds one or more parent concepts separated by `;`, `relation` the
// link type: either one value for all parents, or one per parent in order.
export function parseLinkCells(parentCell: string, relationCell: string, separator: string, ownText: string): RelationParse {
  const parents = parentCell.split(separator).map((p) => p.trim()).filter(Boolean);
  const relations = relationCell.split(separator).map((r) => r.trim()).filter(Boolean);
  if (parents.length === 0) return { ok: true, links: [], ignoredRelation: relations.length > 0 };

  if (relations.length === 0) {
    return { ok: false, message: `Có parent "${parents.join('; ')}" nhưng thiếu relation (association hoặc typeOf).` };
  }
  if (relations.length !== 1 && relations.length !== parents.length) {
    return { ok: false, message: `Có ${parents.length} parent nhưng ${relations.length} relation: ghi một relation chung hoặc đúng ${parents.length}.` };
  }
  const links: ParsedLink[] = [];
  for (let i = 0; i < parents.length; i++) {
    const raw = relations.length === 1 ? relations[0] : relations[i];
    const type = parseRelation(raw);
    if (!type) return { ok: false, message: `relation "${raw}" không hiểu (dùng association hoặc typeOf).` };
    if (parents[i].toLowerCase() === ownText.toLowerCase()) {
      return { ok: false, message: `parent "${parents[i]}" trùng với chính concept.` };
    }
    if (!links.some((l) => l.parent.toLowerCase() === parents[i].toLowerCase())) links.push({ parent: parents[i], type });
  }
  return { ok: true, links };
}
