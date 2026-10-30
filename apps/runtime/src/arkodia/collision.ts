import type {
  StrongholdPrefab,
  CollisionColumn,
} from "../../../../packages/content-contracts/legacy-types";
import {
  DEFAULT_RELIEF_FEATURES,
  cliff as reliefCliff,
  environmentBlocked as checkEnvironmentBlocked,
  heightAt as reliefHeightAt,
  liftAt as reliefLiftAt,
  normalizeReliefFeatures,
  recoverReliefPosition,
  reliefBlocked as checkReliefBlocked,
  type FootprintColumn,
  type ReliefFeature,
} from "../authored-scene/environment-runtime";

export function strongholdCollision(
  p: StrongholdPrefab,
  columns: CollisionColumn[],
  map?: {
    sizeTiles: number;
    prefabs: { prefab: string; at: { u: number; v: number } }[];
    terrain?: { features?: ReliefFeature[] };
  },
  extra?: {
    frontierColumns?: readonly FootprintColumn[];
    environmentColumns?: readonly FootprintColumn[];
    reliefFeatures?: readonly ReliefFeature[];
  },
) {
  const G = p.gate,
    F = G.towerFront,
    C = p.court,
    R = 9;
  const reliefFeatures = normalizeReliefFeatures(
    extra?.reliefFeatures ??
      map?.terrain?.features ??
      DEFAULT_RELIEF_FEATURES,
  );
  const envCols = extra?.environmentColumns ?? [];

  const front = (d: number) =>
    d < F.knee
      ? F.base + (d - G.archHalfWidth) * F.rise
      : F.peak - (d - F.knee) * F.fall;

  const allColumns: CollisionColumn[] = [...columns];
  if (extra?.frontierColumns) {
    for (const [cx, back, frontY] of extra.frontierColumns) {
      allColumns.push({ x: cx, w: 4, back, front: frontY });
    }
  }
  for (const [cx, back, frontY] of envCols) {
    allColumns.push({ x: cx, w: 4, back, front: frontY });
  }

  const buckets = new Map<number, CollisionColumn[]>();
  for (const c of allColumns)
    for (
      let k = Math.floor((c.x - c.w / 2 - R) / 32);
      k <= Math.floor((c.x + c.w / 2 + R) / 32);
      k++
    ) {
      const a = buckets.get(k) || [];
      a.push(c);
      buckets.set(k, a);
    }
  const ground = (x: number, y: number) => {
    const a = (x - C.origin.x) / 64,
      b = (y - C.origin.y) / 32,
      u = (a + b) / 2,
      v = (b - a) / 2,
      d = Math.abs(x - G.x);
    return (
      (u >= C.walkInset &&
        v >= C.walkInset &&
        u <= C.size - C.walkInset &&
        v <= C.size - C.walkInset) ||
      (y >= G.passageFromY &&
        (d < G.archHalfWidth || (d <= G.towerHalfSpan && y >= front(d)))) ||
      u <= -1.5 ||
      v <= -1.5 ||
      u >= C.openSnowFrom ||
      v >= C.openSnowFrom
    );
  };
  const hits = (c: CollisionColumn, x: number, y: number) =>
    Math.abs(x - c.x) < c.w / 2 + R &&
    y > c.back - R * 0.5 &&
    y < c.front + R * 0.5;
  const passage = (x: number, y: number) =>
    Math.abs(x - G.x) < G.archHalfWidth - R &&
    y > G.doors.back - R &&
    y < G.doors.front + R &&
    ground(x, y);
  const placement = map?.prefabs.find((v) => v.prefab === "stronghold"),
    origin = placement
      ? { u: placement.at.u - p.anchor.u, v: placement.at.v - p.anchor.v }
      : { u: 460.5, v: 460.5 },
    size = map?.sizeTiles ?? 936;
  const onMap = (x: number, y: number) => {
    const a = (x - C.origin.x) / 64,
      b = (y - C.origin.y) / 32,
      u = (a + b) / 2,
      v = (b - a) / 2;
    return (
      u > -origin.u + 0.5 &&
      v > -origin.v + 0.5 &&
      u < size - origin.u - 0.5 &&
      v < size - origin.v - 0.5
    );
  };
  const heightAt = (x: number, y: number) =>
    reliefHeightAt(x, y, reliefFeatures);
  const liftAt = (x: number, y: number) => reliefLiftAt(x, y, reliefFeatures);
  const cliff = (x0: number, y0: number, x1: number, y1: number) =>
    reliefCliff(x0, y0, x1, y1, reliefFeatures);
  const reliefBlocked = (x: number, y: number) =>
    checkReliefBlocked(x, y, reliefFeatures);
  const environmentBlocked = (x: number, y: number) =>
    checkEnvironmentBlocked(x, y, envCols);
  const recoverPosition = (x: number, y: number) =>
    recoverReliefPosition(x, y, reliefFeatures);

  const blocked = (x: number, y: number, open: boolean) => {
    if (!onMap(x, y) || !ground(x, y)) return true;
    if (reliefBlocked(x, y)) return true;
    if ((buckets.get(Math.floor(x / 32)) || []).some((c) => hits(c, x, y)))
      return true;
    const d = Math.abs(x - G.x);
    if (
      d > G.archHalfWidth - R &&
      d < G.towerHalfSpan + R &&
      y > front(Math.max(G.archHalfWidth, d)) - G.towerDepth - R * 0.5 &&
      y < front(Math.max(G.archHalfWidth, d)) + R * 0.5
    )
      return true;
    return (
      !open &&
      Math.abs(x - G.x) < G.doors.halfWidth + R &&
      y > G.doors.back - R * 0.5 &&
      y < G.doors.front + R * 0.5
    );
  };
  return {
    blocked,
    ground,
    passage,
    onMap,
    heightAt,
    liftAt,
    cliff,
    reliefBlocked,
    environmentBlocked,
    recoverPosition,
  };
}
/** Original movement ellipse and axis sliding; small substeps prevent tunnelling on long frames. */
export function walkStep(
  x: number,
  y: number,
  d: { x: number; y: number },
  dt: number,
  blocked: (x: number, y: number) => boolean,
  cliff?: (x0: number, y0: number, x1: number, y1: number) => boolean,
) {
  const m = Math.hypot(d.x, d.y);
  if (!m) return { x, y, progress: 0 };
  const speed = m / Math.hypot(d.x / 120, d.y / 90),
    distance = speed * Math.min(dt, 0.05),
    n = Math.max(1, Math.ceil(distance / 2));
  const dx = (d.x * distance) / n,
    dy = (d.y * distance) / n,
    ox = x,
    oy = y;
  for (let i = 0; i < n; i++)
    for (const [a, b] of [
      [dx, dy],
      [dx, 0],
      [0, dy],
    ])
      if (
        (a || b) &&
        !blocked(x + a, y + b) &&
        (!cliff || !cliff(x, y, x + a, y + b))
      ) {
        x += a;
        y += b;
        break;
      }
  return { x, y, progress: Math.hypot(x - ox, y - oy) };
}
