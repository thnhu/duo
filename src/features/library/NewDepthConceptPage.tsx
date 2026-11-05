import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button';
import fieldStyles from '../../ui/field.module.css';
import { dictionaryIdForLang } from '../../db/queries';
import { createDepthConcept } from '../../depth';
import styles from './ConceptDetailPage.module.css';

// Creates a depth concept: an idea (not a single word) whose different ways
// of saying it are added afterwards (spec 1.4, journey J6 part A).
export function NewDepthConceptPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const concept = await createDepthConcept(await dictionaryIdForLang('en'), name, description);
    navigate(`/library/${concept.id}`, { replace: true });
  }

  return (
    <section className={styles.page}>
      <Link to="/library" className={styles.back}>
        ← Thư viện
      </Link>
      <h1>Concept Sâu mới (tiếng Anh)</h1>
      <p className={fieldStyles.hint}>
        Concept là một <strong>ý</strong>, ví dụ "số lượng nhiều". Sau khi tạo, bạn thêm các cách diễn đạt
        (a lot of, a bunch of, a great deal of…) và gắn nhãn cho từng cách.
      </p>
      <div className={styles.form}>
        <div>
          <label className={fieldStyles.label} htmlFor="new-depth-name">
            Tên concept
          </label>
          <input
            id="new-depth-name"
            className={fieldStyles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="vd: large quantity"
          />
        </div>
        <div>
          <label className={fieldStyles.label} htmlFor="new-depth-desc">
            Mô tả (tiếng Việt)
          </label>
          <textarea
            id="new-depth-desc"
            className={fieldStyles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="vd: số lượng nhiều"
          />
        </div>
        <Button onClick={() => void handleCreate()} disabled={!name.trim() || busy}>
          Tạo concept
        </Button>
      </div>
    </section>
  );
}
