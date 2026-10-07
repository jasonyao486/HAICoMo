import type { Task } from "./domain";

export const NODE_WIDTH = 280, NODE_HEIGHT = 96;
const DX = 350, DY = 122, GAP = 48;
export type GraphPoint = { x: number; y: number };

/** Deterministic layout; disconnected components are packed instead of forming one tall column. */
export function graphLayout(tasks: Task[], mindmap: boolean) {
  const ids = new Set(tasks.map(t => t.id));
  const incoming = new Map(tasks.map(t => [t.id, (mindmap ? t.parentId ? [t.parentId] : [] : t.dependencies).filter(id => ids.has(id))]));
  const outgoing = new Map(tasks.map(t => [t.id, [] as string[]]));
  incoming.forEach((parents, id) => parents.forEach(p => outgoing.get(p)!.push(id)));
  const visited = new Set<string>();
  const blocks: { points: Map<string, GraphPoint>; width: number; height: number }[] = [];
  for (const task of tasks) {
    if (visited.has(task.id)) continue;
    const component: string[] = [], queue = [task.id];
    visited.add(task.id);
    while (queue.length) {
      const id = queue.shift()!; component.push(id);
      for (const other of [...incoming.get(id)!, ...outgoing.get(id)!]) if (!visited.has(other)) { visited.add(other); queue.push(other); }
    }
    const points = new Map<string, GraphPoint>();
    if (mindmap) {
      let leaf = 0;
      const place = (id: string, depth: number): number => {
        const children = outgoing.get(id)!;
        const ys = children.map(child => place(child, depth + 1));
        const y = ys.length ? (ys[0] + ys.at(-1)!) / 2 : leaf++ * DY;
        points.set(id, { x: depth * DX, y }); return y;
      };
      component.filter(id => !incoming.get(id)!.length).forEach(id => place(id, 0));
    } else {
      const pending = new Set(component), levels = new Map<string, number>();
      while (pending.size) {
        let progress = false;
        for (const id of pending) if (incoming.get(id)!.every(p => levels.has(p))) {
          levels.set(id, Math.max(-1, ...incoming.get(id)!.map(p => levels.get(p)!)) + 1);
          pending.delete(id); progress = true;
        }
        if (!progress) throw new Error("DEPENDENCY_CYCLE");
      }
      const layers = new Map<number, string[]>();
      component.forEach(id => { const n = levels.get(id)!; layers.set(n, [...layers.get(n) ?? [], id]); });
      const positions = new Map<string, number>();
      for (let n = 0; n <= Math.max(...levels.values()); n++) {
        const layer = layers.get(n)!;
        const centre = (id: string) => {
          const parents = incoming.get(id)!;
          return parents.length ? parents.reduce((a, p) => a + positions.get(p)!, 0) / parents.length : component.indexOf(id);
        };
        layer.sort((a, b) => centre(a) - centre(b));
        layer.forEach((id, row) => { positions.set(id, row); points.set(id, { x: n * DX, y: row * DY }); });
      }
    }
    blocks.push({ points, width: Math.max(0, ...[...points.values()].map(p => p.x)) + NODE_WIDTH, height: Math.max(0, ...[...points.values()].map(p => p.y)) + NODE_HEIGHT });
  }
  const target = Math.max(960, Math.min(4000, Math.sqrt(blocks.reduce((a, b) => a + (b.width + GAP) * (b.height + GAP), 0) * 2.5)));
  const points = new Map<string, GraphPoint>();
  let x = GAP, y = GAP, rowHeight = 0, width = 0;
  for (const block of blocks) {
    if (x > GAP && x + block.width > target) { x = GAP; y += rowHeight + GAP; rowHeight = 0; }
    block.points.forEach((p, id) => points.set(id, { x: p.x + x, y: p.y + y }));
    width = Math.max(width, x + block.width + GAP); rowHeight = Math.max(rowHeight, block.height); x += block.width + GAP;
  }
  return { points, incoming, width: Math.max(640, width), height: Math.max(320, y + rowHeight + GAP) };
}
