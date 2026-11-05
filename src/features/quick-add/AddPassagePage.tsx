import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { LangToggle } from '../../ui/LangToggle';
import { useToast } from '../../ui/Toast';
import fieldStyles from '../../ui/field.module.css';
import { dictionaryIdForLang } from '../../db/queries';
import { createPassage } from '../../passages';
import { PassageEditor, type PassageDraft } from '../passages/PassageEditor';
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
  const [draft, setDraft] = useState<PassageDraft>({ title: '', text: '', gaps: [] });
  const [setId, setSetId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const dictionaryId = await dictionaryIdForLang(lang);
      const result = await createPassage({ dictionaryId, lang, title: draft.title, text: draft.text, gaps: draft.gaps, setId });
      if (!result.ok) {
        setError(result.reason === 'empty' ? 'Hãy nhập đoạn văn.' : 'Hãy đục ít nhất một lỗ.');
        return;
      }
      toast.show(
        `Đã thêm đoạn văn: ${result.gaps} lỗ, ${result.createdWords} word mới. Ôn ở Học → Điền vào đoạn văn.`,
      );
      navigate('/passages');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Thêm đoạn văn</h1>
        <LangToggle
          value={lang}
          onChange={(next) => {
            setLang(next);
            setDraft({ ...draft, gaps: [] });
          }}
        />
      </div>
      <p className={fieldStyles.hint}>
        Dán một đoạn văn ngắn, bôi đen những word cần học rồi bấm "Đục lỗ". Khi ôn, đoạn văn hiện ra với các chỗ
        trống và bạn điền lại. <Link to="/add">Chọn loại khác</Link>
      </p>

      <PassageEditor draft={draft} onChange={(next) => { setDraft(next); setError(''); }} note={error} />

      <DeckSelect id="passage-deck" lang={lang} value={setId} onChange={setSetId} />
      <p className={fieldStyles.hint}>Deck áp dụng cho các word mới được tạo từ những lỗ.</p>

      <ButtonRow>
        <Button disabled={!draft.text.trim() || draft.gaps.length === 0 || saving} onClick={() => void handleSave()}>
          Lưu đoạn văn
        </Button>
      </ButtonRow>
    </section>
  );
}
