import type { ConceptGrammar, LookupDefinition, LookupEntry } from '../db/types';

// Reads the German section of an en.wiktionary page (HTML produced by
// action=parse). The rendered HTML is used instead of the raw wikitext
// because the plural and verb forms only exist after the page's templates
// have been expanded (spec 6.5: the entry "cần tự phân tích").

const MAX_DEFINITIONS_PER_ENTRY = 8;
const MAX_EXAMPLES_PER_DEFINITION = 3;

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function genderToArticle(letter: string): string | undefined {
  const l = letter.trim().toLowerCase();
  if (l === 'm') return 'der';
  if (l === 'f') return 'die';
  if (l === 'n') return 'das';
  return undefined;
}

function isHeading(el: Element): boolean {
  return /^H[2-6]$/.test(el.tagName) || el.classList.contains('mw-heading');
}

function headingLevel(el: Element): number {
  const h = /^H[2-6]$/.test(el.tagName) ? el : el.querySelector('h2,h3,h4,h5,h6');
  return h ? Number(h.tagName[1]) : 0;
}

function headingText(el: Element): string {
  const h = /^H[2-6]$/.test(el.tagName) ? el : el.querySelector('h2,h3,h4,h5,h6');
  return clean(h?.textContent).replace(/\s*\d+$/, '');
}

// Grammar from the headword line: "Apfel m (…, plural Äpfel, …)" or
// "gehen (…, past tense ging, past participle gegangen, …)".
function parseHeadword(line: Element, pos: string): ConceptGrammar | undefined {
  const grammar: ConceptGrammar = {};
  const headword = clean(line.querySelector('.headword')?.textContent);

  if (/noun/i.test(pos)) {
    const gender = clean(line.querySelector('.gender abbr, .gender')?.textContent).split(/[\s,]/)[0];
    const article = genderToArticle(gender);
    if (article) grammar.gender = article;
  }

  const forms: Record<string, string> = {};
  for (const label of Array.from(line.querySelectorAll('i'))) {
    const name = clean(label.textContent).toLowerCase();
    let next = label.nextElementSibling;
    while (next && next.tagName !== 'B' && next.tagName !== 'I') next = next.nextElementSibling;
    if (next && next.tagName === 'B' && !(name in forms)) forms[name] = clean(next.textContent);
  }

  if (/noun/i.test(pos) && forms['plural']) grammar.plural = forms['plural'];

  if (/verb/i.test(pos)) {
    const past = forms['past tense'] ?? forms['preterite'];
    const participle = forms['past participle'];
    if (headword || past || participle) {
      grammar.verbForms = {
        infinitiv: headword || undefined,
        praeteritum: past,
        partizip2: participle,
      };
    }
  }

  return Object.keys(grammar).length > 0 ? grammar : undefined;
}

function parseDefinition(li: Element): LookupDefinition | undefined {
  const labels = Array.from(li.querySelectorAll('.usage-label-sense .ib-content'))
    // Labels of nested senses belong to their own <li>.
    .filter((el) => el.closest('li') === li)
    // One label span holds a comma-separated list ("poetic, euphemistic").
    .flatMap((el) => clean(el.textContent).split(','))
    .map((label) => label.trim())
    .filter(Boolean);

  const copy = li.cloneNode(true) as Element;
  for (const nested of Array.from(copy.querySelectorAll('dl, ul, ol, .usage-label-sense'))) {
    nested.remove();
  }
  const text = clean(copy.textContent);
  if (!text) return undefined;

  const examples = Array.from(li.querySelectorAll('.h-usage-example'))
    .filter((el) => el.closest('li') === li)
    .map((el) => ({
      text: clean(el.querySelector('.e-example')?.textContent),
      translation: clean(el.querySelector('.e-translation')?.textContent) || undefined,
    }))
    .filter((e) => e.text)
    .slice(0, MAX_EXAMPLES_PER_DEFINITION);

  return {
    text,
    labels: labels.length > 0 ? labels : undefined,
    examples: examples.length > 0 ? examples : undefined,
  };
}

export function parseGermanSection(doc: Document): LookupEntry[] {
  const german = doc.getElementById('German');
  if (!german) return [];
  const start = german.closest('.mw-heading') ?? german;

  const entries: LookupEntry[] = [];
  let lastHeading = '';
  let current: LookupEntry | undefined;

  for (let el = start.nextElementSibling; el; el = el.nextElementSibling) {
    if (isHeading(el)) {
      // The next language starts at the next level-2 heading.
      if (headingLevel(el) <= 2) break;
      lastHeading = headingText(el);
      current = undefined;
      continue;
    }
    const headwordLine = el.matches('p') ? el.querySelector('.headword-line') : null;
    if (headwordLine) {
      current = {
        pos: lastHeading ? lastHeading.toLowerCase() : undefined,
        definitions: [],
        grammar: parseHeadword(headwordLine, lastHeading),
      };
      entries.push(current);
    } else if (el.tagName === 'OL' && current && current.definitions.length === 0) {
      current.definitions = Array.from(el.children)
        .filter((c) => c.tagName === 'LI')
        .map(parseDefinition)
        .filter((d): d is LookupDefinition => d !== undefined)
        .slice(0, MAX_DEFINITIONS_PER_ENTRY);
    }
  }
  return entries.filter((e) => e.definitions.length > 0);
}
