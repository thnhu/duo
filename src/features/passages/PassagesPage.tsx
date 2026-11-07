import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import { InlineConfirm } from '../../ui/InlineConfirm';
import { LangToggle } from '../../ui/LangToggle';
import { LinkButton } from '../../ui/LinkButton';
import { useToast } from '../../ui/Toast';
import type { Passage, WordSet } from '../../db/types';
import {
  countGapsOf,
  countPassagesByDeck,
  deletePassage,
  listPassagesOfDeck,
  movePassagesToDeck,
  undoMovePassages,
} from '../../passages';
import { DeckSelect } from '../sets/DeckSelect';
import fieldStyles from '../../ui/field.module.css';
import { GENERAL_DECK_NAME, listWordSets } from '../../wordsets';
import { useLastLanguage } from '../quick-add/useLastLanguage';
import libraryStyles from '../library/LibraryPage.module.css';
import styles from '../quick-add/AddPassageForm.module.css';

const GENERAL = 'general';
const PREVIEW_LENGTH = 120;

// The passages of one language, deck by deck. It opens on deck cards (numbers
// only); a deck's passages are read when its card is opened, so the screen
// does not load every passage text. Studying them is in Học → "Điền vào đoạn
// văn".
export function PassagesPage() {
  const [lang, setLang] = useLastLanguage();
  const [params, setParams] = useSearchParams();
  const [decks, setDecks] = useState<WordSet[] | null>(null);
  const [counts, setCounts] = useState<{ general: number; bySet: Map<string, number> } | null>(null);
  const [passages, setPassages] = useState<Passage[] | null>(null);
  const [gapCounts, setGapCounts] = useState<Map<string, number>>(new Map());
  const [confirming, setConfirming] = useState<string | null>(null);
  // The deck the opened deck's passages would be moved to ('' = General).
  const [moveTo, setMoveTo] = useState('');
  const toast = useToast();

  // ?deck=general | <deck id>: which deck's passages are open (none = the cards).
  const deckParam = params.get('deck');
  const openDeck = deckParam && (deckParam === GENERAL || decks?.some((d) => d.id === deckParam)) ? deckParam : null;
  const openName = openDeck === GENERAL ? GENERAL_DECK_NAME : (decks?.find((d) => d.id === openDeck)?.name ?? '');

  async function load() {
    const list = await listWordSets(lang);
    setDecks(list);
    const ids = list.map((d) => d.id);
    if (deckParam && (deckParam === GENERAL || ids.includes(deckParam))) {
      const rows = await listPassagesOfDeck(lang, deckParam === GENERAL ? undefined : deckParam, ids);
      setPassages(rows);
      setGapCounts(await countGapsOf(rows.map((p) => p.id)));
    } else {
      setPassages(null);
      setCounts(await countPassagesByDeck(lang, ids));
    }
  }

  useEffect(() => {
    setConfirming(null);
    setPassages(null);
    setCounts(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, deckParam]);

  async function handleDelete(passage: Passage) {
    const removed = await deletePassage(passage.id);
    setConfirming(null);
    toast.show(`Đã xóa đoạn văn và ${removed} lỗ. Các word vẫn còn trong thư viện.`, { kind: 'info' });
    await load();
  }

  async function handleMoveAll() {
    if (!passages || passages.length === 0) return;
    const target = moveTo || undefined;
    const undo = await movePassagesToDeck(passages.map((p) => p.id), target);
    const targetName = target ? (decks?.find((d) => d.id === target)?.name ?? '') : GENERAL_DECK_NAME;
    toast.show(`Đã chuyển ${undo.previous.length} đoạn văn sang deck "${targetName}".`, {
      action: {
        label: 'Hoàn tác',
        onClick: () => {
          void undoMovePassages(undo).then(() => load());
        },
      },
    });
    // Show them where they are now.
    setParams({ deck: target ?? GENERAL });
  }

  const cards = counts
    ? [
        { key: GENERAL, label: GENERAL_DECK_NAME, n: counts.general },
        ...(decks ?? []).map((d) => ({ key: d.id, label: d.name, n: counts.bySet.get(d.id) ?? 0 })),
      ]
    : [];
  const total = cards.reduce((sum, card) => sum + card.n, 0);

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1>Đoạn văn</h1>
        <LangToggle
          value={lang}
          onChange={(next) => {
            setLang(next);
            setParams({});
          }}
        />
      </div>
      <ButtonRow>
        <LinkButton to="/add/passage" variant="secondary">
          Thêm đoạn văn
        </LinkButton>
        <LinkButton to="/learn">Ôn ở Học</LinkButton>
      </ButtonRow>

      {openDeck && (
        <div className={libraryStyles.filters}>
          <LinkButton to="/passages">← Các deck</LinkButton>
          <strong>{openName}</strong>
        </div>
      )}

      {!openDeck && counts && (
        <>
          {total === 0 && (
            <p className={styles.meta}>
              Chưa có đoạn văn nào. <Link to="/add/passage">Thêm đoạn văn</Link> rồi đục lỗ những word cần học.
            </p>
          )}
          <div className={libraryStyles.deckGrid} role="list" aria-label="Deck">
            {cards.map((card) => (
              <button
                key={card.key}
                type="button"
                role="listitem"
                className={libraryStyles.deckCard}
                onClick={() => setParams({ deck: card.key })}
              >
                <span className={libraryStyles.deckName}>{card.label}</span>
                <span className={libraryStyles.deckCount}>{card.n} đoạn văn</span>
              </button>
            ))}
          </div>
        </>
      )}

      {openDeck && passages && passages.length > 0 && (
        <Card>
          <h2>Chuyển tất cả sang deck khác</h2>
          <DeckSelect
            id="passages-move-to"
            lang={lang}
            value={moveTo}
            onChange={setMoveTo}
            remember={false}
            label={`Chuyển ${passages.length} đoạn văn của "${openName}" sang`}
          />
          <p className={fieldStyles.hint}>
            Chỉ đổi deck của đoạn văn. Các word trong lỗ vẫn nằm ở deck của chúng. Có thể Hoàn tác ngay sau đó.
          </p>
          <ButtonRow>
            <Button
              variant="secondary"
              disabled={(moveTo || GENERAL) === openDeck}
              onClick={() => void handleMoveAll()}
            >
              Chuyển {passages.length} đoạn văn
            </Button>
          </ButtonRow>
        </Card>
      )}

      {openDeck && passages && passages.length === 0 && (
        <p className={styles.meta}>Deck này chưa có đoạn văn nào.</p>
      )}

      {openDeck &&
        passages?.map((passage) => (
          <Card key={passage.id}>
            <div className={styles.title}>{passage.title || passage.text.slice(0, 40)}</div>
            <p className={styles.meta}>{gapCounts.get(passage.id) ?? 0} lỗ</p>
            {/* A short preview: the whole text is shown when the passage is opened to edit. */}
            <p className={styles.text}>
              {passage.text.length > PREVIEW_LENGTH ? `${passage.text.slice(0, PREVIEW_LENGTH)}…` : passage.text}
            </p>
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
