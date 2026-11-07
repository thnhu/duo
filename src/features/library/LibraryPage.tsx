import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { Card } from '../../ui/Card';
import { LinkButton } from '../../ui/LinkButton';
import { LangToggle } from '../../ui/LangToggle';
import { SearchLink } from '../../ui/SearchLink';
import { dictionaryIdForLang, listInboxExamples } from '../../db/queries';
import type { Concept, ConceptKind, WordSet } from '../../db/types';
import {
  GENERAL_DECK_NAME,
  GENERAL_FILTER,
  countDecks,
  countSubDecks,
  deckFromKey,
  deckToKey,
  listDeckConcepts,
  listWordSets,
  type SetCounts,
  type SetFilter,
} from '../../wordsets';
import { deckOfFilter, listLessons } from '../../lessons';
import { LookupBar } from '../lookup/LookupBar';
import { ConceptRow } from './ConceptRow';
import { LessonBrowser } from './LessonBrowser';
import { useLookupQueue } from '../lookup/useLookupQueue';
import { useLastLanguage } from '../quick-add/useLastLanguage';
import styles from './LibraryPage.module.css';

export function LibraryPage() {
  const [lang, setLang] = useLastLanguage();
  const [params, setParams] = useSearchParams();
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [counts, setCounts] = useState<SetCounts | null>(null);
  const [subCounts, setSubCounts] = useState<Record<ConceptKind, number> | null>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [sets, setSets] = useState<WordSet[]>([]);
  // How many lessons the open deck has (for its "Bài" card).
  const [lessonTotal, setLessonTotal] = useState<number | null>(null);

  // Landing = deck cards only. The words are read after a deck card is
  // opened (address ?deck=general | all | <deck id>).
  const requested = deckFromKey(params.get('deck'));
  const activeFilter: SetFilter | null =
    requested && requested.kind === 'set' && !sets.some((s) => s.id === requested.id) ? GENERAL_FILTER : requested;
  const activeKey = activeFilter ? deckToKey(activeFilter) : null;
  // Inside a deck: two sub decks. Rows load only after one is opened (&sub=word|concept).
  const subParam = params.get('sub');
  const activeSub: ConceptKind | null = activeFilter && (subParam === 'word' || subParam === 'concept') ? subParam : null;
  const SUB_LABEL: Record<ConceptKind, string> = { concept: 'Concept', word: 'Word' };
  // The third card of a deck: its lessons (&sub=lesson, and &lesson=<id|none> for one lesson).
  const inLessons = !!activeFilter && activeFilter.kind !== 'all' && subParam === 'lesson';
  const lessonParam = params.get('lesson');

  async function refresh() {
    const list = await listWordSets(lang);
    setSets(list);
    if (activeFilter) {
      const filter: SetFilter =
        activeFilter.kind === 'set' && !list.some((s) => s.id === activeFilter.id) ? GENERAL_FILTER : activeFilter;
      if (activeSub) setConcepts(await listDeckConcepts(lang, filter, list, activeSub));
      else {
        setSubCounts(await countSubDecks(lang, filter, list));
        const deck = deckOfFilter(filter);
        setLessonTotal(deck.ok ? (await listLessons(lang, deck.setId)).length : null);
      }
    } else {
      setCounts(await countDecks(lang, list));
    }
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
    setConcepts(null);
    setCounts(null);
    setSubCounts(null);
    setLessonTotal(null);
    void refresh();
    void loadInboxCount();
  }, [lang, activeKey, activeSub]);

  // Any change to a concept (a lookup result, a delete, "Hoàn tác" on the
  // toast after one) refreshes what is on screen: no stale rows or counts.
  useEffect(() => {
    const watch = liveQuery(async () => [await db.concepts.count(), (await db.concepts.orderBy('updatedAt').last())?.updatedAt]);
    let first = true;
    const sub = watch.subscribe(() => {
      if (first) {
        first = false; // the initial load is done by the effect above
        return;
      }
      void refresh();
    });
    return () => sub.unsubscribe();
  }, [lang, activeKey, activeSub]);

  // Lookup results arrive in the background: refresh the open deck as they do.
  const queue = useLookupQueue();
  useEffect(() => {
    if (activeSub) void refresh();
  }, [queue.done, queue.status]);

  const visible = concepts;
  const deckName = !activeFilter
    ? ''
    : activeFilter.kind === 'none'
      ? GENERAL_DECK_NAME
      : activeFilter.kind === 'all'
        ? 'Tất cả'
        : (sets.find((s) => s.id === activeFilter.id)?.name ?? '');
  const subCards: Array<{ key: ConceptKind | 'lesson'; label: string; hint: string }> = [
    { key: 'concept', label: `Concept ${deckName}`, hint: 'Các ý; bấm một ý để xem example của nó' },
    { key: 'word', label: `Word ${deckName}`, hint: 'Các word đứng riêng (từ hoặc cụm)' },
    ...(activeFilter && activeFilter.kind !== 'all'
      ? [{ key: 'lesson' as const, label: `Lesson ${deckName}`, hint: 'Các lesson (chủ đề) của deck; bấm một lesson để xem các từ của nó' }]
      : []),
  ];
  const cards: Array<{ key: string; label: string; n: number }> = counts
    ? [
        { key: 'general', label: GENERAL_DECK_NAME, n: counts.none },
        ...sets.map((set) => ({ key: set.id, label: set.name, n: counts.bySet.get(set.id) ?? 0 })),
      ]
    : [];

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Thư viện</h1>
        <div className={styles.headerActions}>
          <LangToggle value={lang} onChange={setLang} />
          <SearchLink />
        </div>
      </div>

      {activeFilter ? (
        <div className={styles.filters}>
          <LinkButton
            to={
              inLessons && lessonParam
                ? `/library?deck=${deckToKey(activeFilter)}&sub=lesson`
                : activeSub || inLessons
                  ? `/library?deck=${deckToKey(activeFilter)}`
                  : '/library'
            }
          >
            {inLessons && lessonParam
              ? `← Lesson ${deckName}`
              : activeSub || inLessons
                ? `← ${deckName}`
                : '← Các deck'}
          </LinkButton>
          <strong>
            {inLessons ? `Lesson ${deckName}` : activeSub ? `${SUB_LABEL[activeSub]} ${deckName}` : deckName}
          </strong>
        </div>
      ) : (
        <>
          <div className={styles.deckGrid} role="list" aria-label="Deck">
            {cards.map((card) => (
              <button
                key={card.key}
                type="button"
                role="listitem"
                className={styles.deckCard}
                onClick={() => setParams({ deck: card.key })}
              >
                <span className={styles.deckName}>{card.label}</span>
                <span className={styles.deckCount}>{card.n} concept</span>
              </button>
            ))}
          </div>
          <div className={styles.filters}>
            {counts && (
              <button type="button" className={styles.filter} onClick={() => setParams({ deck: 'all' })}>
                Xem tất cả <strong>{counts.all}</strong>
              </button>
            )}
            <LinkButton to="/sets">Quản lý deck</LinkButton>
            <LinkButton to="/lessons">Quản lý lesson</LinkButton>
          </div>
        </>
      )}

      {activeFilter && !activeSub && !inLessons && (
        <div className={styles.deckGrid} role="list" aria-label="Sub deck">
          {subCards.map((card) => (
            <button
              key={card.key}
              type="button"
              role="listitem"
              className={styles.deckCard}
              onClick={() => setParams({ deck: deckToKey(activeFilter), sub: card.key })}
            >
              <span className={styles.deckName}>{card.label}</span>
              <span className={styles.deckCount}>
                {card.key === 'lesson'
                  ? lessonTotal === null
                    ? '…'
                    : `${lessonTotal} lesson`
                  : subCounts
                    ? `${subCounts[card.key]} mục`
                    : '…'}
              </span>
              <span className={styles.deckHint}>{card.hint}</span>
            </button>
          ))}
        </div>
      )}

      {activeFilter && inLessons && (
        <LessonBrowser
          lang={lang}
          filter={activeFilter}
          sets={sets}
          lessonKey={lessonParam}
          onOpen={(key) => setParams({ deck: deckToKey(activeFilter), sub: 'lesson', lesson: key })}
        />
      )}

      <Link to="/import" className={styles.banner}>
        <Card tinted>Nhập từ file CSV/XLSX →</Card>
      </Link>

      <Link to="/passages" className={styles.banner}>
        <Card tinted>Đoạn văn (học theo ngữ cảnh, điền vào chỗ trống) →</Card>
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

      {activeSub && visible && <LookupBar concepts={visible} />}

      {activeSub && concepts && concepts.length === 0 && (
        <p className={styles.empty}>Sub deck này còn trống. Dùng nút "+" để thêm.</p>
      )}

      <div className={styles.list}>
        {visible?.map((concept) => (
          <ConceptRow key={concept.id} concept={concept} />
        ))}
      </div>
    </section>
  );
}
