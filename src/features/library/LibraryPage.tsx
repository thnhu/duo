import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../ui/Card';
import { LinkButton } from '../../ui/LinkButton';
import { LangToggle } from '../../ui/LangToggle';
import { SearchLink } from '../../ui/SearchLink';
import { dictionaryIdForLang, listConceptsByDictionary, listInboxExamples } from '../../db/queries';
import type { Concept, WordSet } from '../../db/types';
import {
  ALL_SETS,
  countBySet,
  filterBySet,
  listWordSets,
  readSetFilter,
  writeSetFilter,
  type SetFilter,
} from '../../wordsets';
import { LookupBar } from '../lookup/LookupBar';
import { useLookupQueue } from '../lookup/useLookupQueue';
import { useLastLanguage } from '../quick-add/useLastLanguage';
import styles from './LibraryPage.module.css';

export function LibraryPage() {
  const [lang, setLang] = useLastLanguage();
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [sets, setSets] = useState<WordSet[]>([]);
  const [filter, setFilterState] = useState<SetFilter>(() => readSetFilter(lang));

  async function loadConcepts(currentLang: typeof lang) {
    const dictionaryId = await dictionaryIdForLang(currentLang);
    setConcepts(await listConceptsByDictionary(dictionaryId));
    setSets(await listWordSets(currentLang));
  }

  function setFilter(next: SetFilter) {
    writeSetFilter(lang, next);
    setFilterState(next);
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
    setFilterState(readSetFilter(lang));
    void loadConcepts(lang);
    void loadInboxCount();
  }, [lang]);

  // Lookup results arrive in the background: refresh the list as they do.
  const queue = useLookupQueue();
  useEffect(() => {
    void loadConcepts(lang);
  }, [queue.done, queue.status]);

  const liveIds = new Set(sets.map((s) => s.id));
  // A remembered filter whose set was deleted falls back to "all".
  const activeFilter: SetFilter = filter.kind === 'set' && !liveIds.has(filter.id) ? ALL_SETS : filter;
  const visible = concepts ? filterBySet(concepts, activeFilter, liveIds) : null;
  const counts = concepts ? countBySet(concepts, sets) : null;
  const isActive = (f: SetFilter) =>
    f.kind === activeFilter.kind && (f.kind !== 'set' || (activeFilter.kind === 'set' && f.id === activeFilter.id));

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Thư viện</h1>
        <div className={styles.headerActions}>
          <LangToggle value={lang} onChange={setLang} />
          <SearchLink />
        </div>
      </div>

      {counts && (
        <div className={styles.filters} role="group" aria-label="Lọc theo deck">
          {([
            { f: ALL_SETS, label: 'Tất cả', n: counts.all },
            ...sets.map((set) => ({ f: { kind: 'set', id: set.id } as SetFilter, label: set.name, n: counts.bySet.get(set.id) ?? 0 })),
            ...(sets.length > 0 ? [{ f: { kind: 'none' } as SetFilter, label: 'Chưa xếp deck', n: counts.none }] : []),
          ]).map(({ f, label, n }) => (
            <button
              key={f.kind === 'set' ? f.id : f.kind}
              type="button"
              className={[styles.filter, isActive(f) ? styles.filterOn : ''].filter(Boolean).join(' ')}
              aria-pressed={isActive(f)}
              onClick={() => setFilter(f)}
            >
              {label} <strong>{n}</strong>
            </button>
          ))}
          <LinkButton to="/sets">Quản lý deck</LinkButton>
        </div>
      )}

      <Link to="/import" className={styles.banner}>
        <Card tinted>Nhập từ file CSV/XLSX →</Card>
      </Link>

      <Link to="/links" className={styles.banner}>
        <Card tinted>Liên kết concept (con → cha) →</Card>
      </Link>
      <Link to="/association" className={styles.banner}>
        <Card tinted>Tìm theo liên kết (đồ thị) →</Card>
      </Link>
      <Link to="/tree" className={styles.banner}>
        <Card tinted>Xem cây concept (cha, con, ví dụ) →</Card>
      </Link>

      {lang === 'en' && (
        <Link to="/depth/new" className={styles.banner}>
          <Card tinted>Tạo concept Sâu (một ý, nhiều cách diễn đạt) →</Card>
        </Link>
      )}

      {inboxCount > 0 && (
        <Link to="/inbox" className={styles.banner}>
          <Card tinted>
            {inboxCount} câu đang chờ tô sáng trong Hộp chờ duyệt →
          </Card>
        </Link>
      )}

      {visible && <LookupBar concepts={visible} />}

      {concepts && concepts.length === 0 && (
        <p className={styles.empty}>Chưa có từ nào. Dùng nút "+" để ghi nhanh một từ.</p>
      )}
      {concepts && concepts.length > 0 && visible && visible.length === 0 && (
        <p className={styles.empty}>Không có từ nào trong lựa chọn này.</p>
      )}

      <div className={styles.list}>
        {visible?.map((concept) => (
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
                {concept.mode === 'depth' ? 'Sâu' : concept.status === 'acquired' ? 'Đã thụ đắc' : 'Đang học'}
              </span>
              {concept.lookup?.status === 'found' && concept.verification === 'unverified' && (
                <span className={styles.badge}>Có gợi ý</span>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
