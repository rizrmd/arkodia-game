// Tap-to-walk (the full map, world-map.ts): an A* route over a 12 px grid of world feet, string-pulled into straight
// legs, then fed to the hero as stick input. It is input, not a teleport: the solo walk (hero.ts) and the co-op server
// walk it with their own collision, and any key or stick push takes over and drops the route.
const CELL = 12,
  BUDGET = 20000,
  WEIGHT = 1.3,
  NEXT = 1,
  ARRIVE = 3,
  STUCK_MS = 1500,
  RETRIES = 3,
  LOOKAHEAD = 48;
type Pt = { x: number; y: number };
export type Route = {
  points: Pt[];
  next: number;
  target: Pt;
  partial: boolean;
  expanded: number;
  ms: number;
};
type Walk = Pt;
export function createAutoWalk(o: {
  blocked: (x: number, y: number) => boolean;
  position: () => Pt;
  onChange?: (r: Route | null) => void;
  onMap: (x: number, y: number) => boolean;
  passage: (x: number, y: number) => boolean;
}) {
  // The gateway's doors are shut until the hero reaches them (world-view.ts updateGate), so a route plans through the
  // arch as if they were open; arriving at the threshold opens them, and the hero waits there until they give way.
  const open = (x: number, y: number) =>
    o.onMap(x, y) && (o.passage(x, y) || !o.blocked(x, y));
  const clear = (a: Pt, b: Pt) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y),
      n = Math.max(1, Math.ceil(d / 4));
    let px = a.x,
      py = a.y,
      escaping = !open(a.x, a.y);
    for (let i = 1; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n,
        y = a.y + ((b.y - a.y) * i) / n;
      if (open(x, y)) escaping = false;
      else if (!escaping) return false;
      px = x;
      py = y;
    }
    return open(b.x, b.y);
  };
  // The nearest open grid foot to a tapped point (a tap on a tree or a wall walks to its edge).
  function snap(p: Pt): Pt | null {
    const i0 = Math.round(p.x / CELL),
      j0 = Math.round(p.y / CELL);
    if (open(p.x, p.y)) return p;
    for (let r = 1; r <= 24; r++) {
      let best: Pt | null = null,
        bd = Infinity;
      for (let i = -r; i <= r; i++)
        for (const j of Math.abs(i) === r ? range(-r, r) : [-r, r]) {
          const x = (i0 + i) * CELL,
            y = (j0 + j) * CELL,
            d = Math.hypot(x - p.x, y - p.y);
          if (d < bd && open(x, y)) {
            bd = d;
            best = { x, y };
          }
        }
      if (best) return best;
    }
    return null;
  }
  function plan(
    from: Pt,
    to: Pt,
  ): { points: Pt[]; partial: boolean; expanded: number; ms: number } | null {
    const t0 = performance.now(),
      original = { ...from };
    if (!open(from.x, from.y)) {
      const exit = snap(from);
      if (!exit || !clear(from, exit)) return null;
      from = exit;
    }
    const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
    // Anchor the search at the actual foot, not a rounded cell across a wall.
    const ox = from.x,
      oy = from.y,
      si = 0,
      sj = 0,
      gi = Math.round((to.x - ox) / CELL),
      gj = Math.round((to.y - oy) / CELL);
    const point = (i: number, j: number) => ({
      x: ox + i * CELL,
      y: oy + j * CELL,
    });
    const g = new Map<number, number>(),
      parent = new Map<number, number>(),
      closed = new Set<number>(),
      ok = new Map<number, boolean>();
    const free = (i: number, j: number) => {
      const k = key(i, j);
      let v = ok.get(k);
      if (v === undefined) {
        v = (i === si && j === sj) || open(ox + i * CELL, oy + j * CELL);
        ok.set(k, v);
      }
      return v;
    };
    const h = (i: number, j: number) => Math.hypot(i - gi, j - gj) * CELL;
    // A binary heap of [f, i, j]. Weighted A* keeps open snow to a thin band of expansions; past BUDGET the route ends at
    // the cell nearest the target and plans the rest on arrival, so a cross-map tap never stalls a frame.
    const heap: number[][] = [],
      push = (n: number[]) => {
        heap.push(n);
        let c = heap.length - 1;
        while (c) {
          const p = (c - 1) >> 1;
          if (heap[p][0] <= n[0]) break;
          heap[c] = heap[p];
          c = p;
        }
        heap[c] = n;
      };
    const pop = () => {
      const top = heap[0],
        last = heap.pop()!,
        n = heap.length;
      if (n) {
        let c = 0;
        for (;;) {
          const l = 2 * c + 1,
            r = l + 1;
          let m = -1,
            mf = last[0];
          if (l < n && heap[l][0] < mf) {
            m = l;
            mf = heap[l][0];
          }
          if (r < n && heap[r][0] < mf) m = r;
          if (m < 0) break;
          heap[c] = heap[m];
          c = m;
        }
        heap[c] = last;
      }
      return top;
    };
    g.set(key(si, sj), 0);
    push([h(si, sj) * WEIGHT, si, sj]);
    let best = key(si, sj),
      bestH = h(si, sj),
      found = false,
      expanded = 0;
    while (heap.length && expanded < BUDGET) {
      const [, i, j] = pop(),
        k = key(i, j);
      if (closed.has(k)) continue;
      closed.add(k);
      expanded++;
      const hk = h(i, j);
      if (hk < bestH) {
        bestH = hk;
        best = k;
      }
      if (
        Math.hypot(ox + i * CELL - to.x, oy + j * CELL - to.y) <= CELL * 1.5 &&
        clear(point(i, j), to)
      ) {
        found = true;
        best = k;
        break;
      }
      const gk = g.get(k)!;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = i + di,
            nj = j + dj,
            nk = key(ni, nj);
          if (closed.has(nk) || !free(ni, nj)) continue;
          // A diagonal may not clip the corner of a footprint; no step may climb a cliff.
          if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
          if (!clear(point(i, j), point(ni, nj))) continue;
          const ng = gk + (di && dj ? CELL * Math.SQRT2 : CELL);
          if (ng < (g.get(nk) ?? Infinity)) {
            g.set(nk, ng);
            parent.set(nk, k);
            push([ng + h(ni, nj) * WEIGHT, ni, nj]);
          }
        }
    }
    if (best === key(si, sj) && !found) return null;
    const cells: Pt[] = [];
    for (let k: number | undefined = best; k !== undefined; k = parent.get(k)) {
      const i = Math.floor(k / 65536) - 32768,
        j = (k % 65536) - 32768;
      cells.push(point(i, j));
    }
    cells.reverse();
    if (original.x !== from.x || original.y !== from.y) cells.unshift(original);
    if (
      found &&
      Math.hypot(
        cells[cells.length - 1].x - to.x,
        cells[cells.length - 1].y - to.y,
      ) > 0
    )
      cells.push({ ...to });
    // String-pull: from each kept point, jump to the farthest grid point it can walk to in a straight line.
    const points = [cells[0]];
    for (let a = 0; a < cells.length - 1; ) {
      let b = Math.min(cells.length - 1, a + LOOKAHEAD);
      while (b > a + 1 && !clear(cells[a], cells[b])) b--;
      if (!clear(cells[a], cells[b])) return null;
      points.push(cells[b]);
      a = b;
    }
    return {
      points,
      partial: !found,
      expanded,
      ms: +(performance.now() - t0).toFixed(1),
    };
  }

  let route: Route | null = null,
    progressAt = 0,
    calledAt = 0,
    last = { x: NaN, y: NaN },
    replannedAt = { x: NaN, y: NaN },
    retries = 0;
  const set = (r: Route | null) => {
    route = r;
    o.onChange?.(r);
  };
  function goTo(x: number, y: number) {
    const target = snap({ x, y }),
      from = o.position();
    if (!target) {
      set(null);
      return false;
    }
    const p = plan(from, target);
    if (!p) {
      set(null);
      return false;
    }
    retries = 0;
    progressAt = calledAt = performance.now();
    last = { ...from };
    replannedAt = { ...from };
    set({ ...p, next: 1, target });
    return true;
  }
  function replan(pos: Pt) {
    if (!route) return;
    const p = ++retries > RETRIES ? null : plan(pos, route.target);
    if (!p) {
      set(null);
      return;
    }
    progressAt = performance.now();
    replannedAt = { ...pos };
    set({ ...route, ...p, next: 1 });
  }
  // The walk vector toward the next leg, or null once arrived (or with no route).
  function steer(pos: Pt): Walk | null {
    if (!route) return null;
    // Only time spent walking counts toward stuck: a stalled page (a hidden tab, a long frame) is not a blocked hero.
    const now = performance.now(),
      gap = now - calledAt;
    calledAt = now;
    if (gap > 250) progressAt += gap;
    if (Math.hypot(pos.x - last.x, pos.y - last.y) > 3) {
      last = { ...pos };
      progressAt = now;
      if (Math.hypot(pos.x - replannedAt.x, pos.y - replannedAt.y) > CELL * 3)
        retries = 0;
    } else if (now - progressAt > STUCK_MS) {
      replan(pos);
      if (!route) return null;
    }
    const pts = route.points;
    while (
      route.next < pts.length - 1 &&
      Math.hypot(pts[route.next].x - pos.x, pts[route.next].y - pos.y) < NEXT
    )
      route.next++;
    const p = pts[route.next] ?? route.target,
      dx = p.x - pos.x,
      dy = p.y - pos.y,
      d = Math.hypot(dx, dy);
    if (route.next >= pts.length - 1 && d < ARRIVE) {
      if (
        route.partial &&
        Math.hypot(route.target.x - pos.x, route.target.y - pos.y) > CELL * 2
      ) {
        replan(pos);
        return route ? steer(pos) : null;
      }
      set(null);
      return null;
    }
    const speed = Math.min(1, d / 8);
    return { x: (dx / d) * speed, y: (dy / d) * speed };
  }
  return {
    goTo,
    cancel() {
      if (route) set(null);
    },
    route: () => route,
    // Hero input: a key or stick push wins and drops the route; otherwise the route walks.
    input(manual: Walk): Walk {
      if (manual.x || manual.y) {
        if (route) set(null);
        return manual;
      }
      return steer(o.position()) ?? manual;
    },
  };
}
export type AutoWalk = ReturnType<typeof createAutoWalk>;
const range = (a: number, b: number) => {
  const r: number[] = [];
  for (let i = a; i <= b; i++) r.push(i);
  return r;
};
