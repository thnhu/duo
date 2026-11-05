import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { HighlightedText } from '../../ui/HighlightedText';
import fieldStyles from '../../ui/field.module.css';
import { SETTINGS_ID } from '../../db/defaults';
import { dictionaryIdForLang } from '../../db/queries';
import { settingsRepository } from '../../db/repositories';
import type { AttributeValueSets, ConceptSource, Lang } from '../../db/types';
import {
  getSearchService,
  type SearchFacets,
  type SearchFilters,
  type SearchHit,
  type SearchSort,
} from '../../search';
import { saveQuickWord } from '../quick-add/actions';
import { useLastLanguage } from '../quick-add/useLastLanguage';
import { useSearch } from './useSearch';
import styles from './SearchPage.module.css';

type AttributeKey = keyof AttributeValueSets;

const ATTRIBUTES: Array<{ key: AttributeKey; label: string }> = [
  { key: 'tone', label: 'Tone' },
  { key: 'mode', label: 'Mode' },
  { key: 'register', label: 'Register' },
  { key: 'nuance', label: 'Nuance' },
  { key: 'dialect', label: 'Dialect' },
];

const SOURCES: Array<{ value: ConceptSource['type']; label: string }> = [
  { value: 'import', label: 'Nhập file' },
  { value: 'quick-add', label: 'Ghi nhanh' },
  { value: 'lookup', label: 'Tra cứu' },
];

const FIELD_LABEL: Record<string, string> = {
  meaning: 'Nghĩa',
  note: 'Ghi chú',
  lesson: 'Bài',
  expression: 'Cách nói',
};

function hitLink(hit: SearchHit): string {
  return hit.conceptId ? `/library/${hit.conceptId}` : '/inbox';
}

export function SearchPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [lastLang] = useLastLanguage();

  const text = params.get('q') ?? '';
  const [filters, setFilters] = useState<SearchFilters>({});
  const [sort, setSort] = useState<SearchSort>('relevance');
  const [showFilters, setShowFilters] = useState(false);
  const [attributeSets, setAttributeSets] = useState<AttributeValueSets | null>(null);
  const [facets, setFacets] = useState<SearchFacets>({ lessons: [] });

  // Value sets come from Settings (configurable), not hard-coded.
  useEffect(() => {
    void settingsRepository
      .getById(SETTINGS_ID)
      .then((s) => setAttributeSets(s?.attributeValueSets ?? null));
    void getSearchService().getFacets().then(setFacets);
  }, []);

  const { response, pending, failed } = useSearch({ text, filters, sort });
  const hits = response?.hits ?? [];
  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== false,
  ).length;
  const hasQuery = text.trim() !== '' || activeFilterCount > 0;

  function setFilter(patch: Partial<SearchFilters>) {
    setFilters((current) => {
      const next = { ...current, ...patch };
      for (const key of Object.keys(next) as Array<keyof SearchFilters>) {
        if (next[key] === undefined || next[key] === false) delete next[key];
      }
      return next;
    });
  }

  function setAttribute(key: AttributeKey, value: string) {
    const attributes = { ...(filters.attributes ?? {}) } as Record<string, string>;
    if (value) attributes[key] = value;
    else delete attributes[key];
    setFilter({
      attributes:
        Object.keys(attributes).length > 0
          ? (attributes as SearchFilters['attributes'])
          : undefined,
    });
  }

  // F3: no result -> add the word right from the search box.
  async function handleQuickAdd() {
    const lang: Lang = filters.lang ?? lastLang;
    const dictionaryId = await dictionaryIdForLang(lang);
    const { concept } = await saveQuickWord(dictionaryId, lang, text);
    navigate(`/library/${concept.id}`);
  }

  return (
    <section className={styles.page}>
      <h1>Tìm kiếm</h1>

      <input
        type="search"
        className={fieldStyles.input}
        value={text}
        onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
        placeholder="Từ, nghĩa, câu ví dụ, ghi chú…"
        aria-label="Tìm kiếm"
        autoFocus
      />

      <div className={styles.toolbar}>
        <Button
          variant="secondary"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          Bộ lọc{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
        <select
          className={`${fieldStyles.input} ${styles.sort}`}
          value={sort}
          onChange={(e) => setSort(e.target.value as SearchSort)}
          aria-label="Sắp xếp"
        >
          <option value="relevance">Liên quan nhất</option>
          <option value="recent">Mới nhất</option>
          <option value="alphabetical">A → Z</option>
        </select>
      </div>

      {showFilters && (
        <Card className={styles.filters}>
          <FilterSelect
            label="Ngôn ngữ"
            value={filters.lang ?? ''}
            onChange={(v) => setFilter({ lang: (v || undefined) as Lang | undefined })}
            options={[
              { value: 'en', label: 'Anh' },
              { value: 'de', label: 'Đức' },
            ]}
          />
          <FilterSelect
            label="Trạng thái học"
            value={filters.status ?? ''}
            onChange={(v) => setFilter({ status: (v || undefined) as SearchFilters['status'] })}
            options={[
              { value: 'loaded', label: 'Đang học' },
              { value: 'acquired', label: 'Đã thụ đắc' },
            ]}
          />
          <FilterSelect
            label="Độ kiểm chứng"
            value={filters.verification ?? ''}
            onChange={(v) =>
              setFilter({ verification: (v || undefined) as SearchFilters['verification'] })
            }
            options={[
              { value: 'unverified', label: 'Chưa duyệt' },
              { value: 'verified', label: 'Đã duyệt' },
            ]}
          />
          <FilterSelect
            label="Nguồn"
            value={filters.sourceType ?? ''}
            onChange={(v) =>
              setFilter({ sourceType: (v || undefined) as ConceptSource['type'] | undefined })
            }
            options={SOURCES}
          />
          {facets.lessons.length > 0 && (
            <FilterSelect
              label="Bài"
              value={filters.lesson ?? ''}
              onChange={(v) => setFilter({ lesson: v || undefined })}
              options={facets.lessons.map((l) => ({ value: l, label: l }))}
            />
          )}
          {attributeSets &&
            ATTRIBUTES.map(({ key, label }) => (
              <FilterSelect
                key={key}
                label={label}
                value={filters.attributes?.[key] ?? ''}
                onChange={(v) => setAttribute(key, v)}
                options={attributeSets[key].map((v) => ({ value: v, label: v }))}
              />
            ))}
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={filters.unlinkedOnly ?? false}
              onChange={(e) => setFilter({ unlinkedOnly: e.target.checked })}
            />
            Chỉ câu chưa gắn concept
          </label>
          <p className={fieldStyles.hint}>
            Lọc theo Tone/Mode/Register/Nuance/Dialect và "câu chưa gắn" chỉ áp dụng cho câu ví dụ.
          </p>
          {activeFilterCount > 0 && (
            <Button variant="ghost" onClick={() => setFilters({})}>
              Xóa bộ lọc
            </Button>
          )}
        </Card>
      )}

      {failed && <p className={styles.empty}>Không tìm được lúc này. Thử lại sau.</p>}
      {!hasQuery && (
        <p className={styles.empty}>Gõ để tìm — chạy ngay trên máy, không cần mạng.</p>
      )}

      {hasQuery && response && !pending && hits.length === 0 && (
        <Card tinted className={styles.noResult}>
          <p>Không tìm thấy kết quả.</p>
          {text.trim() && (
            <Button onClick={() => void handleQuickAdd()}>Thêm nhanh "{text.trim()}"</Button>
          )}
        </Card>
      )}

      {response && response.total > 0 && (
        <p className={styles.count}>
          {response.total} kết quả
          {response.total > hits.length ? ` (hiện ${hits.length} đầu)` : ''}
        </p>
      )}

      <div className={styles.list}>
        {hits.map((hit) => (
          <Link key={`${hit.kind}:${hit.id}`} to={hitLink(hit)} className={styles.rowLink}>
            <Card className={styles.row}>
              <div className={styles.rowHead}>
                <span className={hit.kind === 'concept' ? styles.rowText : styles.rowSentence}>
                  <HighlightedText text={hit.text} ranges={hit.ranges} />
                </span>
                <span className={styles.badges}>
                  <span className={styles.badge}>
                    {hit.kind === 'concept' ? (hit.isDepth ? 'Ý (Sâu)' : 'Từ') : hit.conceptId ? 'Ví dụ' : 'Chờ duyệt'}
                  </span>
                  <span className={styles.badge}>{hit.lang === 'en' ? 'Anh' : 'Đức'}</span>
                </span>
              </div>
              {hit.isDepth && hit.expressions && hit.expressions.length > 0 && (
                <div className={styles.snippet}>
                  <span className={styles.snippetLabel}>Cách diễn đạt: </span>
                  {hit.expressions.join(' · ')}
                </div>
              )}
              {hit.snippets
                .filter((snippet) => !(hit.isDepth && snippet.field === 'expression'))
                .map((snippet) => (
                <div key={snippet.field} className={styles.snippet}>
                  <span className={styles.snippetLabel}>{FIELD_LABEL[snippet.field]}: </span>
                  <HighlightedText text={snippet.text} ranges={snippet.ranges} />
                </div>
              ))}
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <div>
      <label className={fieldStyles.label}>
        {label}
        <select
          className={fieldStyles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Tất cả</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
