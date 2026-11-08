import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { useToast } from '../../ui/Toast';
import fieldStyles from '../../ui/field.module.css';
import type { Passage } from '../../db/types';
import { addItemsToSet } from '../../choicesets';
import type { ChoiceSet } from '../../db/types';
import { loadPassageForEdit, updatePassage } from '../../passages';
import { ChoiceSetSelect } from '../choicesets/ChoiceSetSelect';
import { LessonSelect } from '../lessons/LessonSelect';
import { DeckSelect } from '../sets/DeckSelect';
import { PassageEditor, type PassageDraft } from './PassageEditor';
import styles from '../quick-add/AddPassageForm.module.css';

// "Sửa đoạn văn": change the text, the title or the gaps of a saved passage.
// Gaps that stay keep their review schedule and history; removed ones are
// deleted; new ones become words like in "Thêm đoạn văn".
export function EditPassagePage() {
  const { passageId } = useParams<{ passageId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [passage, setPassage] = useState<Passage | null>(null);
  const [draft, setDraft] = useState<PassageDraft | null>(null);
  const [setId, setSetId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [tiles, setTiles] = useState<ChoiceSet | null>(null);
  const [tilesId, setTilesId] = useState('');
  const [tilesKey, setTilesKey] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!passageId) return;
    void loadPassageForEdit(passageId).then((loaded) => {
      if (!loaded) return;
      setPassage(loaded.passage);
      setSetId(loaded.passage.setId ?? '');
      setLessonId(loaded.passage.lessonId ?? '');
      setTilesId(loaded.passage.choiceSetId ?? '');
      setDraft({ title: loaded.passage.title ?? '', text: loaded.passage.text, gaps: loaded.gaps });
    });
  }, [passageId]);

  if (!passageId || !passage || !draft) {
    return (
      <section className={styles.page}>
        <Link to="/passages">← Đoạn văn</Link>
        <p>Đang tải...</p>
      </section>
    );
  }

  // Back to the list of the deck this passage is in (not every passage).
  const backTo = `/passages?deck=${passage.setId ?? 'general'}${passage.lessonId ? `&lesson=${passage.lessonId}` : ''}`;

  async function addMissing() {
    if (!tiles) return;
    await addItemsToSet(tiles.id, missing);
    setMissing([]);
    setError('');
    setTilesKey((k) => k + 1);
  }

  async function handleSave() {
    if (!passageId || !draft || saving) return;
    setSaving(true);
    try {
      const result = await updatePassage(passageId, { title: draft.title, text: draft.text, gaps: draft.gaps, setId, lessonId, ...(passage?.grammar ? { choiceSetId: tilesId } : {}) });
      if (!result.ok && result.reason === 'missing-choices') {
        setMissing(result.missing);
        setError(`Bộ thẻ thiếu: ${result.missing.join(', ')}.`);
        return;
      }
      if (!result.ok) {
        setError(result.reason === 'empty' ? 'Hãy nhập đoạn văn.' : result.reason === 'no-gaps' ? 'Hãy giữ hoặc đục ít nhất một lỗ.' : 'Không tìm thấy đoạn văn.');
        return;
      }
      toast.show(
        `Đã lưu đoạn văn: giữ ${result.kept} lỗ, thêm ${result.added}, bỏ ${result.removed}.`,
      );
      // The deck it is in now (it may have just been changed).
      navigate(`/passages?deck=${setId || 'general'}${lessonId ? `&lesson=${lessonId}` : ''}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <Link to={backTo}>← Đoạn văn</Link>
      <h1>Sửa đoạn văn</h1>
      <p className={fieldStyles.hint}>
        Sửa chữ thì các lỗ đi theo. Lỗ giữ lại vẫn giữ lịch ôn và lịch sử; lỗ bị bỏ sẽ bị xóa.
      </p>

      {passage.grammar && (
        <>
          <p className={fieldStyles.hint}>Đoạn ngữ pháp: các lỗ không tạo word, chấm theo bộ thẻ.</p>
          <ChoiceSetSelect
            id="passage-tiles"
            lang={passage.lang}
            value={tilesId}
            reloadKey={tilesKey}
            onChange={(set) => {
              setTiles(set);
              setTilesId(set?.id ?? '');
              setMissing([]);
              setError('');
            }}
          />
        </>
      )}

      <PassageEditor
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setError('');
          setMissing([]);
        }}
        note={error}
        autoItems={passage.grammar ? tiles?.items : undefined}
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
        lang={passage.lang}
        value={setId}
        onChange={(next) => {
          setSetId(next);
          // A lesson belongs to one deck.
          setLessonId('');
        }}
        remember={false}
        label="Deck của đoạn văn"
      />
      <LessonSelect
        id="passage-lesson"
        lang={passage.lang}
        decks={[{ setId: setId || undefined, label: setId ? 'Deck' : 'General' }]}
        value={lessonId}
        onChange={setLessonId}
        label="Lesson của đoạn văn"
      />
      <p className={fieldStyles.hint}>
        Đoạn văn nằm trong deck này ở màn Đoạn văn. Đổi deck không chuyển các word đã có; các word mới tạo từ lỗ mới
        được thêm vào deck này.
      </p>

      <ButtonRow>
        <Button disabled={!draft.text.trim() || draft.gaps.length === 0 || saving} onClick={() => void handleSave()}>
          Lưu thay đổi
        </Button>
        <Button variant="ghost" onClick={() => navigate(backTo)}>
          Hủy
        </Button>
      </ButtonRow>
    </section>
  );
}
