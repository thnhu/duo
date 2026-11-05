import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import fieldStyles from '../../ui/field.module.css';
import { SETTINGS_ID } from '../../db/defaults';
import { conceptRepository, settingsRepository } from '../../db/repositories';
import type { Concept, ConceptLinkType } from '../../db/types';
import {
  LINK_FAILURE_TEXT,
  buildTree,
  linkConcepts,
  listGroupedExamples,
  listNeighbours,
  unlinkConcepts,
  type ConceptNeighbours,
  type GroupedExamples,
  type TreeNode,
} from '../../links';
import { CONCEPT_LINK_LABEL, EXAMPLE_LINK_LABEL } from '../../links/labels';
import styles from './TreePage.module.css';

// Tree screen (E5, spec 1.4): pick a concept and see where it sits. Parents
// above, children below as an indented list, and the examples grouped by how
// they are linked. It is only a view of the concept links: examples are never
// parents or children. Direction is always child -> parent.
export function TreePage() {
  const { conceptId } = useParams<{ conceptId: string }>();
  const navigate = useNavigate();

  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [types, setTypes] = useState<ConceptLinkType[]>(['typeOf', 'association']);
  const [root, setRoot] = useState<Concept | null>(null);
  const [neighbours, setNeighbours] = useState<ConceptNeighbours | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [examples, setExamples] = useState<GroupedExamples | null>(null);
  const [error, setError] = useState('');

  const [parentId, setParentId] = useState('');
  const [parentType, setParentType] = useState<ConceptLinkType>('typeOf');
  const [childId, setChildId] = useState('');
  const [childType, setChildType] = useState<ConceptLinkType>('typeOf');

  async function loadConcepts() {
    const [all, settings] = await Promise.all([
      conceptRepository.listActive(),
      settingsRepository.getById(SETTINGS_ID),
    ]);
    setConcepts(all.sort((a, b) => a.text.localeCompare(b.text)));
    setTypes(settings?.linkTypes.conceptConcept ?? ['typeOf', 'association']);
  }

  async function loadRoot(id: string) {
    const concept = await conceptRepository.getById(id);
    if (!concept || concept.deletedAt !== undefined) {
      setRoot(null);
      return;
    }
    setRoot(concept);
    const [n, t, e] = await Promise.all([listNeighbours(id), buildTree(id), listGroupedExamples(id)]);
    setNeighbours(n);
    setTree(t);
    setExamples(e);
  }

  useEffect(() => {
    void loadConcepts();
  }, []);

  useEffect(() => {
    setError('');
    setParentId('');
    setChildId('');
    if (conceptId) void loadRoot(conceptId);
    else setRoot(null);
  }, [conceptId]);

  async function addLink(kind: 'parent' | 'child') {
    if (!root) return;
    const other = kind === 'parent' ? parentId : childId;
    if (!other) return;
    const type = kind === 'parent' ? parentType : childType;
    // Always child -> parent: for a new parent, this concept is the child.
    const result =
      kind === 'parent' ? await linkConcepts(root.id, other, type) : await linkConcepts(other, root.id, type);
    if (!result.ok) {
      setError(LINK_FAILURE_TEXT[result.reason]);
      return;
    }
    setError('');
    setParentId('');
    setChildId('');
    await loadRoot(root.id);
  }

  async function removeLink(linkId: string) {
    await unlinkConcepts(linkId);
    if (root) await loadRoot(root.id);
  }

  // Candidates must share the dictionary; the rest is checked when saving.
  const sameDictionary = concepts.filter((c) => root && c.dictionaryId === root.dictionaryId && c.id !== root.id);
  const parentIds = new Set(neighbours?.parents.map((p) => p.concept.id));
  const childIds = new Set(neighbours?.children.map((c) => c.concept.id));

  return (
    <section className={styles.page}>
      <Link to="/library" className={styles.back}>
        ← Thư viện
      </Link>
      <h1>Cây concept</h1>

      <div>
        <label className={fieldStyles.label} htmlFor="tree-root">
          Concept
        </label>
        <select
          id="tree-root"
          className={fieldStyles.input}
          value={conceptId ?? ''}
          onChange={(e) => navigate(e.target.value ? `/tree/${e.target.value}` : '/tree')}
        >
          <option value="">Chọn concept…</option>
          {concepts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.text} ({c.lang === 'en' ? 'Anh' : 'Đức'})
            </option>
          ))}
        </select>
      </div>

      {!conceptId && (
        <p className={styles.hint}>
          Chọn một concept để xem concept cha, concept con và các ví dụ của nó. Liên kết luôn ghi theo chiều con → cha
          (ví dụ "hello" là một Type of "greeting").
        </p>
      )}

      {conceptId && !root && <p>Không tìm thấy concept.</p>}

      {root && neighbours && tree && examples && (
        <>
          <Card className={styles.section}>
            <div className={styles.row}>
              <h2>{root.text}</h2>
              <Link to={`/library/${root.id}`}>Mở concept</Link>
            </div>
            {root.meanings[0] && <p className={styles.hint}>{root.meanings[0]}</p>}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
          </Card>

          <Card className={styles.section}>
            <h2>Concept cha ({neighbours.parents.length})</h2>
            {neighbours.parents.length === 0 && <p className={styles.hint}>Chưa có concept cha.</p>}
            {neighbours.parents.map(({ link, concept }) => (
              <div key={link.id} className={styles.row}>
                <span>
                  <Link to={`/tree/${concept.id}`} className={styles.nodeLink}>
                    {concept.text}
                  </Link>{' '}
                  <span className={styles.tag}>{CONCEPT_LINK_LABEL[link.type]}</span>
                </span>
                <Button variant="ghost" onClick={() => void removeLink(link.id)}>
                  Bỏ liên kết
                </Button>
              </div>
            ))}
            <LinkForm
              label="Thêm concept cha"
              options={sameDictionary.filter((c) => !parentIds.has(c.id))}
              types={types}
              concept={parentId}
              type={parentType}
              onConcept={setParentId}
              onType={setParentType}
              onAdd={() => void addLink('parent')}
              idPrefix="parent"
            />
          </Card>

          <Card className={styles.section}>
            <h2>Concept con ({neighbours.children.length})</h2>
            {tree.children.length === 0 && <p className={styles.hint}>Chưa có concept con.</p>}
            <TreeList nodes={tree.children} depth={0} onRemove={(id) => void removeLink(id)} directIds={childIds} />
            <LinkForm
              label="Thêm concept con"
              options={sameDictionary.filter((c) => !childIds.has(c.id))}
              types={types}
              concept={childId}
              type={childType}
              onConcept={setChildId}
              onType={setChildType}
              onAdd={() => void addLink('child')}
              idPrefix="child"
            />
          </Card>

          <Card className={styles.section}>
            <h2>Ví dụ ({examples.home.length + examples.linked.reduce((n, g) => n + g.examples.length, 0)})</h2>
            {examples.home.length === 0 && examples.linked.length === 0 && (
              <p className={styles.hint}>Concept này chưa có ví dụ.</p>
            )}
            {examples.home.length > 0 && (
              <div className={styles.exampleGroup}>
                <span className={styles.tag}>Ví dụ của chính concept này</span>
                {examples.home.map((e) => (
                  <Link key={e.id} to={`/example/${e.id}`} className={styles.exampleText}>
                    {e.text}
                  </Link>
                ))}
              </div>
            )}
            {examples.linked.map((group) => (
              <div key={group.type} className={styles.exampleGroup}>
                <span className={styles.tag}>{EXAMPLE_LINK_LABEL[group.type]}</span>
                {group.examples.map((e) => (
                  <Link key={e.id} to={`/example/${e.id}`} className={styles.exampleText}>
                    {e.text}
                  </Link>
                ))}
              </div>
            ))}
          </Card>
        </>
      )}
    </section>
  );
}

// Descendants, indented by depth. Only the direct children (depth 0) can be
// unlinked here, because that is the link that belongs to this concept.
function TreeList({
  nodes,
  depth,
  onRemove,
  directIds,
}: {
  nodes: TreeNode[];
  depth: number;
  onRemove: (linkId: string) => void;
  directIds: Set<string>;
}) {
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
            {depth === 0 && node.link && directIds.has(node.concept.id) && (
              <Button variant="ghost" onClick={() => onRemove(node.link!.id)}>
                Bỏ liên kết
              </Button>
            )}
          </div>
          <TreeList nodes={node.children} depth={depth + 1} onRemove={onRemove} directIds={directIds} />
        </div>
      ))}
    </>
  );
}

function LinkForm(props: {
  label: string;
  idPrefix: string;
  options: Concept[];
  types: ConceptLinkType[];
  concept: string;
  type: ConceptLinkType;
  onConcept: (id: string) => void;
  onType: (type: ConceptLinkType) => void;
  onAdd: () => void;
}) {
  if (props.options.length === 0) return null;
  return (
    <div className={styles.section}>
      <label className={fieldStyles.label} htmlFor={`${props.idPrefix}-concept`}>
        {props.label}
      </label>
      <select
        id={`${props.idPrefix}-concept`}
        className={fieldStyles.input}
        value={props.concept}
        onChange={(e) => props.onConcept(e.target.value)}
      >
        <option value="">Chọn concept…</option>
        {props.options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.text}
          </option>
        ))}
      </select>
      <select
        id={`${props.idPrefix}-type`}
        aria-label="Loại liên kết"
        className={fieldStyles.input}
        value={props.type}
        onChange={(e) => props.onType(e.target.value as ConceptLinkType)}
      >
        {props.types.map((t) => (
          <option key={t} value={t}>
            {CONCEPT_LINK_LABEL[t]}
          </option>
        ))}
      </select>
      <Button variant="secondary" disabled={!props.concept} onClick={props.onAdd}>
        Thêm liên kết
      </Button>
    </div>
  );
}
