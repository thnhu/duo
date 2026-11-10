import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { LangToggle } from '../../ui/LangToggle';
import { useToast } from '../../ui/Toast';
import fieldStyles from '../../ui/field.module.css';
import { dictionaryIdForLang } from '../../db/queries';
import { addItemsToSet } from '../../choicesets';
import type { AnswerMode, ChoiceSet } from '../../db/types';
import { createPassage } from '../../passages';
import { AnswerModeSelect } from '../choicesets/AnswerModeSelect';
import { ChoiceSetSelect } from '../choicesets/ChoiceSetSelect';
import { PassageEditor, type PassageDraft } from '../passages/PassageEditor';
import { TableInput } from '../passages/TableInput';
import { LessonSelect } from '../lessons/LessonSelect';
import { DeckSelect } from '../sets/DeckSelect';
import { useLastLanguage } from './useLastLanguage';
import styles from './AddPassageForm.module.css';

// "Thêm đoạn văn": paste a short text (English or German), select the words
// to learn and press "Đục lỗ". The drill later hides those words in the whole
// passage and asks for them back. Each gap becomes (or reuses) a word.
export function AddPassagePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [lang, setLang] = useLastLanguage();
  const [draft, setDraft] = useState<PassageDraft>({ title: '', prompt: '', text: '', gaps: [] });
  const [setId, setSetId] = useState('');
  const [lessonId, setLessonId] = useState('');
  // Grammar passage (Bản 10): gaps make no word and are answered with tiles.
  const [grammar, setGrammar] = useState(false);
  const [tiles, setTiles] = useState<ChoiceSet | null>(null);
  const [tilesKey, setTilesKey] = useState(0);
  const [answerMode, setAnswerMode] = useState<AnswerMode>('tiles');
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Bảng (Bản 11, M18b): the text is a table pasted and checked in TableInput.
  const [kind, setKind] = useState<'text' | 'table'>('text');
  const [tableReady, setTableReady] = useState(false);
  const [tableHeaders, setTableHeaders] = useState({ row: true, col: true });
  const tableStep = kind === 'table' && !tableReady;

  function switchKind(next: 'text' | 'table') {
    if (next === kind) return;
    setKind(next);
    setTableReady(false);
    setDraft({ ...draft, text: '', gaps: [] });
    setMissing([]);
    setError('');
  }

  async function addMissing() {
    if (!tiles) return;
    await addItemsToSet(tiles.id, missing);
    setMissing([]);
    setError('');
    setTilesKey((k) => k + 1);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const dictionaryId = await dictionaryIdForLang(lang);
      const result = await createPassage({ dictionaryId, lang, title: draft.title, prompt: draft.prompt, ...(kind === 'table' ? { layout: 'table' as const, tableHeaders } : {}), text: draft.text, gaps: draft.gaps, setId, lessonId, grammar, choiceSetId: grammar ? tiles?.id : undefined, answerMode });
      if (!result.ok && result.reason === 'missing-choices') {
        setMissing(result.missing);
        setError(`Bộ thẻ thiếu: ${result.missing.join(', ')}.`);
        return;
      }
      if (!result.ok) {
        setError(result.reason === 'empty' ? 'Hãy nhập đoạn văn.' : 'Hãy đục ít nhất một lỗ.');
        return;
      }
      toast.show(
        grammar
          ? `Đã thêm đoạn ngữ pháp: ${result.gaps} lỗ, không tạo word. Ôn ở Học → Điền vào đoạn văn.`
          : `Đã thêm đoạn văn: ${result.gaps} lỗ, ${result.createdWords} word mới. Ôn ở Học → Điền vào đoạn văn.`,
      );
      // Back to the deck cards: they only count, the passages are read when a card is opened.
      navigate(lessonId ? `/passages?deck=${setId || 'general'}&lesson=${lessonId}` : '/passages');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>{kind === 'table' ? 'Thêm bảng' : 'Thêm đoạn văn'}</h1>
        <LangToggle
          value={lang}
          onChange={(next) => {
            setLang(next);
            setDraft({ ...draft, gaps: [] });
            setTiles(null);
            setMissing([]);
          }}
        />
      </div>
      <div className={styles.modes} role="group" aria-label="Loại">
        <button
          type="button"
          className={[styles.modeBtn, kind === 'text' && styles.modeOn].filter(Boolean).join(' ')}
          aria-pressed={kind === 'text'}
          onClick={() => switchKind('text')}
        >
          Đoạn văn
        </button>
        <button
          type="button"
          className={[styles.modeBtn, kind === 'table' && styles.modeOn].filter(Boolean).join(' ')}
          aria-pressed={kind === 'table'}
          onClick={() => switchKind('table')}
        >
          Bảng
        </button>
      </div>
      <p className={fieldStyles.hint}>
        {kind === 'table'
          ? 'Dán bảng ngữ pháp copy từ PDF, kiểm tra lưới rồi đục lỗ các ô cần học. '
          : 'Dán một đoạn văn ngắn rồi chuyển sang "Đục lỗ": chạm một word để đục lỗ, chạm lại để bỏ. Khi ôn, đoạn văn hiện ra với các chỗ trống và bạn điền lại. '}
        <Link to="/add">Chọn loại khác</Link>
      </p>

      {tableStep ? (
        <TableInput
          onUse={({ text, headers }) => {
            setDraft({ ...draft, text, gaps: [] });
            setTableHeaders(headers);
            setTableReady(true);
          }}
        />
      ) : (
      <>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={grammar}
          onChange={(e) => {
            setGrammar(e.target.checked);
            setError('');
          }}
        />
        Đoạn ngữ pháp (lỗ không tạo word, trả lời bằng bộ thẻ)
      </label>
      {grammar && (
        <ChoiceSetSelect
          id="passage-tiles"
          lang={lang}
          value={tiles?.id ?? ''}
          reloadKey={tilesKey}
          onChange={(set) => {
            setTiles(set);
            setMissing([]);
            setError('');
          }}
        />
      )}
      {grammar && tiles && <AnswerModeSelect id="passage-answer-mode" value={answerMode} onChange={setAnswerMode} />}

      <PassageEditor
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setError('');
          setMissing([]);
        }}
        note={error}
        autoItems={grammar ? tiles?.items : undefined}
        layout={kind}
        tableHeaders={tableHeaders}
      />
      {missing.length > 0 && tiles && (
        <ButtonRow>
          <Button variant="secondary" onClick={() => void addMissing()}>
            Thêm {missing.join(', ')} vào bộ thẻ
          </Button>
        </ButtonRow>
      )}

      <DeckSelect
        id="passage-deck"
        lang={lang}
        value={setId}
        onChange={(next) => {
          setSetId(next);
          // A lesson belongs to one deck.
          setLessonId('');
        }}
      />
      <p className={fieldStyles.hint}>
        {grammar ? 'Deck của đoạn ngữ pháp.' : 'Deck áp dụng cho các word mới được tạo từ những lỗ.'}
      </p>
      <LessonSelect
        id="passage-lesson"
        lang={lang}
        decks={[{ setId: setId || undefined, label: setId ? 'Deck' : 'General' }]}
        value={lessonId}
        onChange={setLessonId}
        label="Lesson của đoạn văn"
      />

      <ButtonRow>
        <Button disabled={!draft.text.trim() || draft.gaps.length === 0 || saving} onClick={() => void handleSave()}>
          {kind === 'table' ? 'Lưu bảng' : 'Lưu đoạn văn'}
        </Button>
        {kind === 'table' && (
          <Button
            variant="ghost"
            onClick={() => {
              setTableReady(false);
              setDraft({ ...draft, text: '', gaps: [] });
            }}
          >
            Nhập lại bảng
          </Button>
        )}
      </ButtonRow>
      </>
      )}
    </section>
  );
}
