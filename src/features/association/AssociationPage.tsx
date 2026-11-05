import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import { LinkButton } from '../../ui/LinkButton';
import { conceptRepository } from '../../db/repositories';
import type { Concept } from '../../db/types';
import { MAX_ASSOCIATION_SELECTION, searchAssociations, type AssociationResult } from '../../links';
import { CONCEPT_LINK_LABEL } from '../../links/labels';
import { ConceptPicker } from '../links/ConceptPicker';
import { AssociationGraph } from './AssociationGraph';
import styles from './AssociationPage.module.css';

// Search Concept Association (R7): choose up to 10 concepts, see every concept
// linked to them, as a picture and as a list. The point of the whole tool:
// recalling a word through the network of ideas around it.
export function AssociationPage() {
  const { conceptId } = useParams<{ conceptId?: string }>();
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [result, setResult] = useState<AssociationResult | null>(null);

  useEffect(() => {
    void conceptRepository.listActive().then((all) => {
      setConcepts(all);
      if (conceptId && all.some((c) => c.id === conceptId)) setSelectedIds([conceptId]);
    });
  }, [conceptId]);

  useEffect(() => {
    let cancelled = false;
    void searchAssociations(selectedIds).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedIds]);

  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const full = selectedIds.length >= MAX_ASSOCIATION_SELECTION;

  function add(id: string) {
    setSelectedIds((cur) => (cur.includes(id) || cur.length >= MAX_ASSOCIATION_SELECTION ? cur : [...cur, id]));
  }
  function remove(id: string) {
    setSelectedIds((cur) => cur.filter((x) => x !== id));
  }

  const related = result?.nodes.filter((n) => !n.selected) ?? [];

  // How a related concept connects to the chosen ones, read child -> parent.
  function describe(id: string): string[] {
    if (!result) return [];
    return result.links
      .filter((l) => (l.childId === id && selectedIds.includes(l.parentId)) || (l.parentId === id && selectedIds.includes(l.childId)))
      .map(
        (l) => `${byId.get(l.childId)?.text ?? '?'} → ${byId.get(l.parentId)?.text ?? '?'} · ${CONCEPT_LINK_LABEL[l.type]}`,
      );
  }

  return (
    <section className={styles.page}>
      <Link to="/search" className={styles.back}>
        ← Tìm kiếm
      </Link>
      <h1>Tìm theo liên kết</h1>
      <p className={styles.hint}>
        Chọn tối đa {MAX_ASSOCIATION_SELECTION} concept để thấy các concept nối với chúng (cha hoặc con, một bước).
      </p>

      {!full && (
        <ConceptPicker
          id="assoc-pick"
          label={`Thêm concept (${selectedIds.length}/${MAX_ASSOCIATION_SELECTION})`}
          concepts={concepts.filter((c) => !selectedIds.includes(c.id))}
          selected={null}
          onSelect={(c) => c && add(c.id)}
        />
      )}
      {full && <p className={styles.hint}>Đã đủ {MAX_ASSOCIATION_SELECTION} concept; bỏ bớt để chọn thêm.</p>}

      {selectedIds.length > 0 && (
        <div className={styles.chips}>
          {selectedIds.map((id) => (
            <button key={id} type="button" className={styles.chip} onClick={() => remove(id)} aria-label={`Bỏ ${byId.get(id)?.text ?? ''}`}>
              {byId.get(id)?.text ?? '?'} <span aria-hidden>✕</span>
            </button>
          ))}
          <Button variant="ghost" onClick={() => setSelectedIds([])}>
            Bỏ hết
          </Button>
        </div>
      )}

      {result && result.nodes.length > 0 && (
        <Card className={styles.graphCard}>
          <AssociationGraph
            result={result}
            onToggle={(id, selected) => (selected ? remove(id) : add(id))}
          />
          <div className={styles.legend}>
            <span>
              <span className={`${styles.dot} ${styles.dotSelected}`} />
              Đã chọn
            </span>
            <span>
              <span className={`${styles.dot} ${styles.dotRelated}`} />
              Liên quan
            </span>
            <span>Mũi tên: con → cha</span>
            <span>Nét đứt: Association</span>
          </div>
          <p className={styles.hint}>Chạm một nút xám để thêm vào lựa chọn, chạm nút đỏ để bỏ.</p>
        </Card>
      )}

      {selectedIds.length > 0 && result && related.length === 0 && (
        <p className={styles.hint}>Các concept đã chọn chưa nối với concept nào khác.</p>
      )}

      {related.length > 0 && (
        <div className={styles.related}>
          <h2>Concept liên quan ({related.length})</h2>
          {related.map(({ concept }) => (
            <div key={concept.id} className={styles.relatedRow}>
              <span>
                <strong>{concept.text}</strong>
                {concept.meanings[0] && <span className={styles.desc}>{concept.meanings[0]}</span>}
                {describe(concept.id).map((line) => (
                  <span key={line} className={styles.desc}>
                    {line}
                  </span>
                ))}
              </span>
              <ButtonRow>
                <Button variant="secondary" disabled={full} onClick={() => add(concept.id)}>
                  Thêm vào lựa chọn
                </Button>
                <LinkButton to={`/tree/${concept.id}`}>Xem cây</LinkButton>
              </ButtonRow>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
