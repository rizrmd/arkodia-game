/** Artwork-local collision geometry shared by the editor and Pixi scene runtime. */
export type CollisionPoint = [number, number];
export type CollisionShape = {
  id: string;
  name: string;
  enabled: boolean;
  kind: "box" | "ellipse" | "polygon";
  x: number;
  y: number;
  width: number;
  height: number;
  points?: CollisionPoint[];
  /** Frame of an explicitly assigned visual part; never an unrelated state. */
  terrainRole?: "height-region" | "walkable-surface" | "solid";
  nativeTerrain?: boolean;
  activeFrames?: { partId: string; from: number; to: number };
};
export type CollisionProfile = {
  stateId: string;
  valueId: string;
  shapes: CollisionShape[];
  removed: string[];
};
export type CollisionGeometry = {
  version: 1;
  shapes: CollisionShape[];
  profiles?: CollisionProfile[];
};
/** State overrides are deltas: unrelated states keep their own shapes. If two
 * active states override the same ID, the later profile has explicit priority. */
export function resolveCollisionGeometry(
  geometry: CollisionGeometry,
  values: Record<string, string> = {},
): CollisionGeometry {
  const shapes = new Map(geometry.shapes.map((s) => [s.id, s]));
  for (const profile of geometry.profiles ?? [])
    if (values[profile.stateId] === profile.valueId) {
      for (const id of profile.removed) shapes.delete(id);
      for (const shape of profile.shapes) shapes.set(shape.id, shape);
    }
  return { version: 1, shapes: [...shapes.values()] };
}
export type LegacyCollider = {
  enabled: boolean;
  shape: "box" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
};
export type CollisionDefinition = {
  image?: string;
  collisionGeometry?: CollisionGeometry;
  collider: LegacyCollider;
  parts?: { id: string }[];
};
export const isGateImage = (image = "") =>
  /(?:^|\/)gate-(?:sheet|closed)\.png(?:\?|$)/i.test(image);

export function legacyCollision(c: LegacyCollider): CollisionShape {
  return { ...c, id: "legacy-collider", name: "Footprint", kind: c.shape };
}

/** Measurements from archived stronghold.json and world-view.ts gateFootprint.
 * Coordinates are converted from the 270px-wide world Gate to its 512px frame,
 * relative to the sprite anchor (577, 798), not its top-left or scene position.
 */
export function nativeGateCollision(
  partId = "gate-artwork",
): CollisionGeometry {
  const scale = 512 / 270;
  const point = (x: number, y: number): CollisionPoint => [
    x * scale,
    (y - 798) * scale,
  ];
  const front = (d: number) =>
    d < 86 ? 782 + (d - 36) * 0.42 : 803 - (d - 86) * 0.62;
  const shapes: CollisionShape[] = [-1, 1].map((side) => {
    const points = [36, 86, 135].map((d) => point(side * d, front(d)));
    points.push(...[135, 86, 36].map((d) => point(side * d, front(d) - 34)));
    return {
      id: side < 0 ? "gate-left-tower" : "gate-right-tower",
      name: side < 0 ? "Left tower" : "Right tower",
      kind: "polygon",
      enabled: true,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      points,
    };
  });
  shapes.push({
    id: "gate-door",
    name: "Door",
    kind: "box",
    enabled: true,
    x: 0,
    y: (777 - 798) * scale,
    width: 70 * scale,
    height: 12 * scale,
    activeFrames: { partId, from: 0, to: 12.8 - Number.EPSILON * 16 },
  });
  return { version: 1, shapes };
}
/** Starter boundary contact intervals measured in the original component frames. */
export function nativeWallCollision(
  image: string,
  anchorY = 0.57,
  worldScaleY = 0.6,
): CollisionGeometry | undefined {
  const name = image
    .toLowerCase()
    .match(/(?:^|\/)straight-(ne|se)-(a|b)\.png(?:\?|$)/);
  if (!name || !/starter-boundary/i.test(image)) return;
  const profiles: Record<
    string,
    { width: number; a: CollisionPoint; b: CollisionPoint }
  > = {
    "ne-a": { width: 416, a: [48, 207], b: [350, 86] },
    "ne-b": { width: 384, a: [45, 210], b: [349, 90] },
    "se-a": { width: 416, a: [46, 88], b: [350, 210] },
    "se-b": { width: 384, a: [43, 91], b: [345, 213] },
  };
  const profile = profiles[name[1] + "-" + name[2]],
    half = 9 / Math.max(0.01, Math.abs(worldScaleY));
  const point = (p: CollisionPoint, offset: number): CollisionPoint => [
    p[0] - profile.width / 2,
    p[1] - 256 * anchorY + offset,
  ];
  return {
    version: 1,
    shapes: [
      {
        id: "native-wall",
        name: "Wall footprint",
        kind: "polygon",
        enabled: true,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        points: [
          point(profile.a, -half),
          point(profile.b, -half),
          point(profile.b, half),
          point(profile.a, half),
        ],
      },
    ],
  };
}
export function collisionGeometry(def: CollisionDefinition): CollisionGeometry {
  if (def.collisionGeometry)
    return validCollisionGeometry(def.collisionGeometry)
      ? def.collisionGeometry
      : { version: 1, shapes: [] };
  if (isGateImage(def.image) && !def.collider.enabled)
    return nativeGateCollision(def.parts?.[0]?.id);
  return {
    version: 1,
    shapes: def.collider.enabled ? [legacyCollision(def.collider)] : [],
  };
}
export function shapeActive(
  shape: CollisionShape,
  frames: Record<string, number> = {},
): boolean {
  const rule = shape.activeFrames;
  const frame = rule ? (frames[rule.partId] ?? 0) : 0;
  return shape.enabled && (!rule || (frame >= rule.from && frame <= rule.to));
}
export function shapePoints(shape: CollisionShape): CollisionPoint[] {
  if (shape.kind === "polygon")
    return (shape.points ?? []).map(([x, y]) => [x + shape.x, y + shape.y]);
  if (shape.kind === "ellipse")
    return Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return [
        shape.x + (Math.cos(a) * shape.width) / 2,
        shape.y + (Math.sin(a) * shape.height) / 2,
      ];
    });
  return [
    [shape.x - shape.width / 2, shape.y - shape.height / 2],
    [shape.x + shape.width / 2, shape.y - shape.height / 2],
    [shape.x + shape.width / 2, shape.y + shape.height / 2],
    [shape.x - shape.width / 2, shape.y + shape.height / 2],
  ];
}
export function shapeBounds(shape: CollisionShape) {
  const points = shapePoints(shape),
    xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const left = Math.min(...xs),
    top = Math.min(...ys),
    right = Math.max(...xs),
    bottom = Math.max(...ys);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}
export function pointInShape(
  shape: CollisionShape,
  x: number,
  y: number,
): boolean {
  if (shape.kind === "ellipse")
    return (
      ((x - shape.x) / (shape.width / 2)) ** 2 +
        ((y - shape.y) / (shape.height / 2)) ** 2 <=
      1
    );
  const points = shapePoints(shape);
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[i],
      [bx, by] = points[j];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (
      Math.abs(cross) < 1e-7 &&
      x >= Math.min(ax, bx) - 1e-7 &&
      x <= Math.max(ax, bx) + 1e-7 &&
      y >= Math.min(ay, by) - 1e-7 &&
      y <= Math.max(ay, by) + 1e-7
    )
      return true;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      inside = !inside;
  }
  return inside;
}
/** Exact segment query prevents thin authored blocked areas being skipped. */
export function segmentIntersectsShape(
  shape: CollisionShape,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  if (pointInShape(shape, ax, ay) || pointInShape(shape, bx, by)) return true;
  if (shape.kind === "ellipse") {
    const x = (ax - shape.x) / (shape.width / 2),
      y = (ay - shape.y) / (shape.height / 2),
      dx = (bx - ax) / (shape.width / 2),
      dy = (by - ay) / (shape.height / 2);
    const a = dx * dx + dy * dy;
    if (a === 0) return false;
    const b = 2 * (x * dx + y * dy),
      c = x * x + y * y - 1,
      discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return false;
    const root = Math.sqrt(discriminant);
    return (-b - root) / (2 * a) <= 1 && (-b + root) / (2 * a) >= 0;
  }
  const points = shapePoints(shape),
    cross = (x: number, y: number, xx: number, yy: number) => x * yy - y * xx;
  for (let i = 0; i < points.length; i++) {
    const [cx, cy] = points[i],
      [dx, dy] = points[(i + 1) % points.length];
    const denominator = cross(bx - ax, by - ay, dx - cx, dy - cy);
    if (Math.abs(denominator) < 1e-10) continue;
    const t = cross(cx - ax, cy - ay, dx - cx, dy - cy) / denominator,
      u = cross(cx - ax, cy - ay, bx - ax, by - ay) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}
export function collisionAt(
  geometry: CollisionGeometry,
  x: number,
  y: number,
  frames: Record<string, number> = {},
  values: Record<string, string> = {},
) {
  return resolveCollisionGeometry(geometry, values).shapes.some(
    (shape) => shapeActive(shape, frames) && pointInShape(shape, x, y),
  );
}
export function validCollisionGeometry(
  value: unknown,
): value is CollisionGeometry {
  try {
    const g = value as CollisionGeometry;
    const ids = new Set(g.shapes.map((s) => s.id));
    if (g.profiles !== undefined) {
      if (!Array.isArray(g.profiles) || g.profiles.length > 128) return false;
      const keys = new Set(
        g.profiles.map((p) => JSON.stringify([p.stateId, p.valueId])),
      );
      if (
        keys.size !== g.profiles.length ||
        !g.profiles.every(
          (p) =>
            typeof p.stateId === "string" &&
            p.stateId &&
            typeof p.valueId === "string" &&
            p.valueId &&
            Array.isArray(p.removed) &&
            p.removed.every((id) => typeof id === "string") &&
            validCollisionGeometry({ version: 1, shapes: p.shapes }),
        )
      )
        return false;
    }
    return (
      g.version === 1 &&
      g.shapes.length <= 128 &&
      ids.size === g.shapes.length &&
      g.shapes.every((s) => {
        if (
          s.terrainRole !== undefined &&
          !["height-region", "walkable-surface", "solid"].includes(
            s.terrainRole,
          )
        )
          return false;
        if (
          s.nativeTerrain !== undefined &&
          typeof s.nativeTerrain !== "boolean"
        )
          return false;
        if (
          !s.id ||
          !s.name.trim() ||
          typeof s.enabled !== "boolean" ||
          !["box", "ellipse", "polygon"].includes(s.kind) ||
          ![s.x, s.y, s.width, s.height].every(Number.isFinite) ||
          s.width <= 0 ||
          s.height <= 0
        )
          return false;
        if (
          s.activeFrames &&
          (!s.activeFrames.partId ||
            ![s.activeFrames.from, s.activeFrames.to].every(Number.isFinite) ||
            s.activeFrames.from < 0 ||
            s.activeFrames.to < s.activeFrames.from)
        )
          return false;
        if (s.kind !== "polygon") return true;
        const p = s.points;
        if (
          !p ||
          p.length < 3 ||
          p.length > 256 ||
          !p.every((v) => v.length === 2 && v.every(Number.isFinite))
        )
          return false;
        let area = 0;
        for (let i = 0; i < p.length; i++) {
          const a = p[i],
            b = p[(i + 1) % p.length];
          area += a[0] * b[1] - b[0] * a[1];
        }
        if (Math.abs(area) <= 0.01) return false;
        const cross = (
          a: CollisionPoint,
          b: CollisionPoint,
          c: CollisionPoint,
        ) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        for (let i = 0; i < p.length; i++) {
          const a = p[i],
            b = p[(i + 1) % p.length];
          if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.001) return false;
          for (let j = i + 1; j < p.length; j++) {
            if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
            const c = p[j],
              d = p[(j + 1) % p.length];
            const abC = cross(a, b, c),
              abD = cross(a, b, d),
              cdA = cross(c, d, a),
              cdB = cross(c, d, b);
            if (
              abC * abD <= 0 &&
              cdA * cdB <= 0 &&
              Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) &&
              Math.max(c[0], d[0]) >= Math.min(a[0], b[0]) &&
              Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) &&
              Math.max(c[1], d[1]) >= Math.min(a[1], b[1])
            )
              return false;
          }
        }
        return true;
      })
    );
  } catch {
    return false;
  }
}
