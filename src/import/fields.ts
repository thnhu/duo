// Import fields (spec 6.4) are configuration, not hard-coded logic: the
// mapping screen, template file and header auto-detection all read this
// list. Adding a column = adding an entry here (plus handling in build.ts).

export type ImportFieldId =
  | 'text'
  | 'lang'
  | 'pos'
  | 'meaning'
  | 'lesson'
  | 'deck'
  | 'example'
  | 'highlight'
  | 'gender'
  | 'plural'
  | 'infinitiv'
  | 'praesens3sg'
  | 'praeteritum'
  | 'partizip2'
  | 'tone'
  | 'mode'
  | 'register'
  | 'nuance'
  | 'dialect'
  | 'note';

export interface ImportField {
  id: ImportFieldId;
  label: string;
  required?: boolean;
  // Header names (any case/diacritics) recognised automatically.
  aliases: string[];
}

export const importFields: ImportField[] = [
  { id: 'text', label: 'Word / cụm (text)', required: true, aliases: ['text', 'word', 'term', 'vocabulary', 'concept', 'wort', 'từ', 'từ vựng', 'cụm từ'] },
  { id: 'lang', label: 'Ngôn ngữ (lang)', aliases: ['lang', 'language', 'ngôn ngữ', 'sprache'] },
  { id: 'pos', label: 'Loại từ (pos)', aliases: ['pos', 'part of speech', 'wortart', 'loại từ', 'từ loại'] },
  { id: 'meaning', label: 'Nghĩa (meaning)', aliases: ['meaning', 'meanings', 'definition', 'translation', 'bedeutung', 'nghĩa', 'dịch'] },
  { id: 'lesson', label: 'Lesson', aliases: ['lesson', 'chapter', 'unit', 'lektion', 'bài', 'chương'] },
  { id: 'deck', label: 'Deck (nhiều deck cách nhau bằng ;)', aliases: ['deck', 'decks', 'set', 'sets', 'wordset', 'word set', 'collection', 'topic', 'bộ', 'bộ từ', 'chủ đề'] },
  { id: 'example', label: 'Câu ví dụ (example)', aliases: ['example', 'sentence', 'beispiel', 'ví dụ', 'câu', 'câu ví dụ'] },
  { id: 'highlight', label: 'Đoạn tô sáng (highlight)', aliases: ['highlight', 'tô sáng'] },
  { id: 'gender', label: 'Giống (gender)', aliases: ['gender', 'genus', 'artikel', 'article', 'giống'] },
  { id: 'plural', label: 'Số nhiều (plural)', aliases: ['plural', 'số nhiều'] },
  { id: 'infinitiv', label: 'Infinitiv', aliases: ['infinitiv', 'infinitive'] },
  { id: 'praesens3sg', label: 'Präsens er/sie/es', aliases: ['praesens3sg', 'präsens3sg', 'praesens er/sie/es', 'präsens er/sie/es', 'er/sie/es', 'praesens 3sg', 'präsens 3sg', '3sg'] },
  { id: 'praeteritum', label: 'Präteritum', aliases: ['praeteritum', 'präteritum', 'preterite', 'past'] },
  { id: 'partizip2', label: 'Partizip II', aliases: ['partizip2', 'partizip ii', 'partizip 2', 'past participle'] },
  { id: 'tone', label: 'Tone', aliases: ['tone'] },
  { id: 'mode', label: 'Mode', aliases: ['mode'] },
  { id: 'register', label: 'Register', aliases: ['register'] },
  { id: 'nuance', label: 'Nuance', aliases: ['nuance'] },
  { id: 'dialect', label: 'Dialect', aliases: ['dialect'] },
  { id: 'note', label: 'Ghi chú (note)', aliases: ['note', 'notes', 'ghi chú'] },
];

export function getImportField(id: string): ImportField | undefined {
  return importFields.find((f) => f.id === id);
}

// Separator between several meanings in one cell (spec 6.4: "ký hiệu
// thống nhất, ví dụ ;").
export const MEANING_SEPARATOR = ';';
