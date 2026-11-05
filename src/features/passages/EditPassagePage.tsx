import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { useToast } from '../../ui/Toast';
import fieldStyles from '../../ui/field.module.css';
import type { Passage } from '../../db/types';
import { loadPassageForEdit, updatePassage } from '../../passages';
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
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!passageId) return;
    void loadPassageForEdit(passageId).then((loaded) => {
      if (!loaded) return;
      setPassage(loaded.passage);
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

  async function handleSave() {
    if (!passageId || !draft || saving) return;
    setSaving(true);
    try {
      const result = await updatePassage(passageId, { title: draft.title, text: draft.text, gaps: draft.gaps, setId });
      if (!result.ok) {
        setError(result.reason === 'empty' ? 'Hãy nhập đoạn văn.' : result.reason === 'no-gaps' ? 'Hãy giữ hoặc đục ít nhất một lỗ.' : 'Không tìm thấy đoạn văn.');
        return;
      }
      toast.show(
        `Đã lưu đoạn văn: giữ ${result.kept} lỗ, thêm ${result.added}, bỏ ${result.removed}.`,
      );
      navigate('/passages');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <Link to="/passages">← Đoạn văn</Link>
      <h1>Sửa đoạn văn</h1>
      <p className={fieldStyles.hint}>
        Sửa chữ thì các lỗ đi theo. Lỗ giữ lại vẫn giữ lịch ôn và lịch sử; lỗ bị bỏ sẽ bị xóa.
      </p>

      <PassageEditor draft={draft} onChange={(next) => { setDraft(next); setError(''); }} note={error} />

      <DeckSelect id="passage-deck" lang={passage.lang} value={setId} onChange={setSetId} />
      <p className={fieldStyles.hint}>Deck áp dụng cho các word mới được tạo từ lỗ mới.</p>

      <ButtonRow>
        <Button disabled={!draft.text.trim() || draft.gaps.length === 0 || saving} onClick={() => void handleSave()}>
          Lưu thay đổi
        </Button>
        <Button variant="ghost" onClick={() => navigate('/passages')}>
          Hủy
        </Button>
      </ButtonRow>
    </section>
  );
}
