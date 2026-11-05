// Small force-directed layout for the association picture (no library, runs
// on the spot). Deterministic: nodes start on a circle in the given order, so
// the same network always draws the same way.

export interface Point {
  x: number;
  y: number;
}

export function layoutGraph(
  ids: string[],
  edges: Array<{ from: string; to: string }>,
  width: number,
  height: number,
  padding = 24,
): Map<string, Point> {
  const out = new Map<string, Point>();
  const n = ids.length;
  if (n === 0) return out;
  const cx = width / 2;
  const cy = height / 2;
  if (n === 1) {
    out.set(ids[0], { x: cx, y: cy });
    return out;
  }

  const radius = Math.min(width, height) * 0.35;
  const pos = ids.map((_, i) => ({
    x: cx + radius * Math.cos((2 * Math.PI * i) / n),
    y: cy + radius * Math.sin((2 * Math.PI * i) / n),
  }));
  const index = new Map(ids.map((id, i) => [id, i]));
  const pairs = edges
    .map((e) => [index.get(e.from), index.get(e.to)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined && p[0] !== p[1]);

  const k = Math.sqrt((width * height) / n) * 0.7;
  const iterations = 250;
  for (let step = 0; step < iterations; step++) {
    const temperature = (Math.min(width, height) / 10) * (1 - step / iterations) + 0.5;
    const dx = new Array<number>(n).fill(0);
    const dy = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = pos[i].x - pos[j].x;
        let vy = pos[i].y - pos[j].y;
        let d = Math.hypot(vx, vy);
        if (d < 0.01) {
          vx = 0.01 * (i - j);
          vy = 0.01;
          d = Math.hypot(vx, vy);
        }
        const force = (k * k) / d;
        dx[i] += (vx / d) * force;
        dy[i] += (vy / d) * force;
        dx[j] -= (vx / d) * force;
        dy[j] -= (vy / d) * force;
      }
    }
    for (const [a, b] of pairs) {
      const vx = pos[a].x - pos[b].x;
      const vy = pos[a].y - pos[b].y;
      const d = Math.max(Math.hypot(vx, vy), 0.01);
      const force = (d * d) / k;
      dx[a] -= (vx / d) * force;
      dy[a] -= (vy / d) * force;
      dx[b] += (vx / d) * force;
      dy[b] += (vy / d) * force;
    }
    for (let i = 0; i < n; i++) {
      // Gentle pull to the middle keeps separate islands on screen.
      dx[i] += (cx - pos[i].x) * 0.05;
      dy[i] += (cy - pos[i].y) * 0.05;
      const d = Math.max(Math.hypot(dx[i], dy[i]), 0.01);
      const move = Math.min(d, temperature);
      pos[i].x = Math.min(width - padding, Math.max(padding, pos[i].x + (dx[i] / d) * move));
      pos[i].y = Math.min(height - padding, Math.max(padding, pos[i].y + (dy[i] / d) * move));
    }
  }
  ids.forEach((id, i) => out.set(id, pos[i]));
  return out;
}
