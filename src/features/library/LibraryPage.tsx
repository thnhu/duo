import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../ui/Card';
import { LangToggle } from '../../ui/LangToggle';
import { dictionaryIdForLang, listConceptsByDictionary, listInboxExamples } from '../../db/queries';
import type { Concept } from '../../db/types';
import { useLastLanguage } from '../quick-add/useLastLanguage';
import styles from './LibraryPage.module.css';

export function LibraryPage() {
  const [lang, setLang] = useLastLanguage();
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [inboxCount, setInboxCount] = useState(0);

  async function loadConcepts(currentLang: typeof lang) {
    const dictionaryId = await dictionaryIdForLang(currentLang);
    setConcepts(await listConceptsByDictionary(dictionaryId));
  }

  async function loadInboxCount() {
    const [enDictId, deDictId] = await Promise.all([
      dictionaryIdForLang('en'),
      dictionaryIdForLang('de'),
    ]);
    const [en, de] = await Promise.all([listInboxExamples(enDictId), listInboxExamples(deDictId)]);
    setInboxCount(en.length + de.length);
  }

  useEffect(() => {
    void loadConcepts(lang);
    void loadInboxCount();
  }, [lang]);

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Thư viện</h1>
        <LangToggle value={lang} onChange={setLang} />
      </div>

      {inboxCount > 0 && (
        <Link to="/inbox" className={styles.banner}>
          <Card tinted>
            {inboxCount} câu đang chờ tô sáng trong Hộp chờ duyệt →
          </Card>
        </Link>
      )}

      {concepts && concepts.length === 0 && (
        <p className={styles.empty}>Chưa có từ nào. Dùng nút "+" để ghi nhanh một từ.</p>
      )}

      <div className={styles.list}>
        {concepts?.map((concept) => (
          <Link key={concept.id} to={`/library/${concept.id}`} className={styles.rowLink}>
            <Card className={styles.row}>
              <span>
                <div className={styles.rowText}>{concept.text}</div>
                {concept.meanings[0] && (
                  <div className={styles.rowMeaning}>{concept.meanings[0]}</div>
                )}
              </span>
              <span
                className={[styles.badge, concept.status === 'acquired' && styles.badgeAcquired]
                  .filter(Boolean)
                  .join(' ')}
              >
                {concept.status === 'acquired' ? 'Đã thụ đắc' : 'Đang học'}
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
