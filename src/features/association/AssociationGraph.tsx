import { useMemo } from 'react';
import type { ConceptLinkType } from '../../db/types';
import type { AssociationResult } from '../../links';
import { layoutGraph } from '../../links/graph';
import styles from './AssociationPage.module.css';

const WIDTH = 360;
const RADIUS = 9;

interface AssociationGraphProps {
  result: AssociationResult;
  // Tap on a node: a selected one is dropped, a related one is added.
  onToggle: (conceptId: string, selected: boolean) => void;
}

const shorten = (text: string) => (text.length > 16 ? `${text.slice(0, 15)}…` : text);

// The network as a picture (R7): red = chosen, grey = linked to a chosen one.
// Arrows point child -> parent; dashed lines are Association, solid Type of.
// Plain SVG, laid out here, so it needs no library and works offline.
export function AssociationGraph({ result, onToggle }: AssociationGraphProps) {
  const height = result.nodes.length <= 8 ? 320 : result.nodes.length <= 20 ? 420 : 560;
  const positions = useMemo(
    () =>
      layoutGraph(
        result.nodes.map((n) => n.concept.id),
        result.links.map((l) => ({ from: l.childId, to: l.parentId })),
        WIDTH,
        height,
        40,
      ),
    [result, height],
  );

  const dash = (type: ConceptLinkType) => (type === 'association' ? '5 4' : undefined);

  return (
    <svg
      className={styles.graph}
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label="Đồ thị liên kết giữa các concept"
    >
      <defs>
        <marker id="assoc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrowHead} />
        </marker>
      </defs>
      {result.links.map((l) => {
        const a = positions.get(l.childId);
        const b = positions.get(l.parentId);
        if (!a || !b) return null;
        const d = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1);
        const ux = (b.x - a.x) / d;
        const uy = (b.y - a.y) / d;
        return (
          <line
            key={l.id}
            className={styles.edge}
            x1={a.x + ux * RADIUS}
            y1={a.y + uy * RADIUS}
            x2={b.x - ux * (RADIUS + 2)}
            y2={b.y - uy * (RADIUS + 2)}
            strokeDasharray={dash(l.type)}
            markerEnd="url(#assoc-arrow)"
          />
        );
      })}
      {result.nodes.map(({ concept, selected }) => {
        const p = positions.get(concept.id);
        if (!p) return null;
        return (
          <g
            key={concept.id}
            className={styles.node}
            role="button"
            tabIndex={0}
            aria-label={`${concept.text}: ${selected ? 'bỏ chọn' : 'thêm vào lựa chọn'}`}
            onClick={() => onToggle(concept.id, selected)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onToggle(concept.id, selected);
            }}
          >
            {/* Bigger invisible target: fingers are wider than the dot. */}
            <circle cx={p.x} cy={p.y} r={22} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={RADIUS} className={selected ? styles.nodeSelected : styles.nodeRelated} />
            <text x={p.x} y={p.y + RADIUS + 14} textAnchor="middle" className={styles.label}>
              {shorten(concept.text)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
