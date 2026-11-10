import { useEffect, useState } from 'react';
import { dictionaryIdForLang, listInboxExamples } from '../../db/queries';
import type { Example, Lang } from '../../db/types';
import { InboxItemCard } from './InboxItemCard';
import styles from './InboxPage.module.css';

interface InboxEntry {
  example: Example;
  lang: Lang;
}

export function InboxPage() {
  const [entries, setEntries] = useState<InboxEntry[] | null>(null);

  async function loadEntries() {
    const [enDictId, deDictId] = await Promise.all([
      dictionaryIdForLang('en'),
      dictionaryIdForLang('de'),
    ]);
    const [enExamples, deExamples] = await Promise.all([
      listInboxExamples(enDictId),
      listInboxExamples(deDictId),
    ]);
    const combined: InboxEntry[] = [
      ...enExamples.map((example) => ({ example, lang: 'en' as const })),
      ...deExamples.map((example) => ({ example, lang: 'de' as const })),
    ].sort((a, b) => b.example.createdAt - a.example.createdAt);
    setEntries(combined);
  }

  useEffect(() => {
    void loadEntries();
  }, []);

  function handleResolved(exampleId: string) {
    setEntries((current) => current?.filter((entry) => entry.example.id !== exampleId) ?? null);
  }

  return (
    <section className={styles.page}>
      <h1>Hộp chờ duyệt</h1>
      <p className={styles.empty}>Câu đã lưu nhưng chưa tô sáng cụm cần học.</p>

      {entries && entries.length === 0 && <p className={styles.empty}>Không có câu nào đang chờ.</p>}

      <div className={styles.list}>
        {entries?.map((entry) => (
          <InboxItemCard
            key={entry.example.id}
            example={entry.example}
            lang={entry.lang}
            onResolved={handleResolved}
            onRemoved={(id, removed) => (removed ? handleResolved(id) : void loadEntries())}
          />
        ))}
      </div>
    </section>
  );
}
