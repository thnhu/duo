import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../ui/Toast';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { LangToggle } from '../../ui/LangToggle';
import fieldStyles from '../../ui/field.module.css';
import { dictionaryIdForLang, findConceptByExactText } from '../../db/queries';
import type { Concept, WordSet } from '../../db/types';
import { addConceptToSet, listWordSets, readAddSet, writeAddSet } from '../../wordsets';
import { useLastLanguage } from './useLastLanguage';
import { ConceptSuggestions } from '../search/ConceptSuggestions';
import { normalizeSelection, textForSelection, type Selection } from './highlight';
import { saveQuickWord, saveSentenceToInbox, saveSentenceWithHighlight } from './actions';
import styles from './QuickAddPage.module.css';

type Mode = 'word' | 'sentence';
type Message = { kind: 'success' | 'info'; text: string; linkTo?: string } | null;

// "Stay to keep entering": by default a save goes back to the Library (or the
// inbox for an unhighlighted sentence) so nobody has to find the way; for a
// long list the box keeps the form open. Remembered on this device.
const STAY_KEY = 'duo:quick-add-stay';

export function QuickAddPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [stay, setStayState] = useState(() => localStorage.getItem(STAY_KEY) === '1');
  function chooseStay(on: boolean) {
    localStorage.setItem(STAY_KEY, on ? '1' : '0');
    setStayState(on);
  }
  const [lang, setLang] = useLastLanguage();
  const [mode, setMode] = useState<Mode>('word');

  // The word set new words go into, remembered from last time ('' = none).
  const [sets, setSets] = useState<WordSet[]>([]);
  const [setId, setSetIdState] = useState('');
  useEffect(() => {
    void listWordSets(lang).then((list) => {
      setSets(list);
      const remembered = readAddSet(lang);
      setSetIdState(list.some((s) => s.id === remembered) ? remembered : '');
    });
  }, [lang]);
  function chooseSet(id: string) {
    writeAddSet(lang, id);
    setSetIdState(id);
  }
  const setName = sets.find((s) => s.id === setId)?.name;
  const inSet = setName ? ` Đã thêm vào deck "${setName}".` : '';

  const [wordText, setWordText] = useState('');
  const [wordMessage, setWordMessage] = useState<Message>(null);

  const [sentenceText, setSentenceText] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [matchedConcept, setMatchedConcept] = useState<Concept | undefined>(undefined);
  const [pickedConceptId, setPickedConceptId] = useState<string | undefined>(undefined);
  const [sentenceMessage, setSentenceMessage] = useState<Message>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSaveWord() {
    const trimmed = wordText.trim();
    if (!trimmed) return;

    const dictionaryId = await dictionaryIdForLang(lang);
    const { outcome, concept } = await saveQuickWord(dictionaryId, lang, trimmed);

    // Also for a word that already exists: that is how one word ends up in
    // several sets without a second copy.
    if (setId) await addConceptToSet(concept.id, setId);

    setWordMessage(null);
    setWordText('');
    if (outcome === 'created') {
      toast.show(`Đã lưu "${concept.text}".${inSet}`);
    } else {
      toast.show(`"${concept.text}" đã có trong thư viện.${inSet}`, {
        kind: 'info',
        action: { label: 'Mở', onClick: () => navigate(`/library/${concept.id}`) },
      });
    }
    if (!stay) navigate('/library');
  }

  async function handlePickHighlight() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const normalized = normalizeSelection(sentenceText, {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });
    if (!normalized) {
      setSentenceMessage({ kind: 'info', text: 'Hãy bôi đen (chọn) một cụm trong câu trước.' });
      return;
    }

    setSentenceMessage(null);
    setSelection(normalized);
    setPickedConceptId(undefined);

    const dictionaryId = await dictionaryIdForLang(lang);
    const phrase = textForSelection(sentenceText, normalized);
    setMatchedConcept(await findConceptByExactText(dictionaryId, phrase));
  }

  function resetSentenceForm() {
    setSentenceText('');
    setSelection(null);
    setMatchedConcept(undefined);
    setPickedConceptId(undefined);
  }

  async function handleSaveHighlighted() {
    if (!selection) return;
    const dictionaryId = await dictionaryIdForLang(lang);
    const result = await saveSentenceWithHighlight(
      dictionaryId,
      lang,
      sentenceText,
      selection,
      pickedConceptId,
    );
    if (!result) return;
    if (setId) await addConceptToSet(result.concept.id, setId);

    setSentenceMessage(null);
    toast.show(
      result.conceptOutcome === 'created'
        ? `Đã tạo concept mới "${result.concept.text}" và lưu ví dụ.${inSet}`
        : `Đã gắn vào concept có sẵn "${result.concept.text}".${inSet}`,
      { action: { label: 'Mở', onClick: () => navigate(`/library/${result.concept.id}`) } },
    );
    resetSentenceForm();
    if (!stay) navigate('/library');
  }

  async function handleSaveToInbox() {
    if (!sentenceText.trim()) return;
    const dictionaryId = await dictionaryIdForLang(lang);
    await saveSentenceToInbox(dictionaryId, sentenceText.trim());
    setSentenceMessage(null);
    toast.show('Đã lưu vào Hộp chờ duyệt — tô sáng cụm cần học sau.');
    resetSentenceForm();
    if (!stay) navigate('/inbox');
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Ghi nhanh</h1>
        <LangToggle value={lang} onChange={setLang} />
      </div>

      <div className={styles.modeToggle} role="group" aria-label="Cách ghi nhanh">
        <button
          type="button"
          className={[styles.modeOption, mode === 'word' && styles.modeOptionActive]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setMode('word')}
        >
          Từ hoặc cụm
        </button>
        <button
          type="button"
          className={[styles.modeOption, mode === 'sentence' && styles.modeOptionActive]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setMode('sentence')}
        >
          Cả câu
        </button>
      </div>

      <label className={styles.stay}>
        <input type="checkbox" checked={stay} onChange={(e) => chooseStay(e.target.checked)} />
        Ở lại trang này để ghi tiếp
      </label>

      {sets.length > 0 && (
        <div>
          <label className={fieldStyles.label} htmlFor="quick-set">
            Thêm vào deck
          </label>
          <select id="quick-set" className={fieldStyles.input} value={setId} onChange={(e) => chooseSet(e.target.value)}>
            <option value="">Không xếp deck</option>
            {sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {sets.length === 0 && (
        <p className={fieldStyles.hint}>
          Muốn gom từ theo mục đích (IT, từ phim…)? <Link to="/sets">Tạo deck</Link>.
        </p>
      )}

      {mode === 'word' && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void handleSaveWord();
          }}
        >
          <div>
            <label className={fieldStyles.label} htmlFor="quick-word">
              Từ hoặc cụm từ
            </label>
            <input
              id="quick-word"
              className={fieldStyles.input}
              value={wordText}
              onChange={(e) => {
                setWordText(e.target.value);
                setWordMessage(null);
              }}
              placeholder="vd: swallow"
              autoFocus
            />
          </div>
          <ButtonRow>
            <Button type="submit" disabled={!wordText.trim()}>
              Lưu
            </Button>
          </ButtonRow>
          {wordMessage && (
            <p
              className={[
                styles.message,
                wordMessage.kind === 'success' ? styles.messageSuccess : styles.messageInfo,
              ].join(' ')}
            >
              {wordMessage.text}{' '}
              {wordMessage.linkTo && <Link to={wordMessage.linkTo}>Xem</Link>}
            </p>
          )}
        </form>
      )}

      {mode === 'sentence' && (
        <div className={styles.form}>
          <div>
            <label className={fieldStyles.label} htmlFor="quick-sentence">
              Câu hoặc đoạn chứa cụm cần học
            </label>
            <textarea
              id="quick-sentence"
              ref={textareaRef}
              className={fieldStyles.textarea}
              value={sentenceText}
              onChange={(e) => {
                setSentenceText(e.target.value);
                setSelection(null);
                setMatchedConcept(undefined);
                setPickedConceptId(undefined);
                setSentenceMessage(null);
              }}
              placeholder="vd: She swallowed the pill."
            />
            <p className={fieldStyles.hint}>
              Bôi đen (chọn) cụm muốn học trong câu, rồi bấm "Tô sáng cụm đã chọn".
            </p>
          </div>

          {selection && (
            <p className={styles.preview}>
              <span className={styles.context}>{sentenceText.slice(0, selection.start)}</span>
              <span className={styles.highlight}>
                {textForSelection(sentenceText, selection)}
              </span>
              <span className={styles.context}>{sentenceText.slice(selection.end)}</span>
            </p>
          )}

          {selection && (
            <p className={fieldStyles.hint}>
              {pickedConceptId
                ? 'Sẽ gắn vào concept bạn đã chọn bên dưới.'
                : matchedConcept
                  ? `Sẽ gắn vào concept đã có: "${matchedConcept.text}"`
                  : `Sẽ tạo concept mới: "${textForSelection(sentenceText, selection)}"`}
            </p>
          )}

          {selection && (
            <ConceptSuggestions
              phrase={textForSelection(sentenceText, selection)}
              lang={lang}
              pickedId={pickedConceptId}
              onPick={setPickedConceptId}
            />
          )}

          <ButtonRow>
            {!selection && (
              <Button
                variant="secondary"
                onClick={() => void handlePickHighlight()}
                disabled={!sentenceText.trim()}
              >
                Tô sáng cụm đã chọn
              </Button>
            )}
            {selection && (
              <Button onClick={() => void handleSaveHighlighted()}>Lưu</Button>
            )}
            <Button
              variant="ghost"
              onClick={() => void handleSaveToInbox()}
              disabled={!sentenceText.trim()}
            >
              Lưu, chưa tô sáng
            </Button>
          </ButtonRow>

          {sentenceMessage && (
            <p
              className={[
                styles.message,
                sentenceMessage.kind === 'success' ? styles.messageSuccess : styles.messageInfo,
              ].join(' ')}
            >
              {sentenceMessage.text}{' '}
              {sentenceMessage.linkTo && <Link to={sentenceMessage.linkTo}>Xem</Link>}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
