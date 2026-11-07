import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../ui/Toast';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { LangToggle } from '../../ui/LangToggle';
import fieldStyles from '../../ui/field.module.css';
import { dictionaryIdForLang } from '../../db/queries';
import { conceptRepository } from '../../db/repositories';
import { addConceptToSet } from '../../wordsets';
import { DeckSelect } from '../sets/DeckSelect';
import { LessonSelect } from '../lessons/LessonSelect';
import { assignLesson } from '../../lessons';
import { getLookupProvider, isSingleWord } from '../../lookup';
import { matchPos, posOptionsFor } from './posOptions';
import {
  emptyGrammarValues,
  grammarFieldsFor,
  grammarFromValues,
  valuesFromGrammar,
  type GrammarValues,
} from './wordForms';
import { useLastLanguage } from './useLastLanguage';
import { findPhrase } from '../../core/highlights';
import { createExample } from '../example/actions';
import { ExampleFields, emptyDraft, type ExampleDraft } from '../example/ExampleFields';
import { saveQuickWord } from './actions';
import styles from './QuickAddPage.module.css';

// "Stay to keep entering": by default a save goes back to the Library so
// nobody has to find the way; for a long list the box keeps the form open.
// Remembered on this device.
const STAY_KEY = 'duo:quick-add-stay';

// "Thêm từ": a word or phrase on its own with its meaning, no sentence needed
// (nouns like "máy bay", "cửa sổ"). It becomes a concept of kind "word" with
// a minimal example (the word itself) so it can be reviewed. Sentences and
// ideas have their own screens: "Thêm example" and "Thêm concept".
export function QuickAddPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [stay, setStayState] = useState(() => localStorage.getItem(STAY_KEY) === '1');
  function chooseStay(on: boolean) {
    localStorage.setItem(STAY_KEY, on ? '1' : '0');
    setStayState(on);
  }
  const [lang, setLang] = useLastLanguage();
  const [setId, setSetId] = useState('');
  // The lesson stays chosen between saves, so a list of one lesson goes in fast.
  const [lessonId, setLessonId] = useState('');

  const [wordText, setWordText] = useState('');
  const [wordDescription, setWordDescription] = useState('');
  const [wordPos, setWordPos] = useState('');
  // German grammar boxes (shown by language + part of speech, see wordForms).
  const [grammar, setGrammar] = useState<GrammarValues>(emptyGrammarValues);
  const [looking, setLooking] = useState(false);
  // German: an optional sentence (with its phrase, labels and note) for the word.
  const [exampleDraft, setExampleDraft] = useState<ExampleDraft>(emptyDraft);
  const [lookupNote, setLookupNote] = useState('');
  const grammarFields = grammarFieldsFor(lang, wordPos);

  // "Tra cứu để điền": asks the dictionary for this one word and fills the
  // empty boxes. It is only a suggestion; PO checks it before saving.
  async function handleLookup() {
    const word = wordText.trim();
    const provider = getLookupProvider(lang);
    if (!word || !provider) return;
    setLooking(true);
    setLookupNote('');
    try {
      const result = await provider.lookup(word);
      const entries = result.entries;
      // Prefer the entry for the part of speech already chosen.
      const entry =
        (wordPos && entries.find((e) => matchPos(lang, e.pos) === wordPos)) || entries[0];
      if (result.status !== 'found' || !entry) {
        setLookupNote('Từ điển không có mục từ này, hãy tự nhập.');
        return;
      }
      if (!wordPos && entry.pos) setWordPos(matchPos(lang, entry.pos));
      if (!wordDescription.trim() && entry.definitions[0]) setWordDescription(entry.definitions[0].text);
      const found = valuesFromGrammar(entry.grammar);
      // Never overwrite what PO already typed.
      setGrammar((now) =>
        Object.fromEntries(
          (Object.keys(now) as Array<keyof GrammarValues>).map((k) => [k, now[k].trim() ? now[k] : found[k]]),
        ) as GrammarValues,
      );
      setLookupNote(
        `Gợi ý từ ${result.sourceName ?? 'từ điển'}${result.license ? ` (${result.license.name})` : ''}: kiểm tra lại trước khi lưu.`,
      );
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Không tra cứu được.', { kind: 'error' });
    } finally {
      setLooking(false);
    }
  }

  async function handleSaveWord() {
    const trimmed = wordText.trim();
    if (!trimmed) return;

    const dictionaryId = await dictionaryIdForLang(lang);
    // A real sentence replaces the minimal example (the word on its own).
    const sentence = lang === 'de' ? exampleDraft.text.trim() : '';
    const { outcome, concept } = await saveQuickWord(dictionaryId, lang, trimmed, {
      minimalExample: !sentence,
    });

    // Also for a word that already exists: that is how one word ends up in
    // several decks without a second copy.
    if (setId) await addConceptToSet(concept.id, setId);
    // The lesson is one of the chosen deck (or General); also for a word that already exists.
    const lessonPlaced = lessonId ? (await assignLesson(concept.id, lessonId)).ok : false;
    // The description is the word's meaning; an existing word keeps its own.
    const description = wordDescription.trim();
    const pos = wordPos.trim();
    // Typed by hand is still `unverified`, like data from a file or a lookup.
    const grammarToSave = grammarFromValues(grammar, grammarFields, trimmed);
    if (outcome === 'created' && (description || pos || grammarToSave)) {
      await conceptRepository.update(concept.id, {
        ...(description ? { meanings: [description] } : {}),
        ...(pos ? { pos } : {}),
        ...(grammarToSave ? { grammar: grammarToSave } : {}),
      });
    }

    // The sentence is linked to the word (also an existing one). Without a
    // chosen phrase the word is highlighted in it when it appears as typed.
    if (sentence) {
      const chosen = exampleDraft.highlight !== null;
      await createExample({
        dictionaryId,
        text: chosen ? exampleDraft.text : sentence,
        highlight: chosen ? exampleDraft.highlight : (findPhrase(sentence, trimmed) ?? null),
        highlightExtra: chosen ? exampleDraft.highlightExtra : [],
        attributes: exampleDraft.attributes,
        labelsChosen: exampleDraft.labelsChosen,
        note: exampleDraft.note,
        conceptId: concept.id,
      });
    }

    setWordText('');
    setExampleDraft(emptyDraft());
    setWordDescription('');
    setWordPos('');
    setGrammar(emptyGrammarValues());
    setLookupNote('');
    const inDeck = `${setId ? ' Đã thêm vào deck đã chọn.' : ''}${lessonPlaced ? ' Đã xếp vào bài.' : ''}${sentence ? ' Đã lưu kèm câu ví dụ.' : ''}`;
    if (outcome === 'created') {
      toast.show(`Đã thêm word "${concept.text}".${inDeck}`);
    } else {
      toast.show(`"${concept.text}" đã có trong thư viện.${inDeck}`, {
        kind: 'info',
        action: { label: 'Mở', onClick: () => navigate(`/library/${concept.id}`) },
      });
    }
    if (!stay) navigate('/library');
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Thêm word</h1>
        <LangToggle value={lang} onChange={setLang} />
      </div>

      <p className={fieldStyles.hint}>
        Word là từ hoặc cụm đứng riêng, kèm nghĩa; không cần đặt vào câu (hợp với danh từ như "máy bay", "cửa sổ"). Muốn
        thêm câu có tô sáng và nhãn, dùng <Link to="/add/example">Thêm example</Link>; muốn thêm một ý có nhiều cách
        nói, dùng <Link to="/add/concept">Thêm concept</Link>.
      </p>

      <label className={styles.stay}>
        <input type="checkbox" checked={stay} onChange={(e) => chooseStay(e.target.checked)} />
        Ở lại trang này để ghi tiếp
      </label>

      <DeckSelect
        id="quick-set"
        lang={lang}
        value={setId}
        onChange={(next) => {
          setSetId(next);
          setLessonId('');
        }}
      />
      <LessonSelect
        id="quick-lesson"
        lang={lang}
        decks={[{ setId: setId || undefined, label: setId ? 'Deck đã chọn' : 'General' }]}
        value={lessonId}
        onChange={setLessonId}
      />

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSaveWord();
        }}
      >
        <div>
          <label className={fieldStyles.label} htmlFor="quick-word">
            Word (từ hoặc cụm) (*)
          </label>
          <input
            id="quick-word"
            className={fieldStyles.input}
            value={wordText}
            onChange={(e) => setWordText(e.target.value)}
            placeholder="vd: swallow, window, der Apfel"
            autoFocus
          />
        </div>
        <div>
          <label className={fieldStyles.label} htmlFor="quick-description">
            Nghĩa (không bắt buộc)
          </label>
          <textarea
            id="quick-description"
            className={fieldStyles.textarea}
            value={wordDescription}
            onChange={(e) => setWordDescription(e.target.value)}
            placeholder="vd: nuốt, cửa sổ"
          />
        </div>
        <div>
          <label className={fieldStyles.label} htmlFor="quick-pos">
            Loại từ (không bắt buộc)
          </label>
          <select
            id="quick-pos"
            className={fieldStyles.input}
            value={wordPos}
            onChange={(e) => setWordPos(e.target.value)}
          >
            <option value="">— chưa chọn —</option>
            {posOptionsFor(lang).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {grammarFields.length > 0 && (
          <div className={styles.grammarGrid}>
            {grammarFields.map((field) => (
              <div key={field.key}>
                <label className={fieldStyles.label} htmlFor={`quick-${field.key}`}>
                  {field.label}
                </label>
                {field.kind === 'choice' ? (
                  <select
                    id={`quick-${field.key}`}
                    className={fieldStyles.input}
                    value={grammar[field.key]}
                    onChange={(e) => setGrammar({ ...grammar, [field.key]: e.target.value })}
                  >
                    <option value="">— không có —</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`quick-${field.key}`}
                    className={fieldStyles.input}
                    value={grammar[field.key]}
                    placeholder={field.placeholder}
                    onChange={(e) => setGrammar({ ...grammar, [field.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {lang === 'de' && (
          <div>
            <Button
              variant="secondary"
              disabled={!isSingleWord(wordText) || looking}
              onClick={() => void handleLookup()}
            >
              {looking ? 'Đang tra cứu…' : 'Tra cứu để điền'}
            </Button>
            <p className={fieldStyles.hint}>
              {lookupNote ||
                (isSingleWord(wordText)
                  ? 'Điền sẵn loại từ, nghĩa, giống, số nhiều, dạng động từ từ từ điển; bạn kiểm tra lại rồi lưu.'
                  : 'Chỉ tra cứu được một từ đơn (không gửi cụm nhiều từ ra ngoài).')}
            </p>
          </div>
        )}
        {lang === 'de' && (
          <details className={styles.optional}>
            <summary>Câu ví dụ và ghi chú (không bắt buộc)</summary>
            <ExampleFields
              idPrefix="quick-ex"
              draft={exampleDraft}
              onChange={setExampleDraft}
              sentenceLabel="Câu ví dụ tiếng Đức"
            />
          </details>
        )}
        <ButtonRow>
          <Button type="submit" disabled={!wordText.trim()}>
            Lưu word
          </Button>
        </ButtonRow>
      </form>
    </section>
  );
}
