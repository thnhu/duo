import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { LangToggle } from '../../ui/LangToggle';
import fieldStyles from '../../ui/field.module.css';
import { dictionaryIdForLang, findConceptByExactText } from '../../db/queries';
import type { Concept } from '../../db/types';
import { useLastLanguage } from './useLastLanguage';
import { ConceptSuggestions } from '../search/ConceptSuggestions';
import { normalizeSelection, textForSelection, type Selection } from './highlight';
import { saveQuickWord, saveSentenceToInbox, saveSentenceWithHighlight } from './actions';
import styles from './QuickAddPage.module.css';

type Mode = 'word' | 'sentence';
type Message = { kind: 'success' | 'info'; text: string; linkTo?: string } | null;

export function QuickAddPage() {
  const [lang, setLang] = useLastLanguage();
  const [mode, setMode] = useState<Mode>('word');

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

    if (outcome === 'created') {
      setWordMessage({ kind: 'success', text: `Đã lưu "${concept.text}".` });
      setWordText('');
    } else {
      setWordMessage({
        kind: 'info',
        text: `"${concept.text}" đã có trong thư viện.`,
        linkTo: `/library/${concept.id}`,
      });
    }
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

    setSentenceMessage({
      kind: 'success',
      text:
        result.conceptOutcome === 'created'
          ? `Đã tạo concept mới "${result.concept.text}" và lưu ví dụ.`
          : `Đã gắn vào concept có sẵn "${result.concept.text}".`,
      linkTo: `/library/${result.concept.id}`,
    });
    resetSentenceForm();
  }

  async function handleSaveToInbox() {
    if (!sentenceText.trim()) return;
    const dictionaryId = await dictionaryIdForLang(lang);
    await saveSentenceToInbox(dictionaryId, sentenceText.trim());
    setSentenceMessage({
      kind: 'success',
      text: 'Đã lưu vào Hộp chờ duyệt — tô sáng cụm cần học sau.',
      linkTo: '/inbox',
    });
    resetSentenceForm();
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
