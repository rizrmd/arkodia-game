import {
  Container,
  Graphics,
  Matrix,
  Sprite,
  Texture,
  TilingSprite,
} from "pixi.js";

export const ISO = { halfWidth: 64, halfHeight: 32 } as const;
export const COURT = { x: 577, y: -160, size: 15 } as const;
export const STRONGHOLD_AT = { u: 468, v: 468 } as const;
export const STRONGHOLD_ANCHOR = { u: 7.5, v: 7.5 } as const;
export const STRONGHOLD_ORIGIN = {
  u: STRONGHOLD_AT.u - STRONGHOLD_ANCHOR.u,
  v: STRONGHOLD_AT.v - STRONGHOLD_ANCHOR.v,
} as const;
export const SNOW_DENSITY = 0.7;
export const PAVING_DENSITY = 0.72;

export type FootprintColumn = [x: number, y0: number, y1: number];

export type ReliefAscend = "-u" | "+u" | "-v" | "+v";

export type ReliefFeature = {
  id: string;
  type: "plateau" | "ramp" | "hill";
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  heightM?: number;
  baseM?: number;
  topM?: number;
  ascend?: ReliefAscend;
  connectsTo?: string;
  visual?: "cliff" | "scenery";
  rampStartV?: number;
  rampStartU?: number;
  outline?: ReadonlyArray< readonly [number, number]>;
};

export type WorldPrefabPlacement = {
  prefab: string;
  at: { u: number; v: number };
};

export type ArkodiaWorldMap = {
  id: string;
  version: number;
  name: string;
  sizeTiles: number;
  metersPerTile: number;
  chunkTiles: number;
  seed: string;
  prefabs: WorldPrefabPlacement[];
  terrain: {
    pxPerMeter: number;
    maxStepM: number;
    features: ReliefFeature[];
  };
};

export const DEFAULT_WORLD_MAP: ArkodiaWorldMap = {
  id: "arkodia-01",
  version: 1,
  name: "Arkodia 01",
  sizeTiles: 936,
  metersPerTile: 3,
  chunkTiles: 24,
  seed: "arkadia-01",
  prefabs: [{ prefab: "stronghold", at: { u: 468, v: 468 } }],
  terrain: {
    pxPerMeter: 24,
    maxStepM: 0.4,
    features: [
      {
        id: "east-ridge",
        type: "hill",
        u0: 483.5,
        v0: 465.5,
        u1: 488.5,
        v1: 473.5,
        heightM: 3,
        baseM: 0,
        topM: 3,
        ascend: "-v",
        rampStartV: 470.5,
        outline: [
          [483.5, 466.6],
          [483.6767, 466.3159],
          [483.9206, 466.0821],
          [484.1, 465.8],
          [484.5056, 465.7225],
          [484.9003, 465.601],
          [485.3, 465.5],
          [485.6696, 465.5908],
          [486.048, 465.6153],
          [486.4221, 465.6721],
          [486.8, 465.7],
          [487.1793, 465.9164],
          [487.6039, 466.0241],
          [488, 466.2],
          [488.1176, 466.589],
          [488.328, 466.9358],
          [488.5, 467.3],
          [488.4444, 467.6492],
          [488.341, 467.9916],
          [488.348, 468.3497],
          [488.3, 468.7],
          [488.4195, 469.1457],
          [488.5, 469.6],
          [488.2752, 469.8419],
          [488.0563, 470.0896],
          [487.8, 470.3],
          [487.3, 470.5],
          [487.3589, 470.8681],
          [487.494, 471.2223],
          [487.5, 471.6],
          [487.616, 471.9623],
          [487.7128, 472.3298],
          [487.8, 472.7],
          [487.901, 473.0997],
          [488, 473.5],
          [487.6111, 473.5],
          [487.2222, 473.5],
          [486.8333, 473.5],
          [486.4444, 473.5],
          [486.0556, 473.5],
          [485.6667, 473.5],
          [485.2778, 473.5],
          [484.8889, 473.5],
          [484.5, 473.5],
          [484.42, 473.06],
          [484.34, 472.62],
          [484.26, 472.18],
          [484.18, 471.74],
          [484.1, 471.3],
          [484, 470.86],
          [483.9, 470.45],
          [483.8, 470.1],
          [483.72, 469.8],
          [483.65, 469.55],
          [483.59, 469.35],
          [483.54, 469.22],
          [483.5, 469.1],
          [483.5992, 468.7054],
          [483.6396, 468.301],
          [483.7, 467.9],
          [483.6786, 467.4597],
          [483.5693, 467.0329],
        ],
      },
      {
        id: "west-terrace",
        type: "hill",
        u0: 463.5,
        v0: 483.5,
        u1: 471.5,
        v1: 487.5,
        heightM: 1.5,
        baseM: 0,
        topM: 1.5,
        ascend: "-u",
        rampStartU: 468.5,
        outline: [
          [464.6, 483.5],
          [464.3159, 483.6414],
          [464.0821, 483.8365],
          [463.8, 483.98],
          [463.7225, 484.3045],
          [463.601, 484.6202],
          [463.5, 484.94],
          [463.5908, 485.2357],
          [463.6153, 485.5384],
          [463.6721, 485.8377],
          [463.7, 486.14],
          [463.9164, 486.4434],
          [464.0241, 486.7831],
          [464.2, 487.1],
          [464.589, 487.1941],
          [464.9358, 487.3624],
          [465.3, 487.5],
          [465.6492, 487.4555],
          [465.9916, 487.3728],
          [466.3497, 487.3784],
          [466.7, 487.34],
          [467.1457, 487.4356],
          [467.6, 487.5],
          [467.8419, 487.3202],
          [468.0896, 487.145],
          [468.3, 486.94],
          [468.5, 486.54],
          [468.8681, 486.5871],
          [469.2223, 486.6952],
          [469.6, 486.7],
          [469.9623, 486.7928],
          [470.3298, 486.8702],
          [470.7, 486.94],
          [471.0997, 487.0208],
          [471.5, 487.1],
          [471.5, 486.7889],
          [471.5, 486.4778],
          [471.5, 486.1666],
          [471.5, 485.8555],
          [471.5, 485.5445],
          [471.5, 485.2334],
          [471.5, 484.9222],
          [471.5, 484.6111],
          [471.5, 484.3],
          [471.06, 484.24],
          [470.62, 484.18],
          [470.18, 484.12],
          [469.74, 484.06],
          [469.3, 484],
          [468.86, 483.92],
          [468.45, 483.84],
          [468.1, 483.76],
          [467.8, 483.69],
          [467.55, 483.63],
          [467.35, 483.58],
          [467.22, 483.54],
          [467.1, 483.5],
          [466.7054, 483.5794],
          [466.301, 483.6117],
          [465.9, 483.66],
          [465.4597, 483.6429],
          [465.0329, 483.5554],
        ],
      },
    ],
  },
};

export function tileToCourt(u: number, v: number): { x: number; y: number } {
  return {
    x: COURT.x + (u - v) * ISO.halfWidth,
    y: COURT.y + (u + v) * ISO.halfHeight,
  };
}

export function courtToTile(x: number, y: number): { u: number; v: number } {
  const dx = (x - COURT.x) / ISO.halfWidth;
  const dy = (y - COURT.y) / ISO.halfHeight;
  return {
    u: (dx + dy) / 2,
    v: (dy - dx) / 2,
  };
}

export function courtToMap(
  x: number,
  y: number,
  origin: { u: number; v: number } = STRONGHOLD_ORIGIN,
): { u: number; v: number } {
  const t = courtToTile(x, y);
  return {
    u: origin.u + t.u,
    v: origin.v + t.v,
  };
}

export function mapToCourt(
  u: number,
  v: number,
  origin: { u: number; v: number } = STRONGHOLD_ORIGIN,
): { x: number; y: number } {
  return tileToCourt(u - origin.u, v - origin.v);
}

export function chunkOf(
  u: number,
  v: number,
  chunkTiles = DEFAULT_WORLD_MAP.chunkTiles,
): { cu: number; cv: number } {
  return {
    cu: Math.floor(u / chunkTiles),
    cv: Math.floor(v / chunkTiles),
  };
}

export function insideMap(
  u: number,
  v: number,
  sizeTiles = DEFAULT_WORLD_MAP.sizeTiles,
): boolean {
  return u >= 0 && v >= 0 && u < sizeTiles && v < sizeTiles;
}

export const COURT_CENTER = tileToCourt(
  STRONGHOLD_ANCHOR.u,
  STRONGHOLD_ANCHOR.v,
);

export function scenePercentToCourt(
  xPercent: number,
  yPercent: number,
  base: { width: number; height: number } = { width: 1400, height: 900 },
): { x: number; y: number } {
  return {
    x: COURT_CENTER.x + ((xPercent - 50) / 100) * base.width,
    y: COURT_CENTER.y + ((yPercent - 50) / 100) * base.height,
  };
}

export function courtToScenePercent(
  x: number,
  y: number,
  base: { width: number; height: number } = { width: 1400, height: 900 },
): { x: number; y: number } {
  return {
    x: 50 + ((x - COURT_CENTER.x) / base.width) * 100,
    y: 50 + ((y - COURT_CENTER.y) / base.height) * 100,
  };
}

export function hash2(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export type InfiniteSnowState = {
  sprite: TilingSprite;
  pad: number;
  density: number;
  sync: (
    viewX: number,
    viewY: number,
    viewWidth: number,
    viewHeight: number,
  ) => void;
};

export function createInfiniteSnow(
  snowTexture: Texture,
  options?: {
    density?: number;
    pad?: number;
    initialBounds?: { x: number; y: number; width: number; height: number };
    zIndex?: number;
  },
): InfiniteSnowState {
  const density = options?.density ?? SNOW_DENSITY;
  const pad = options?.pad ?? 256;
  const bounds = options?.initialBounds ?? {
    x: -1024,
    y: -512,
    width: 3200,
    height: 2048,
  };
  const sprite = new TilingSprite({
    texture: snowTexture,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2,
  });
  sprite.tileScale.set(1 / density, 1 / density);
  sprite.position.set(bounds.x - pad, bounds.y - pad);
  sprite.tilePosition.set(-(bounds.x - pad), -(bounds.y - pad));
  sprite.zIndex = options?.zIndex ?? -20;

  const sync = (
    viewX: number,
    viewY: number,
    viewWidth: number,
    viewHeight: number,
  ) => {
    const x0 = viewX - pad;
    const y0 = viewY - pad;
    sprite.position.set(x0, y0);
    sprite.width = viewWidth + pad * 2;
    sprite.height = viewHeight + pad * 2;
    sprite.tilePosition.set(-x0, -y0);
  };

  return { sprite, pad, density, sync };
}

export function syncInfiniteSnow(
  state: InfiniteSnowState,
  viewX: number,
  viewY: number,
  viewWidth: number,
  viewHeight: number,
): void {
  state.sync(viewX, viewY, viewWidth, viewHeight);
}

export const GATEWAY_APRON_BOUNDS = {
  x: 417,
  y: 700,
  width: 320,
  height: 140,
  edgeY: 785,
  diamondApexY: 796,
  slope: 0.35,
} as const;

export function gatewayApronAlphaAt(wx: number, wy: number): {
  alpha: number;
  shade: number;
  rgb: [number, number, number];
} {
  const { edgeY, diamondApexY, slope } = GATEWAY_APRON_BOUNDS;
  const dx = Math.abs(wx - COURT.x);
  if (wy - diamondApexY > (160 - dx) * slope) {
    return { alpha: 0, shade: 0, rgb: [0, 0, 0] };
  }
  const n1 = noise2(wx * 0.045, wy * 0.045);
  const n2 = noise2(wx * 0.14 + 19, wy * 0.14 + 7);
  const edge = edgeY + (n1 - 0.5) * 32 + (n2 - 0.5) * 12 - dx * 0.14;
  const a = Math.max(0, Math.min(1, (wy - (edge - 26)) / 52));
  if (a <= 0) {
    return { alpha: 0, shade: 0, rgb: [0, 0, 0] };
  }
  const s = a * a * (3 - 2 * a);
  const shade = 0.92 + (n2 - 0.5) * 0.08;
  const r = Math.round((238 * s + 212 * (1 - s)) * shade);
  const g = Math.round((243 * s + 222 * (1 - s)) * shade);
  const b = Math.round((249 * s + 235 * (1 - s)) * shade);
  const alpha = Math.round(s * 242) / 255;
  return { alpha, shade, rgb: [r, g, b] };
}

function buildGatewaySnowApronView(): Container {
  const wrap = new Container();
  wrap.zIndex = 2;
  const { x: x0, y: y0, width: w, height: h } = GATEWAY_APRON_BOUNDS;

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const img = ctx.createImageData(w, h);
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const sample = gatewayApronAlphaAt(x0 + px, y0 + py);
          if (sample.alpha <= 0) continue;
          const idx = (py * w + px) * 4;
          img.data[idx] = sample.rgb[0];
          img.data[idx + 1] = sample.rgb[1];
          img.data[idx + 2] = sample.rgb[2];
          img.data[idx + 3] = Math.round(sample.alpha * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
      const sprite = new Sprite(Texture.from(canvas));
      sprite.position.set(x0, y0);
      wrap.addChild(sprite);
      return wrap;
    }
  }

  const fallback = new Graphics();
  fallback
    .poly([
      COURT.x - 140,
      740,
      COURT.x,
      768,
      COURT.x + 140,
      740,
      COURT.x + 150,
      790,
      COURT.x,
      832,
      COURT.x - 150,
      790,
    ])
    .fill({ color: 0xeef3f9, alpha: 0.86 });
  wrap.addChild(fallback);
  return wrap;
}

export type CourtSurfaceResult = {
  container: Container;
  contactShadow: Graphics;
  paving: TilingSprite;
  pavingMask: Graphics;
  jointLines: Graphics;
  snowApron: Container;
  corners: {
    top: { x: number; y: number };
    right: { x: number; y: number };
    bottom: { x: number; y: number };
    left: { x: number; y: number };
  };
};

export function createCourtSurface(
  pavingTexture: Texture,
  options?: {
    minTile?: number;
    maxTile?: number;
    pavingDensity?: number;
  },
): CourtSurfaceResult {
  const minTile = options?.minTile ?? -0.5;
  const maxTile = options?.maxTile ?? COURT.size;
  const pavingDensity = options?.pavingDensity ?? PAVING_DENSITY;

  const container = new Container();
  container.sortableChildren = true;
  container.zIndex = 0;

  const sMin = minTile - 0.3;
  const sMax = maxTile + 0.3;
  const sTop = tileToCourt(sMin, sMin);
  const sRight = tileToCourt(sMax, sMin);
  const sBottom = tileToCourt(sMax, sMax);
  const sLeft = tileToCourt(sMin, sMax);

  const contactShadow = new Graphics();
  contactShadow.zIndex = 0;
  contactShadow
    .poly([
      sTop.x,
      sTop.y + 12,
      sRight.x,
      sRight.y + 12,
      sBottom.x,
      sBottom.y + 12,
      sLeft.x,
      sLeft.y + 12,
    ])
    .fill({ color: 0x0b1018, alpha: 0.28 })
    .stroke({ color: 0x0b1018, width: 28, alpha: 0.12, join: "round" });
  container.addChild(contactShadow);

  const top = tileToCourt(minTile, minTile);
  const right = tileToCourt(maxTile, minTile);
  const bottom = tileToCourt(maxTile, maxTile);
  const left = tileToCourt(minTile, maxTile);

  const pad = 64;
  const paving = new TilingSprite({
    texture: pavingTexture,
    width: right.x - left.x + pad * 2,
    height: bottom.y - top.y + pad * 2,
  });
  paving.position.set(left.x - pad, top.y - pad);
  paving.tileScale.set(1 / pavingDensity, 1 / pavingDensity);
  paving.tint = 0xd6d2cc;
  paving.zIndex = 1;

  const pavingMask = new Graphics();
  pavingMask.zIndex = 1;
  pavingMask
    .poly([
      top.x,
      top.y,
      right.x,
      right.y,
      bottom.x,
      bottom.y,
      left.x,
      left.y,
    ])
    .fill(0xffffff);
  paving.mask = pavingMask;
  container.addChild(paving, pavingMask);

  const jointLines = new Graphics();
  jointLines.zIndex = 1.5;
  for (let i = 0; i <= COURT.size; i++) {
    const a = tileToCourt(i, 0);
    const b = tileToCourt(i, COURT.size);
    const c = tileToCourt(0, i);
    const d = tileToCourt(COURT.size, i);
    jointLines
      .moveTo(a.x, a.y)
      .lineTo(b.x, b.y)
      .moveTo(c.x, c.y)
      .lineTo(d.x, d.y);
  }
  jointLines.stroke({ color: 0x26211d, width: 1, alpha: 0.16 });
  jointLines
    .poly([
      top.x,
      top.y,
      right.x,
      right.y,
      bottom.x,
      bottom.y,
      left.x,
      left.y,
    ])
    .stroke({ color: 0x38312b, width: 4, alpha: 0.36, join: "round" });
  container.addChild(jointLines);

  const snowApron = buildGatewaySnowApronView();
  container.addChild(snowApron);

  return {
    container,
    contactShadow,
    paving,
    pavingMask,
    jointLines,
    snowApron,
    corners: { top, right, bottom, left },
  };
}

export type PropFoundationSpec = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ax?: number;
  ay?: number;
  flip?: boolean;
  kind?: "wall-ne" | "wall-se" | "gate" | "campfire" | "building";
};

export type PropFoundationNodes = {
  under: Graphics;
  face: Graphics;
};

export function createPropFoundation(
  prop: PropFoundationSpec,
): PropFoundationNodes {
  const ax = prop.ax ?? 0.5;
  const ay = prop.ay ?? 0.85;
  const under = new Graphics();
  under.zIndex = 3;
  const face = new Graphics();
  face.zIndex = 10.6;

  const seed = Math.round(prop.x * 13 + prop.y * 29);
  const jitter = (hash2(seed, 7) - 0.5) * 6;
  const rx = Math.max(24, prop.w * 0.36);
  const ry = Math.max(10, prop.h * (1 - ay) * 0.68);
  const cx = prop.x + (0.5 - ax) * prop.w * 0.25;
  const cy = prop.y;

  under
    .ellipse(cx, cy + 2, rx * 1.05, ry * 1.08)
    .fill({ color: 0x221c17, alpha: 0.38 });

  const driftCount = prop.kind === "campfire" ? 3 : 4;
  for (let i = 0; i < driftCount; i++) {
    const angle = (i / driftCount) * Math.PI + 0.25 + jitter * 0.02;
    const dx = Math.cos(angle) * rx * 0.72;
    const dy = Math.sin(angle) * ry * 0.65 + 3;
    const drx = rx * (0.28 + hash2(seed + i, 19) * 0.14);
    const dry = ry * (0.26 + hash2(seed + i, 31) * 0.12);
    under
      .ellipse(cx + dx, cy + dy, drx, dry)
      .fill({ color: 0xe6eef6, alpha: 0.34 });
  }

  under
    .ellipse(cx, cy + 1, rx * 0.84, ry * 0.62)
    .fill({ color: 0x0e131a, alpha: 0.32 });

  const mossWidth = rx * 0.76;
  const mossHeight = Math.max(6, Math.min(16, prop.h * 0.065));
  face
    .ellipse(cx, cy - mossHeight * 0.35, mossWidth, mossHeight)
    .fill({ color: 0x2f3b28, alpha: 0.18 })
    .ellipse(cx, cy, mossWidth * 0.92, Math.max(4, mossHeight * 0.55))
    .fill({ color: 0x0b1018, alpha: 0.22 });

  return { under, face };
}

export type StrongholdPropDef = {
  id: string;
  tex: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  flip: boolean;
  trim: number;
  zBoost: number;
  solid: boolean;
};

export function starterEnclosureProps(): StrongholdPropDef[] {
  const props: StrongholdPropDef[] = [];
  const wallStep = { x: 120, y: 60 };
  const wallTex = ["straight-ne-a", "straight-ne-b"];
  const seTex = ["straight-se-a", "straight-se-b"];
  const wallSize = { w: 300, h: 300, ax: 0.5, ay: 0.793 };
  const n = 4;

  const topNE = { x: 653, y: -62 };
  for (let i = 0; i < n; i++) {
    props.push({
      id: `ne-${i}`,
      tex: `/buildings/starter-boundary/${wallTex[i % 2]}.png`,
      x: Math.round(topNE.x + i * wallStep.x),
      y: Math.round(topNE.y + i * wallStep.y),
      ...wallSize,
      flip: false,
      trim: 0,
      zBoost: 0,
      solid: true,
    });
  }

  const topNW = { x: 501, y: -62 };
  for (let i = 0; i < n; i++) {
    props.push({
      id: `nw-${i}`,
      tex: `/buildings/starter-boundary/${wallTex[i % 2]}.png`,
      x: Math.round(topNW.x - i * wallStep.x),
      y: Math.round(topNW.y + i * wallStep.y),
      ...wallSize,
      flip: true,
      trim: 0,
      zBoost: 0,
      solid: true,
    });
  }

  const swStart = { x: 96, y: 317 };
  for (let i = 0; i < n; i++) {
    if (i === n - 1) continue;
    props.push({
      id: `sw-${i}`,
      tex: `/buildings/starter-boundary/${seTex[i % 2]}.png`,
      x: Math.round(swStart.x + i * wallStep.x),
      y: Math.round(swStart.y + i * wallStep.y),
      ...wallSize,
      flip: true,
      trim: 0,
      zBoost: 0,
      solid: true,
    });
  }

  const seStart = { x: 1058, y: 317 };
  for (let i = 0; i < n; i++) {
    if (i === n - 1) continue;
    props.push({
      id: `se-${i}`,
      tex: `/buildings/starter-boundary/${seTex[i % 2]}.png`,
      x: Math.round(seStart.x - i * wallStep.x),
      y: Math.round(seStart.y + i * wallStep.y),
      ...wallSize,
      flip: false,
      trim: 0,
      zBoost: 0,
      solid: true,
    });
  }

  const swWing = {
    x: swStart.x + 2 * wallStep.x,
    y: swStart.y + 2 * wallStep.y,
  };
  const seWing = {
    x: seStart.x - 2 * wallStep.x,
    y: seStart.y + 2 * wallStep.y,
  };
  const gateY = Math.round((swWing.y + seWing.y) / 2 + 2.33 * wallStep.y);
  props.push({
    id: "gate-south",
    tex: "/buildings/starter-boundary/gate-closed.png",
    x: COURT.x,
    y: gateY,
    w: 580,
    h: 483,
    ax: 0.5,
    ay: 0.855,
    flip: false,
    trim: 0,
    zBoost: 0,
    solid: true,
  });

  props.push({
    id: "sw-gate-plug",
    tex: "/buildings/starter-boundary/straight-se-a.png",
    x: Math.round(swStart.x + 2.42 * wallStep.x),
    y: Math.round(swStart.y + 2.42 * wallStep.y),
    ...wallSize,
    flip: true,
    trim: 0,
    zBoost: -60,
    solid: true,
  });
  props.push({
    id: "se-gate-plug",
    tex: "/buildings/starter-boundary/straight-se-b.png",
    x: Math.round(seStart.x - 2.42 * wallStep.x),
    y: Math.round(seStart.y + 2.42 * wallStep.y),
    ...wallSize,
    flip: false,
    trim: 0,
    zBoost: -60,
    solid: true,
  });

  return props;
}

export function campfireProp(): StrongholdPropDef {
  const c = tileToCourt(7.5, 7.5);
  return {
    id: "campfire",
    tex: "/buildings/starting-campfire/campfire-v1.png",
    x: c.x,
    y: c.y,
    w: 220,
    h: 220,
    ax: 0.5,
    ay: 0.72,
    flip: false,
    trim: 0,
    zBoost: 0,
    solid: true,
  };
}

export function campfireColumns(
  cx = COURT_CENTER.x,
  cy = COURT_CENTER.y,
): FootprintColumn[] {
  const rx = 52;
  const ry = 28;
  const cols: FootprintColumn[] = [];
  for (let dx = -rx; dx <= rx; dx += 4) {
    const t = dx / rx;
    const h = ry * Math.sqrt(Math.max(0, 1 - t * t));
    cols.push([Math.round(cx + dx), Math.round(cy - h), Math.round(cy + h)]);
  }
  return cols;
}

export function palisadeColumns(prop: StrongholdPropDef): FootprintColumn[] {
  const isGate = prop.tex.includes("gate");
  const isSE = prop.tex.includes("straight-se");
  const dir = isSE ? !prop.flip : prop.flip;
  const s = dir ? -0.5 : 0.5;
  const hw = isGate ? 190 : 72;
  const t = isGate ? 18 : 12;
  const gateOpen = 62;
  const cols: FootprintColumn[] = [];
  for (let dx = -hw; dx <= hw; dx += 4) {
    if (isGate && Math.abs(dx) < gateOpen) continue;
    const cy = prop.y + s * dx;
    cols.push([Math.round(prop.x + dx), Math.round(cy - t), Math.round(cy + t)]);
  }
  return cols;
}

export const GATE_DOOR_CONFIG = {
  x: 577,
  y: 777,
  openRadius: 120,
  closeRadius: 150,
  fps: 24,
  frames: 16,
  passableFrame: 12.8,
  passableAt: 0.8,
} as const;

export type GateDoorState = {
  open: boolean;
  frame: number;
  progress: number;
  passable: boolean;
};

export function createGateDoorState(initialOpen = false): GateDoorState {
  const frame = initialOpen ? GATE_DOOR_CONFIG.frames - 1 : 0;
  const progress = frame / (GATE_DOOR_CONFIG.frames - 1);
  return {
    open: initialOpen,
    frame,
    progress,
    passable: progress >= GATE_DOOR_CONFIG.passableAt,
  };
}

export function stepGateDoor(
  state: GateDoorState,
  actorX: number,
  actorY: number,
  dtSec: number,
): GateDoorState {
  const dist = Math.hypot(
    actorX - GATE_DOOR_CONFIG.x,
    actorY - GATE_DOOR_CONFIG.y,
  );
  const open = state.open
    ? dist < GATE_DOOR_CONFIG.closeRadius
    : dist < GATE_DOOR_CONFIG.openRadius;
  const target = open ? GATE_DOOR_CONFIG.frames - 1 : 0;
  let frame = state.frame;
  if (frame !== target) {
    const step = GATE_DOOR_CONFIG.fps * Math.max(0, dtSec);
    frame =
      frame < target
        ? Math.min(target, frame + step)
        : Math.max(target, frame - step);
  }
  const progress = frame / (GATE_DOOR_CONFIG.frames - 1);
  const passable =
    frame >= GATE_DOOR_CONFIG.passableFrame ||
    progress >= GATE_DOOR_CONFIG.passableAt;
  return {
    open,
    frame,
    progress,
    passable,
  };
}

export function applyIsometricShear(
  sprite: Sprite,
  shear: number,
  flip = false,
): void {
  const sx = (flip ? -1 : 1) * sprite.scale.x;
  const sy = sprite.scale.y;
  sprite.setFromMatrix(
    new Matrix(sx, shear * sx, 0, sy, sprite.x, sprite.y),
  );
}
