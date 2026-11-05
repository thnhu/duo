import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import { InlineConfirm } from '../../ui/InlineConfirm';
import { LangToggle } from '../../ui/LangToggle';
import { LinkButton } from '../../ui/LinkButton';
import { useToast } from '../../ui/Toast';
import { exampleRepository } from '../../db/repositories';
import type { Passage } from '../../db/types';
import { deletePassage, listPassages } from '../../passages';
import { useLastLanguage } from '../quick-add/useLastLanguage';
import styles from '../quick-add/AddPassageForm.module.css';

// The passages of one language: read them, delete them. Studying them is in
// Học → "Điền vào đoạn văn".
export function PassagesPage() {
  const [lang, setLang] = useLastLanguage();
  const [passages, setPassages] = useState<Passage[] | null>(null);
  const [gapCounts, setGapCounts] = useState<Map<string, number>>(new Map());
  const [confirming, setConfirming] = useState<string | null>(null);
  const toast = useToast();

  async function load() {
    const [list, examples] = await Promise.all([listPassages(lang), exampleRepository.listActive()]);
    const counts = new Map<string, number>();
    for (const e of examples) if (e.passageId) counts.set(e.passageId, (counts.get(e.passageId) ?? 0) + 1);
    setGapCounts(counts);
    setPassages(list);
  }

  useEffect(() => {
    setConfirming(null);
    void load();
  }, [lang]);

  async function handleDelete(passage: Passage) {
    const removed = await deletePassage(passage.id);
    setConfirming(null);
    toast.show(`Đã xóa đoạn văn và ${removed} lỗ. Các word vẫn còn trong thư viện.`, { kind: 'info' });
    await load();
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Đoạn văn</h1>
        <LangToggle value={lang} onChange={setLang} />
      </div>
      <ButtonRow>
        <LinkButton to="/add/passage" variant="secondary">
          Thêm đoạn văn
        </LinkButton>
        <LinkButton to="/learn">Ôn ở Học</LinkButton>
      </ButtonRow>

      {passages && passages.length === 0 && (
        <p className={styles.meta}>
          Chưa có đoạn văn nào. <Link to="/add/passage">Thêm đoạn văn</Link> rồi đục lỗ những word cần học.
        </p>
      )}

      {passages?.map((passage) => (
        <Card key={passage.id}>
          <div className={styles.title}>{passage.title || passage.text.slice(0, 40)}</div>
          <p className={styles.meta}>{gapCounts.get(passage.id) ?? 0} lỗ</p>
          <p className={styles.text}>{passage.text}</p>
          {confirming === passage.id ? (
            <InlineConfirm
              confirmLabel="Xóa đoạn văn"
              onConfirm={() => void handleDelete(passage)}
              onCancel={() => setConfirming(null)}
            >
              Xóa đoạn văn và {gapCounts.get(passage.id) ?? 0} lỗ của nó? Các word vẫn còn trong thư viện.
            </InlineConfirm>
          ) : (
            <ButtonRow>
              <LinkButton to={`/passages/${passage.id}`} variant="secondary">
                Sửa
              </LinkButton>
              <Button variant="destructive" onClick={() => setConfirming(passage.id)}>
                Xóa
              </Button>
            </ButtonRow>
          )}
        </Card>
      ))}
    </section>
  );
}
