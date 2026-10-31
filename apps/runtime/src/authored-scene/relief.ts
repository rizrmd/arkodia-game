import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import {
  DEFAULT_WORLD_MAP,
  STRONGHOLD_ORIGIN,
  courtToMap,
  mapToCourt,
  type ReliefFeature,
} from "./environment-map";
import { FRONTIER_TERRAIN_FEATURES } from "./frontier";

export const PX_PER_METER = DEFAULT_WORLD_MAP.terrain.pxPerMeter;
export const MAX_STEP_M = DEFAULT_WORLD_MAP.terrain.maxStepM;

export const HILL_SURFACE: ReadonlyArray<readonly [number, number]> = [
  [0.145, 0.402],
  [0.2, 0.254],
  [0.39, 0.207],
  [0.541, 0.16],
  [0.71, 0.215],
  [0.859, 0.289],
  [0.922, 0.422],
  [0.896, 0.562],
  [0.922, 0.676],
  [0.8, 0.77],
  [0.859, 0.859],
  [0.706, 0.902],
  [0.641, 0.859],
  [0.449, 0.824],
  [0.371, 0.785],
  [0.204, 0.758],
  [0.114, 0.719],
  [0.067, 0.652],
  [0.118, 0.473],
];

export function normalizeReliefFeatures(
  features: readonly ReliefFeature[],
): ReliefFeature[] {
  return features.map((raw) => {
    const f: ReliefFeature = { ...raw };
    if (
      f.type === "hill" &&
      f.ascend === "-u" &&
      f.rampStartV === undefined &&
      typeof f.rampStartU === "number"
    ) {
      f.rampStartV = f.rampStartU;
    }
    return f;
  });
}

export const DEFAULT_RELIEF_FEATURES: ReliefFeature[] = normalizeReliefFeatures(
  [...DEFAULT_WORLD_MAP.terrain.features, ...FRONTIER_TERRAIN_FEATURES],
);

export function pointInPolygon(
  u: number,
  v: number,
  poly: ReadonlyArray<readonly [number, number]>,
): boolean {
  let insidePoly = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i]!;
    const [uj, vj] = poly[j]!;
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) {
      insidePoly = !insidePoly;
    }
  }
  return insidePoly;
}

export function inside(f: ReliefFeature, u: number, v: number): boolean {
  if (u < f.u0 || u > f.u1 || v < f.v0 || v > f.v1) return false;
  if (f.outline && f.outline.length >= 3) {
    return pointInPolygon(u, v, f.outline);
  }
  return true;
}

export function featureHeight(f: ReliefFeature, u: number, v: number): number {
  if (f.type === "plateau") return f.heightM ?? 0;
  const base = f.baseM ?? 0;
  const top = f.topM ?? f.heightM ?? 0;
  if (f.type === "hill") {
    if (f.ascend === "-u") {
      const start = f.rampStartV ?? f.rampStartU ?? f.u1;
      if (u <= start) return top;
      const t = (f.u1 - u) / Math.max(0.001, f.u1 - start);
      return base + Math.max(0, Math.min(1, t)) * (top - base);
    }
    const start = f.rampStartV ?? f.v1;
    if (v <= start) return top;
    const t = (f.v1 - v) / Math.max(0.001, f.v1 - start);
    return base + Math.max(0, Math.min(1, t)) * (top - base);
  }
  const t =
    f.ascend === "+u"
      ? (u - f.u0) / Math.max(0.001, f.u1 - f.u0)
      : f.ascend === "-u"
        ? (f.u1 - u) / Math.max(0.001, f.u1 - f.u0)
        : f.ascend === "+v"
          ? (v - f.v0) / Math.max(0.001, f.v1 - f.v0)
          : (f.v1 - v) / Math.max(0.001, f.v1 - f.v0);
  return base + Math.max(0, Math.min(1, t)) * (top - base);
}

export function topOf(
  f: ReliefFeature,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): number {
  if (f.type === "plateau" || f.type === "hill") {
    return f.topM ?? f.heightM ?? 0;
  }
  const connected = f.connectsTo
    ? features.find((x) => x.id === f.connectsTo)
    : undefined;
  return connected?.heightM ?? f.topM ?? 0;
}

export function heightAtTile(
  u: number,
  v: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): number {
  let h = 0;
  for (const f of features) {
    if (inside(f, u, v)) {
      h = Math.max(h, featureHeight(f, u, v));
    }
  }
  return h;
}

export function heightAt(
  x: number,
  y: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): number {
  const { u, v } = courtToMap(x, y, STRONGHOLD_ORIGIN);
  return heightAtTile(u, v, features);
}

export function liftAtTile(
  u: number,
  v: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): number {
  return heightAtTile(u, v, features) * PX_PER_METER;
}

export function liftAt(
  x: number,
  y: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): number {
  return heightAt(x, y, features) * PX_PER_METER;
}

export function hillArtBounds(f: ReliefFeature): {
  left: number;
  top: number;
  w: number;
  h: number;
  flip: boolean;
} {
  const topCorner = mapToCourt(f.u0, f.v0);
  const rightCorner = mapToCourt(f.u1, f.v0);
  const bottomCorner = mapToCourt(f.u1, f.v1);
  const leftCorner = mapToCourt(f.u0, f.v1);
  const lift = topOf(f) * PX_PER_METER;
  const w = (rightCorner.x - leftCorner.x) * 1.12;
  const h = bottomCorner.y - topCorner.y + lift * 1.35;
  const cx = (rightCorner.x + leftCorner.x) / 2;
  const left = cx - w / 2;
  const top = bottomCorner.y + lift * 0.08 - h;
  return { left, top, w, h, flip: f.ascend === "-u" };
}

export function onHillSurface(
  f: ReliefFeature,
  x: number,
  y: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): boolean {
  const b = hillArtBounds(f);
  const lift = liftAt(x, y, features);
  const nx = (x - b.left) / b.w;
  const ny = (y - lift - b.top) / b.h;
  return pointInPolygon(b.flip ? 1 - nx : nx, ny, HILL_SURFACE);
}

export function reliefBlockedTile(
  u: number,
  v: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): boolean {
  const p = mapToCourt(u, v);
  for (const f of features) {
    if (f.type !== "hill") continue;
    if (inside(f, u, v) && !onHillSurface(f, p.x, p.y, features)) return true;
  }
  return false;
}

export function reliefBlocked(
  x: number,
  y: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): boolean {
  const { u, v } = courtToMap(x, y, STRONGHOLD_ORIGIN);
  return reliefBlockedTile(u, v, features);
}

export function cliffTile(
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): boolean {
  const dist = Math.hypot(u1 - u0, v1 - v0);
  const steps = Math.max(1, Math.ceil(dist / 0.08));
  let au = u0;
  let av = v0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const bu = u0 + (u1 - u0) * t;
    const bv = v0 + (v1 - v0) * t;
    if (reliefBlockedTile(bu, bv, features)) return true;
    if (
      Math.abs(
        heightAtTile(bu, bv, features) - heightAtTile(au, av, features),
      ) > MAX_STEP_M
    ) {
      return true;
    }
    au = bu;
    av = bv;
  }
  return false;
}

export function cliff(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): boolean {
  const a = courtToMap(x0, y0, STRONGHOLD_ORIGIN);
  const b = courtToMap(x1, y1, STRONGHOLD_ORIGIN);
  return cliffTile(a.u, a.v, b.u, b.v, features);
}

export function reliefHides(
  f: ReliefFeature,
  x: number,
  y: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): boolean {
  if (f.visual === "scenery") return false;
  const { u, v } = courtToMap(x, y, STRONGHOLD_ORIGIN);
  const actorH = heightAtTile(u, v, features);
  if (actorH >= topOf(f, features) - MAX_STEP_M) return false;
  const pad = 0.35;
  return u < f.u1 - pad && v < f.v1 - pad && u > f.u0 - 1.2 && v > f.v0 - 1.2;
}

export function recoverReliefPosition(
  x: number,
  y: number,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): { x: number; y: number } {
  if (!reliefBlocked(x, y, features)) return { x, y };
  for (let r = 8; r <= 240; r += 8) {
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const nx = x + Math.cos(a) * r;
      const ny = y + Math.sin(a) * r;
      if (!reliefBlocked(nx, ny, features)) {
        return { x: Math.round(nx), y: Math.round(ny) };
      }
    }
  }
  return { x, y };
}

export type ReliefNodeEntry = {
  feature: ReliefFeature;
  container: Container;
  frontY: number;
};

export type ReliefLayerResult = {
  nodes: ReliefNodeEntry[];
  features: ReliefFeature[];
};

/** Native transparent frame in the existing 1536 × 2048 terrain spritesheet. */
export const HILL_ATLAS_PATH = "/terrain-height/natural/cliff-strip-v2.webp";
export const HILL_BASE_ATLAS = { x: 0, y: 1280, w: 1536, h: 768 };

export function buildNaturalHillSprite(
  f: ReliefFeature,
  atlas: Texture,
): Sprite | null {
  const frame = HILL_BASE_ATLAS;
  if (atlas.width < frame.x + frame.w || atlas.height < frame.y + frame.h)
    return null;
  const texture = new Texture({
    source: atlas.source,
    frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
  });
  const { left, top, w, h, flip } = hillArtBounds(f);
  const sprite = new Sprite(texture);
  sprite.position.set(left + (flip ? w : 0), top);
  sprite.scale.set(((flip ? -1 : 1) * w) / frame.w, h / frame.h);
  sprite.zIndex = 2;
  return sprite;
}

export function createReliefLayer(
  textures: Record<string, Texture | undefined>,
  features: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): ReliefLayerResult {
  const hillAtlas = textures[HILL_ATLAS_PATH];
  const cliffTex =
    textures["/modular-stronghold/v2/cliff-snow.png"] ??
    textures["/modular-stronghold/v2/boulders-snow.png"] ??
    Texture.WHITE;

  const nodes: ReliefNodeEntry[] = [];

  for (const f of features) {
    if (f.visual === "scenery") continue;

    const wrap = new Container();
    wrap.sortableChildren = true;
    const frontCorner = mapToCourt(f.u1, f.v1);
    wrap.zIndex = frontCorner.y;

    if (f.type === "hill") {
      // Preserve the authored alpha and crisp silhouette. No canvas repaint or blurred skirt.
      const hillSprite = hillAtlas
        ? buildNaturalHillSprite(f, hillAtlas)
        : null;
      if (hillSprite) {
        wrap.addChild(hillSprite);
      } else {
        const b = hillArtBounds(f);
        if (cliffTex !== Texture.WHITE) {
          const sprite = new Sprite(cliffTex);
          sprite.anchor.set(0.5, 0.5);
          sprite.position.set(b.left + b.w * 0.5, b.top + b.h * 0.5);
          const sx = (b.w / Math.max(1, cliffTex.width)) * (b.flip ? -1 : 1);
          const sy = b.h / Math.max(1, cliffTex.height);
          sprite.scale.set(sx, sy);
          wrap.addChild(sprite);
        } else {
          const cliffFace = new Graphics();
          const facePts: number[] = [];
          for (const [nx, ny] of HILL_SURFACE) {
            const ux = b.flip ? 1 - nx : nx;
            facePts.push(
              b.left + ux * b.w,
              b.top + Math.min(0.96, ny + 0.14) * b.h,
            );
          }
          cliffFace
            .poly(facePts)
            .fill({ color: 0x3b4856, alpha: 0.78 })
            .stroke({ color: 0x26313d, width: 3, alpha: 0.65, join: "round" });
          wrap.addChild(cliffFace);
        }
      }
    } else {
      const top = mapToCourt(f.u0, f.v0);
      const right = mapToCourt(f.u1, f.v0);
      const bottom = mapToCourt(f.u1, f.v1);
      const left = mapToCourt(f.u0, f.v1);
      const lift = topOf(f, features) * PX_PER_METER;
      const g = new Graphics();
      g.poly([
        left.x,
        left.y - lift,
        bottom.x,
        bottom.y - lift,
        bottom.x,
        bottom.y,
        left.x,
        left.y,
      ])
        .fill({ color: 0x5c6978, alpha: 0.88 })
        .poly([
          bottom.x,
          bottom.y - lift,
          right.x,
          right.y - lift,
          right.x,
          right.y,
          bottom.x,
          bottom.y,
        ])
        .fill({ color: 0x45515f, alpha: 0.92 })
        .poly([
          top.x,
          top.y - lift,
          right.x,
          right.y - lift,
          bottom.x,
          bottom.y - lift,
          left.x,
          left.y - lift,
        ])
        .fill({ color: 0xe8eff7, alpha: 0.94 });
      wrap.addChild(g);
    }

    nodes.push({
      feature: f,
      container: wrap,
      frontY: frontCorner.y,
    });
  }

  return {
    nodes,
    features: [...features],
  };
}
