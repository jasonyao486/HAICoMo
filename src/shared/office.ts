/** Presentation-only geometry. No mutations of tasks, assignments or execution state. */
export type Point = { x: number; y: number };
export type Obstacle = Point & { id: string; rx: number; ry: number };
export const WORLD_WIDTH = 1120;
export function officeLayout(taskIds: string[], actorCount: number) {
  const pairs = Math.max(8, Math.ceil((actorCount + 2) / 2)),
    rows = Math.ceil(pairs / 4);
  const seats = Array.from({ length: pairs * 2 }, (_, i) => ({
    x: 75 + (Math.floor(i / 2) % 4) * 280 + (i % 2) * 116,
    y: 210 + Math.floor(i / 8) * 130,
  }));
  const workY = 220 + rows * 130;
  const tables = taskIds.map((id, i) => ({
    id,
    x: 195 + (i % 3) * 355,
    y: workY + Math.floor(i / 3) * 235,
    rx: 98,
    ry: 47,
  }));
  const teas = Array.from({ length: pairs }, (_, i) => ({
    id: `tea-${i}`,
    x: (seats[i * 2].x + seats[i * 2 + 1].x) / 2,
    y: seats[i * 2].y - 8,
    rx: 30,
    ry: 22,
  }));
  const height = Math.max(740, workY + Math.ceil(taskIds.length / 3) * 235);
  const benches = seats.map((p, i) => ({
    ...p,
    id: `bench-${i}`,
    rx: 25,
    ry: 14,
  }));
  const plants = [workY - 80, height - 55].flatMap((y, row) =>
    [26, 1090].map((x, col) => ({
      id: `plant-${row}-${col}`,
      x,
      y,
      rx: 20,
      ry: 14,
    })),
  );
  return {
    width: WORLD_WIDTH,
    height,
    seats,
    tables,
    teas,
    benches,
    plants,
    workY,
  };
}
export function blocked(
  point: Point,
  obstacles: Obstacle[],
  ignore?: string,
  padding = 9,
) {
  return obstacles.some(
    (o) =>
      o.id !== ignore &&
      ((point.x - o.x) / (o.rx + padding)) ** 2 +
        ((point.y - o.y) / (o.ry + padding)) ** 2 <
        1,
  );
}
export function clearSegment(
  a: Point,
  b: Point,
  obstacles: Obstacle[],
  ignore?: string,
) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10));
  for (let i = 1; i <= n; i++)
    if (
      blocked(
        { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n },
        obstacles,
        ignore,
      )
    )
      return false;
  return true;
}
/** Sparse visibility graph around elliptical footprints; local obstacles keep large rooms cheap. */
export function route(
  from: Point,
  to: Point,
  all: Obstacle[],
  ignore?: string,
): Point[] {
  const obstacles = all.filter(
    (o) =>
      o.id !== ignore &&
      o.x + o.rx > Math.min(from.x, to.x) - 180 &&
      o.x - o.rx < Math.max(from.x, to.x) + 180 &&
      o.y + o.ry > Math.min(from.y, to.y) - 130 &&
      o.y - o.ry < Math.max(from.y, to.y) + 130,
  );
  if (clearSegment(from, to, obstacles)) return [to];
  // A dragged character may start inside furniture: first leave its footprint.
  const inside = obstacles.find((o) => blocked(from, [o]));
  if (inside) {
    const candidates = Array.from({ length: 12 }, (_, i) => ({
      x: inside.x + Math.cos((i * Math.PI) / 6) * (inside.rx + 24),
      y: inside.y + Math.sin((i * Math.PI) / 6) * (inside.ry + 24),
    })).filter((p) => !blocked(p, obstacles));
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - from.x, a.y - from.y) -
        Math.hypot(b.x - from.x, b.y - from.y),
    );
    if (candidates[0])
      return [candidates[0], ...route(candidates[0], to, obstacles)];
  }
  // Room aisles let distant tasks connect without constructing an enormous graph.
  if (Math.abs(to.y - from.y) > 500) {
    for (const x of [373, 750, 50, 1065].sort(
      (a, b) => Math.abs(a - from.x) - Math.abs(b - from.x),
    )) {
      for (const offset of [0, 65, -65]) {
        const entry = { x, y: from.y + offset },
          exit = { x, y: to.y + offset };
        if (
          clearSegment(from, entry, obstacles) &&
          clearSegment(entry, exit, obstacles) &&
          clearSegment(exit, to, obstacles)
        )
          return [entry, exit, to];
      }
    }
  }
  const nodes = [
    from,
    to,
    ...obstacles
      .flatMap((o) =>
        Array.from({ length: 12 }, (_, i) => ({
          x: o.x + Math.cos((i * Math.PI) / 6) * (o.rx + 30),
          y: o.y + Math.sin((i * Math.PI) / 6) * (o.ry + 30),
        })),
      )
      .filter(
        (p) => p.x > 18 && p.x < WORLD_WIDTH - 18 && !blocked(p, obstacles),
      ),
  ];
  const cost = nodes.map(() => Infinity),
    prev = nodes.map(() => -1),
    open = new Set(nodes.map((_, i) => i));
  cost[0] = 0;
  while (open.size) {
    let u = -1,
      best = Infinity;
    for (const i of open) {
      const f = cost[i] + Math.hypot(nodes[i].x - to.x, nodes[i].y - to.y);
      if (f < best) {
        u = i;
        best = f;
      }
    }
    if (u < 0) break;
    if (u === 1) {
      const result: Point[] = [];
      for (let i = 1; i !== 0; i = prev[i]) result.unshift(nodes[i]);
      return result;
    }
    open.delete(u);
    for (const v of open) {
      const next =
        cost[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].y - nodes[u].y);
      if (next < cost[v] && clearSegment(nodes[u], nodes[v], obstacles)) {
        cost[v] = next;
        prev[v] = u;
      }
    }
  }
  return []; // Never walk through an obstruction merely because a route is unavailable.
}
export function reserveSeat(
  actor: string,
  position: Point,
  seats: Point[],
  owners: Map<number, string>,
) {
  const owned = [...owners].find(([, id]) => id === actor)?.[0];
  if (owned !== undefined) return owned;
  const free = seats
    .map((p, i) => ({
      i,
      distance: Math.hypot(p.x - position.x, p.y - position.y),
    }))
    .filter((s) => !owners.has(s.i))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!free) return -1;
  owners.set(free.i, actor);
  return free.i;
}
