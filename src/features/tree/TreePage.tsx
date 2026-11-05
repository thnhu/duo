import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ButtonRow } from '../../ui/ButtonRow';
import { Card } from '../../ui/Card';
import { HighlightedText } from '../../ui/HighlightedText';
import { LinkButton } from '../../ui/LinkButton';
import { conceptRepository } from '../../db/repositories';
import type { Concept, Example, ExampleLinkType } from '../../db/types';
import {
  buildTree,
  listGroupedExamples,
  listNeighbours,
  type ConceptNeighbours,
  type GroupedExamples,
  type TreeNode,
} from '../../links';
import { CONCEPT_LINK_LABEL, EXAMPLE_LINK_LABEL } from '../../links/labels';
import { ConceptPicker } from '../links/ConceptPicker';
import styles from './TreePage.module.css';

// Tree screen (E5, spec 1.4, R6): parents above, the concept in the middle,
// children below. Under the concept a row of counters, one per example link
// type; tapping one lists those examples. It is only a view: links are edited
// on /links, and examples are never parents or children.
const HOME = 'home';
type Shown = typeof HOME | ExampleLinkType;

// Fixed order of the example link types (the PVO order).
const TYPE_ORDER = Object.keys(EXAMPLE_LINK_LABEL) as ExampleLinkType[];

export function TreePage() {
  const { conceptId } = useParams<{ conceptId: string }>();
  const navigate = useNavigate();

  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [root, setRoot] = useState<Concept | null>(null);
  const [neighbours, setNeighbours] = useState<ConceptNeighbours | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [examples, setExamples] = useState<GroupedExamples | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    void conceptRepository.listActive().then((all) => setConcepts(all));
  }, []);

  useEffect(() => {
    setShown(null);
    setRoot(null);
    if (!conceptId) return;
    let cancelled = false;
    void (async () => {
      const concept = await conceptRepository.getById(conceptId);
      if (cancelled || !concept || concept.deletedAt !== undefined) return;
      const [n, t, e] = await Promise.all([
        listNeighbours(conceptId),
        buildTree(conceptId),
        listGroupedExamples(conceptId),
      ]);
      if (cancelled) return;
      setRoot(concept);
      setNeighbours(n);
      setTree(t);
      setExamples(e);
      // Open the first list that has something in it.
      setShown(e.home.length > 0 ? HOME : (e.linked[0]?.type ?? null));
    })();
    return () => {
      cancelled = true;
    };
  }, [conceptId]);

  const counts = useMemo(() => {
    const map = new Map<Shown, Example[]>();
    map.set(HOME, examples?.home ?? []);
    for (const t of TYPE_ORDER) map.set(t, examples?.linked.find((g) => g.type === t)?.examples ?? []);
    return map;
  }, [examples]);

  return (
    <section className={styles.page}>
      <Link to="/library" className={styles.back}>
        ← Thư viện
      </Link>
      <h1>Cây concept</h1>

      {!conceptId && (
        <>
          <ConceptPicker
            id="tree-root"
            label="Chọn concept"
            concepts={concepts}
            selected={null}
            onSelect={(c) => c && navigate(`/tree/${c.id}`)}
          />
          <p className={styles.hint}>
            Chọn một concept để xem concept cha ở trên, concept con ở dưới và các ví dụ của nó. Liên kết luôn đọc theo
            chiều con → cha (ví dụ “hello” là một Type of “greeting”).
          </p>
        </>
      )}

      {conceptId && !root && <p className={styles.hint}>Đang tải… (hoặc không tìm thấy concept).</p>}

      {root && neighbours && tree && examples && (
        <>
          <div className={styles.zone}>
            <h2 className={styles.zoneTitle}>Cha ({neighbours.parents.length})</h2>
            {neighbours.parents.length === 0 && <p className={styles.hint}>Chưa có concept cha.</p>}
            {neighbours.parents.map(({ link, concept }) => (
              <Link key={link.id} to={`/tree/${concept.id}`} className={styles.neighbour}>
                <span className={styles.tag}>{CONCEPT_LINK_LABEL[link.type]}</span>
                <strong>{concept.text}</strong>
                {concept.meanings[0] && <span className={styles.desc}>{concept.meanings[0]}</span>}
              </Link>
            ))}
          </div>

          <Card className={styles.center}>
            <div>
              <h2 className={styles.rootName}>{root.text}</h2>
              {root.meanings[0] && <p className={styles.hint}>{root.meanings[0]}</p>}
            </div>
            <ButtonRow>
              <LinkButton to={`/library/${root.id}`}>Mở concept</LinkButton>
              <LinkButton to={`/links/${root.id}`}>Liên kết cha/con</LinkButton>
            </ButtonRow>

            <div className={styles.counters} role="group" aria-label="Ví dụ theo loại liên kết">
              {([HOME, ...TYPE_ORDER] as Shown[]).map((key) => {
                const count = counts.get(key)?.length ?? 0;
                const label = key === HOME ? 'Của concept' : EXAMPLE_LINK_LABEL[key as ExampleLinkType];
                return (
                  <button
                    key={key}
                    type="button"
                    className={[styles.counter, shown === key ? styles.counterOn : ''].filter(Boolean).join(' ')}
                    aria-pressed={shown === key}
                    disabled={count === 0}
                    onClick={() => setShown(key)}
                  >
                    {label} <strong>{count}</strong>
                  </button>
                );
              })}
            </div>

            {shown && (counts.get(shown)?.length ?? 0) > 0 ? (
              <div className={styles.exampleList}>
                {counts.get(shown)!.map((e) => (
                  <div key={e.id} className={styles.example}>
                    <span>
                      <HighlightedText text={e.text} ranges={e.highlight ? [[e.highlight.start, e.highlight.end]] : []} />
                    </span>
                    <LinkButton to={`/example/${e.id}`}>Sửa</LinkButton>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.hint}>Concept này chưa có ví dụ.</p>
            )}
          </Card>

          <div className={styles.zone}>
            <h2 className={styles.zoneTitle}>Con ({neighbours.children.length})</h2>
            {tree.children.length === 0 && <p className={styles.hint}>Chưa có concept con.</p>}
            <TreeList nodes={tree.children} depth={0} />
          </div>
        </>
      )}
    </section>
  );
}

// Descendants, indented by depth.
function TreeList({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  return (
    <>
      {nodes.map((node) => (
        <div key={`${node.concept.id}:${node.link?.id}`}>
          <div className={styles.node} style={{ marginLeft: `calc(var(--space-4) * ${depth})` }}>
            <Link to={`/tree/${node.concept.id}`} className={styles.nodeLink}>
              {node.concept.text}
            </Link>
            {node.link && <span className={styles.tag}>{CONCEPT_LINK_LABEL[node.link.type]}</span>}
            {node.cyclic && <span className={styles.cyclic}>vòng lặp, dừng ở đây</span>}
          </div>
          <TreeList nodes={node.children} depth={depth + 1} />
        </div>
      ))}
    </>
  );
}
