import {
  BlurFilter,
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
export const PAVING_DENSITY = 0.22;

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
  outline?: ReadonlyArray<readonly [number, number]>;
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
  snowTexture: Texture = Texture.WHITE,
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
    x: -4800,
    y: -4800,
    width: 10800,
    height: 10800,
  };
  const tex = snowTexture ?? Texture.WHITE;
  const sprite = new TilingSprite({
    texture: tex,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2,
  });
  const x0Init = bounds.x - pad;
  const y0Init = bounds.y - pad;
  sprite.position.set(x0Init, y0Init);
  sprite.tilePosition.set(-x0Init, -y0Init);
  const hasRealTexture = tex !== Texture.WHITE && tex.width > 1;
  if (hasRealTexture) {
    const s = (density * 1024) / Math.max(1, tex.width);
    sprite.tileTransform.setFromMatrix(
      new Matrix(s, s * 0.5, -s, s * 0.5, COURT.x - x0Init, COURT.y - y0Init),
    );
  } else {
    sprite.tileScale.set(1 / density, 1 / density);
  }
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
    if (hasRealTexture) {
      const s = (density * 1024) / Math.max(1, tex.width);
      sprite.tileTransform.setFromMatrix(
        new Matrix(s, s * 0.5, -s, s * 0.5, COURT.x - x0, COURT.y - y0),
      );
    }
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
  x: 407,
  y: 540,
  width: 340,
  height: 260,
  edgeY: 678,
  diamondApexY: 800,
  slope: 0.5,
} as const;

export function gatewayApronAlphaAt(wx: number, wy: number): {
  alpha: number;
  shade: number;
  rgb: [number, number, number];
} {
  const { edgeY, slope } = GATEWAY_APRON_BOUNDS;
  const tile = courtToTile(wx, wy);
  if (tile.u < 0 || tile.v < 0 || tile.u > COURT.size || tile.v > COURT.size) {
    return { alpha: 0, shade: 0, rgb: [0, 0, 0] };
  }
  const edge = edgeY - Math.abs(wx - COURT.x) * slope;
  const n1 = noise2(wx / 36, wy / 36);
  const n2 = noise2(wx / 13, wy / 13);
  const d = wy - edge + (n1 - 0.5) * 26 + (n2 - 0.5) * 10;
  if (d <= -28) {
    return { alpha: 0, shade: 0, rgb: [0, 0, 0] };
  }
  const u = Math.max(0, Math.min(1, (d + 28) / 56));
  const alpha = d >= 28 ? 1 : u * u * (3 - 2 * u);
  const shade = 0.94 + (n2 - 0.5) * 0.06;
  const r = Math.round((238 * alpha + 216 * (1 - alpha)) * shade);
  const g = Math.round((243 * alpha + 225 * (1 - alpha)) * shade);
  const b = Math.round((249 * alpha + 236 * (1 - alpha)) * shade);
  return { alpha, shade, rgb: [r, g, b] };
}

export function extractTextureCanvasSource(
  tex?: Texture,
): CanvasImageSource | null {
  if (!tex || tex === Texture.WHITE) return null;
  const src = (tex as unknown as { source?: { resource?: unknown } }).source
    ?.resource;
  if (!src) return null;
  if (
    (typeof HTMLImageElement !== "undefined" &&
      src instanceof HTMLImageElement) ||
    (typeof HTMLCanvasElement !== "undefined" &&
      src instanceof HTMLCanvasElement) ||
    (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap)
  ) {
    return src;
  }
  return null;
}

function buildGatewaySnowApronView(snowTexture?: Texture): Container {
  const wrap = new Container();
  wrap.zIndex = 2;
  const { x: x0, y: y0, width: w, height: h } = GATEWAY_APRON_BOUNDS;

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const snowImg = extractTextureCanvasSource(snowTexture);
      if (snowImg && snowTexture) {
        ctx.save();
        ctx.beginPath();
        const pts: [number, number][] = [
          [0, 0],
          [COURT.size, 0],
          [COURT.size, COURT.size],
          [0, COURT.size],
        ];
        pts.forEach(([u, v], idx) => {
          const p = tileToCourt(u, v);
          if (idx === 0) ctx.moveTo(p.x - x0, p.y - y0);
          else ctx.lineTo(p.x - x0, p.y - y0);
        });
        ctx.closePath();
        ctx.clip();
        const pat = ctx.createPattern(snowImg, "repeat");
        if (pat && typeof DOMMatrix !== "undefined") {
          const s = (SNOW_DENSITY * 1024) / Math.max(1, snowTexture.width);
          pat.setTransform(
            new DOMMatrix([s, s * 0.5, -s, s * 0.5, COURT.x - x0, COURT.y - y0]),
          );
          ctx.fillStyle = pat;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.restore();
        const img = ctx.getImageData(0, 0, w, h);
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            const sample = gatewayApronAlphaAt(x0 + px, y0 + py);
            const idx = (py * w + px) * 4;
            img.data[idx + 3] = Math.round(img.data[idx + 3]! * sample.alpha);
          }
        }
        ctx.putImageData(img, 0, 0);
      } else {
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
      }
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
      800,
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
  pavingTexture: Texture = Texture.WHITE,
  options?: {
    minTile?: number;
    maxTile?: number;
    pavingDensity?: number;
    snowTexture?: Texture;
  },
): CourtSurfaceResult {
  const minTile = options?.minTile ?? 0;
  const maxTile = options?.maxTile ?? COURT.size;
  const pavingDensity = options?.pavingDensity ?? PAVING_DENSITY;

  const container = new Container();
  container.sortableChildren = true;
  container.zIndex = 0;

  const top = tileToCourt(minTile, minTile);
  const right = tileToCourt(maxTile, minTile);
  const bottom = tileToCourt(maxTile, maxTile);
  const left = tileToCourt(minTile, maxTile);

  const contactShadow = new Graphics();
  contactShadow.zIndex = 0;
  contactShadow
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
    .stroke({ color: 0x29392d, width: 30, alpha: 0.16, join: "round" });
  try {
    contactShadow.filters = [new BlurFilter({ strength: 10, quality: 2 })];
  } catch {
    // Headless Node environment without DOM canvas
  }
  container.addChild(contactShadow);

  const pad = 64;
  const pavingTex = pavingTexture ?? Texture.WHITE;
  const px0 = left.x - pad;
  const py0 = top.y - pad;
  const paving = new TilingSprite({
    texture: pavingTex,
    width: right.x - left.x + pad * 2,
    height: bottom.y - top.y + pad * 2,
  });
  paving.position.set(px0, py0);
  if (pavingTex !== Texture.WHITE && pavingTex.width > 1) {
    const s = (pavingDensity * 1024) / Math.max(1, pavingTex.width);
    paving.tileTransform.setFromMatrix(
      new Matrix(s, s * 0.5, -s, s * 0.5, COURT.x - px0, COURT.y - py0),
    );
    paving.tint = 0xffffff;
    paving.alpha = 1;
  } else {
    paving.tileScale.set(1 / pavingDensity, 1 / pavingDensity);
    paving.tint = 0x3b3631;
    paving.alpha = 0.78;
  }
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
  jointLines.visible = false;
  container.addChild(jointLines);

  const snowApron = buildGatewaySnowApronView(options?.snowTexture);
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
  shear?: number;
  kind?: "wall-ne" | "wall-se" | "gate" | "campfire" | "building";
};

export type PropFoundationNodes = {
  under: Container;
  face: Container;
};

export function createPropFoundation(
  prop: PropFoundationSpec,
  textures?: Record<string, Texture | undefined>,
): PropFoundationNodes {
  const under = new Container();
  under.zIndex = 3;
  const face = new Container();
  face.zIndex = 10.6;

  const isWall = prop.id.includes("ne") || prop.id.includes("nw") || prop.id.includes("se") || prop.id.includes("sw") || prop.id.includes("rampart");
  const isCampfire = prop.id === "campfire";
  if (!isWall && !isCampfire) {
    return { under, face };
  }

  const soilTex = textures?.["/foundation-transitions/soil-moss.png"];
  const mossTex = textures?.["/foundation-transitions/moss.png"];
  const driftTex = textures?.["/modular-stronghold/v2/snowdrift-edge.png"];

  const slope = prop.shear !== undefined ? prop.shear : prop.id.includes("se") ? 0.2 : -0.2;

  if (soilTex && soilTex !== Texture.WHITE) {
    const soil = new Sprite(soilTex);
    soil.anchor.set(0.5, 0.52);
    const sx = (prop.w * (isCampfire ? 0.56 : 0.72)) / Math.max(1, soilTex.width);
    const sy = (isCampfire ? 42 : 28) / Math.max(1, soilTex.height);
    soil.setFromMatrix(
      new Matrix(sx, (isCampfire ? 0 : slope) * sx, 0, sy, prop.x, prop.y + 4),
    );
    soil.alpha = isCampfire ? 0.36 : 0.42;
    under.addChild(soil);
  } else {
    const g = new Graphics();
    const rx = Math.max(24, prop.w * 0.28);
    const ry = Math.max(8, prop.h * 0.05);
    g.ellipse(prop.x, prop.y + 2, rx, ry).fill({ color: 0x221c17, alpha: 0.16 });
    under.addChild(g);
  }

  if (driftTex && driftTex !== Texture.WHITE && isWall) {
    const drift = new Sprite(driftTex);
    drift.anchor.set(0.5, 0.58);
    const sx = (prop.w * 0.46) / Math.max(1, driftTex.width);
    const sy = (prop.w * 0.22) / Math.max(1, driftTex.height);
    drift.setFromMatrix(
      new Matrix(sx, slope * sx, 0, sy, prop.x, prop.y + 6),
    );
    drift.alpha = 0.28;
    under.addChild(drift);
  }

  if (mossTex && mossTex !== Texture.WHITE) {
    const moss = new Sprite(mossTex);
    moss.anchor.set(0.5, 0.72);
    const sx = (prop.w * (isCampfire ? 0.44 : 0.62)) / Math.max(1, mossTex.width);
    const sy = (isCampfire ? 24 : 18) / Math.max(1, mossTex.height);
    moss.setFromMatrix(
      new Matrix(sx, (isCampfire ? 0 : slope) * sx, 0, sy, prop.x, prop.y + 2),
    );
    moss.alpha = 0.22;
    face.addChild(moss);
  }

  return { under, face };
}

export type NativeStrongholdProp = {
  id: string;
  file: string;
  x: number;
  y: number;
  width: number;
  foot: number;
  vertical: number;
  shear: number;
  depth: number;
  layer: "ground" | "world";
};

export const STRONGHOLD_NATIVE_PROPS: NativeStrongholdProp[] = [
  { id: "fir-young", file: "/modular-stronghold/v2/fir-young.png", x: 193, y: -160, width: 135, foot: 0.97, vertical: 1, shear: 0, depth: -160, layer: "world" },
  { id: "spruce-mature", file: "/modular-stronghold/v2/spruce-mature.png", x: 65, y: -96, width: 154, foot: 0.97, vertical: 1, shear: 0, depth: -96, layer: "world" },
  { id: "spruce-mature", file: "/modular-stronghold/v2/spruce-mature.png", x: -191, y: 32, width: 173, foot: 0.97, vertical: 1, shear: 0, depth: 32, layer: "world" },
  { id: "fir-young", file: "/modular-stronghold/v2/fir-young.png", x: 897, y: -192, width: 192, foot: 0.97, vertical: 1, shear: 0, depth: -192, layer: "world" },
  { id: "spruce-mature", file: "/modular-stronghold/v2/spruce-mature.png", x: 1089, y: -96, width: 135, foot: 0.97, vertical: 1, shear: 0, depth: -96, layer: "world" },
  { id: "spruce-mature", file: "/modular-stronghold/v2/spruce-mature.png", x: 1345, y: 32, width: 154, foot: 0.97, vertical: 1, shear: 0, depth: 32, layer: "world" },
  { id: "fir-young", file: "/modular-stronghold/v2/fir-young.png", x: 1601, y: 160, width: 173, foot: 0.97, vertical: 1, shear: 0, depth: 160, layer: "world" },
  { id: "spruce-mature", file: "/modular-stronghold/v2/spruce-mature.png", x: 1601, y: 608, width: 192, foot: 0.97, vertical: 1, shear: 0, depth: 608, layer: "world" },
  { id: "spruce-mature", file: "/modular-stronghold/v2/spruce-mature.png", x: 1217, y: 800, width: 135, foot: 0.97, vertical: 1, shear: 0, depth: 800, layer: "world" },
  { id: "fir-young", file: "/modular-stronghold/v2/fir-young.png", x: -447, y: 608, width: 154, foot: 0.97, vertical: 1, shear: 0, depth: 608, layer: "world" },
  { id: "spruce-mature", file: "/modular-stronghold/v2/spruce-mature.png", x: -63, y: 800, width: 173, foot: 0.97, vertical: 1, shear: 0, depth: 800, layer: "world" },
  { id: "cliff-snow", file: "/modular-stronghold/v2/cliff-snow.png", x: 77.8, y: -153.6, width: 320, foot: 0.97, vertical: 1, shear: 0, depth: -153.6, layer: "world" },
  { id: "cliff-snow", file: "/modular-stronghold/v2/cliff-snow.png", x: 1076.2, y: -153.6, width: 320, foot: 0.97, vertical: 1, shear: 0, depth: -153.6, layer: "world" },
  { id: "cliff-snow", file: "/modular-stronghold/v2/cliff-snow.png", x: 1524.2, y: 70.4, width: 320, foot: 0.97, vertical: 1, shear: 0, depth: 70.4, layer: "world" },
  { id: "cliff-snow", file: "/modular-stronghold/v2/cliff-snow.png", x: 1377, y: 688, width: 320, foot: 0.97, vertical: 1, shear: 0, depth: 688, layer: "world" },
  { id: "cliff-snow", file: "/modular-stronghold/v2/cliff-snow.png", x: -223, y: 688, width: 320, foot: 0.97, vertical: 1, shear: 0, depth: 688, layer: "world" },
  { id: "boulders-snow", file: "/modular-stronghold/v2/boulders-snow.png", x: -319, y: 96, width: 185, foot: 0.97, vertical: 1, shear: 0, depth: 96, layer: "world" },
  { id: "boulders-snow", file: "/modular-stronghold/v2/boulders-snow.png", x: 1473, y: 96, width: 185, foot: 0.97, vertical: 1, shear: 0, depth: 96, layer: "world" },
  { id: "boulders-snow", file: "/modular-stronghold/v2/boulders-snow.png", x: 1025, y: 768, width: 185, foot: 0.97, vertical: 1, shear: 0, depth: 768, layer: "world" },
  { id: "boulders-snow", file: "/modular-stronghold/v2/boulders-snow.png", x: 129, y: 768, width: 185, foot: 0.97, vertical: 1, shear: 0, depth: 768, layer: "world" },
  { id: "paving-worn", file: "/modular-stronghold/v2/paving-worn.png", x: 385, y: 0, width: 195, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "weeds-edge", file: "/modular-stronghold/v2/weeds-edge.png", x: 129, y: 128, width: 125, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "weeds-edge", file: "/modular-stronghold/v2/weeds-edge.png", x: -127, y: 256, width: 125, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "paving-worn", file: "/modular-stronghold/v2/paving-worn.png", x: 769, y: 0, width: 195, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "weeds-edge", file: "/modular-stronghold/v2/weeds-edge.png", x: 1025, y: 128, width: 125, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "weeds-edge", file: "/modular-stronghold/v2/weeds-edge.png", x: 1281, y: 256, width: 125, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "paving-worn", file: "/modular-stronghold/v2/paving-worn.png", x: 1153, y: 448, width: 195, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "weeds-edge", file: "/modular-stronghold/v2/weeds-edge.png", x: 897, y: 576, width: 125, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "weeds-edge", file: "/modular-stronghold/v2/weeds-edge.png", x: 1, y: 448, width: 125, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "paving-worn", file: "/modular-stronghold/v2/paving-worn.png", x: 257, y: 576, width: 195, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "weeds-edge", file: "/modular-stronghold/v2/weeds-edge.png", x: 513, y: 640, width: 125, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "snowdrift-edge", file: "/modular-stronghold/v2/snowdrift-edge.png", x: -95, y: -48, width: 200, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "snowdrift-edge", file: "/modular-stronghold/v2/snowdrift-edge.png", x: 1249, y: -48, width: 200, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "snowdrift-edge", file: "/modular-stronghold/v2/snowdrift-edge.png", x: 1229.8, y: 550.4, width: 200, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "snowdrift-edge", file: "/modular-stronghold/v2/snowdrift-edge.png", x: 845.8, y: 742.4, width: 200, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "snowdrift-edge", file: "/modular-stronghold/v2/snowdrift-edge.png", x: -75.8, y: 550.4, width: 200, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "snowdrift-edge", file: "/modular-stronghold/v2/snowdrift-edge.png", x: 308.2, y: 742.4, width: 200, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "paving-worn", file: "/modular-stronghold/v2/paving-worn.png", x: 321, y: 416, width: 160, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "paving-worn", file: "/modular-stronghold/v2/paving-worn.png", x: 833, y: 480, width: 160, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "paving-worn", file: "/modular-stronghold/v2/paving-worn.png", x: 385, y: 576, width: 160, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "paving-worn", file: "/modular-stronghold/v2/paving-worn.png", x: 705, y: 352, width: 160, foot: 0.97, vertical: 1, shear: 0, depth: 1, layer: "ground" },
  { id: "rampart-ne", file: "/buildings/starter-boundary/straight-ne-a.png", x: 464.15, y: -101.43, width: 330.6, foot: 0.5723, vertical: 0.75, shear: -0.1995, depth: -100, layer: "world" },
  { id: "rampart-ne", file: "/buildings/starter-boundary/straight-ne-b.png", x: 213.05, y: 20.81, width: 303.16, foot: 0.5859, vertical: 0.75, shear: -0.2039, depth: 20, layer: "world" },
  { id: "rampart-ne", file: "/buildings/starter-boundary/straight-ne-a.png", x: -15.85, y: 138.57, width: 330.6, foot: 0.5723, vertical: 0.75, shear: -0.1995, depth: 140, layer: "world" },
  { id: "rampart-ne", file: "/buildings/starter-boundary/straight-ne-a.png", x: -255.85, y: 258.57, width: 330.6, foot: 0.5723, vertical: 0.75, shear: -0.1995, depth: 260, layer: "world" },
  { id: "rampart-se", file: "/buildings/starter-boundary/straight-se-a.png", x: 704.89, y: -98.43, width: 328.42, foot: 0.582, vertical: 0.75, shear: 0.199, depth: -100, layer: "world" },
  { id: "rampart-se", file: "/buildings/starter-boundary/straight-se-b.png", x: 935.41, y: 19.69, width: 305.17, foot: 0.5938, vertical: 0.75, shear: 0.197, depth: 20, layer: "world" },
  { id: "rampart-se", file: "/buildings/starter-boundary/straight-se-a.png", x: 1184.89, y: 141.57, width: 328.42, foot: 0.582, vertical: 0.75, shear: 0.199, depth: 140, layer: "world" },
  { id: "rampart-se", file: "/buildings/starter-boundary/straight-se-a.png", x: 1424.89, y: 261.57, width: 328.42, foot: 0.582, vertical: 0.75, shear: 0.199, depth: 260, layer: "world" },
  { id: "rampart-se", file: "/buildings/starter-boundary/straight-se-a.png", x: -271.09, y: 378.27, width: 287.37, foot: 0.582, vertical: 0.75, shear: 0.2383, depth: 376.63, layer: "world" },
  { id: "rampart-se", file: "/buildings/starter-boundary/straight-se-b.png", x: -69.39, y: 489.55, width: 267.02, foot: 0.5938, vertical: 0.75, shear: 0.2363, depth: 489.88, layer: "world" },
  { id: "rampart-se", file: "/buildings/starter-boundary/straight-se-a.png", x: 148.91, y: 604.77, width: 287.37, foot: 0.582, vertical: 0.75, shear: 0.2383, depth: 603.13, layer: "world" },
  { id: "rampart-se", file: "/buildings/starter-boundary/straight-se-a.png", x: 358.91, y: 718.02, width: 287.37, foot: 0.582, vertical: 0.75, shear: 0.2383, depth: 716.38, layer: "world" },
  { id: "rampart-ne", file: "/buildings/starter-boundary/straight-ne-a.png", x: 1438.26, y: 375.13, width: 289.27, foot: 0.5723, vertical: 0.75, shear: -0.2388, depth: 376.63, layer: "world" },
  { id: "rampart-ne", file: "/buildings/starter-boundary/straight-ne-b.png", x: 1218.55, y: 490.72, width: 265.26, foot: 0.5859, vertical: 0.75, shear: -0.2432, depth: 489.88, layer: "world" },
  { id: "rampart-ne", file: "/buildings/starter-boundary/straight-ne-a.png", x: 1018.26, y: 601.63, width: 289.27, foot: 0.5723, vertical: 0.75, shear: -0.2388, depth: 603.13, layer: "world" },
  { id: "rampart-ne", file: "/buildings/starter-boundary/straight-ne-a.png", x: 808.26, y: 714.88, width: 289.27, foot: 0.5723, vertical: 0.75, shear: -0.2388, depth: 716.38, layer: "world" },
];

export const CAMPFIRE_NATIVE_PROP: NativeStrongholdProp = {
  id: "campfire",
  file: "/buildings/starting-campfire/campfire-v1.png",
  x: 577,
  y: 320,
  width: 320,
  foot: 545 / 887,
  vertical: 1,
  shear: 0,
  depth: 320,
  layer: "world",
};

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
  layer?: "ground" | "world";
  alpha?: number;
  foot?: number;
  vertical?: number;
  shear?: number;
  depth?: number;
};

export function allStrongholdProps(includeCampfire = true): StrongholdPropDef[] {
  const list: StrongholdPropDef[] = STRONGHOLD_NATIVE_PROPS.map((p, idx) => {
    const isWall = p.id.startsWith("rampart-");
    const aspect = isWall ? 256 / 416 : p.layer === "ground" ? 0.55 : 1.15;
    return {
      id: `${p.id}-${idx}`,
      tex: p.file,
      x: p.x,
      y: p.y,
      w: p.width,
      h: p.width * aspect * p.vertical,
      ax: 0.5,
      ay: p.foot,
      flip: false,
      trim: 0,
      zBoost: 0,
      solid: isWall,
      layer: p.layer,
      foot: p.foot,
      vertical: p.vertical,
      shear: p.shear,
      depth: p.depth,
    };
  });
  // Add the South Gate prop (pal-s-gate) so gate-sheet.png / gate-closed.png renders at the South Gateway
  list.push({
    id: "pal-s-gate",
    tex: "/buildings/starter-boundary/gate-closed.png",
    x: 577,
    y: 798,
    w: 270,
    h: 135,
    ax: 0.5,
    ay: 0.72,
    flip: false,
    trim: 0,
    zBoost: 0,
    solid: true,
    layer: "world",
    foot: 0.72,
    vertical: 1,
    shear: 0,
    depth: 778,
  });
  if (includeCampfire) {
    list.push(campfireProp());
  }
  return list;
}

export function starterEnclosureProps(): StrongholdPropDef[] {
  const walls = STRONGHOLD_NATIVE_PROPS.filter((p) =>
    p.id.startsWith("rampart-"),
  );
  return walls.map((p, idx) => ({
    id: `${p.id}-${idx}`,
    tex: p.file,
    x: p.x,
    y: p.y,
    w: p.width,
    h: p.width * (256 / 416) * p.vertical,
    ax: 0.5,
    ay: p.foot,
    flip: false,
    trim: 0,
    zBoost: 0,
    solid: true,
    foot: p.foot,
    vertical: p.vertical,
    shear: p.shear,
    depth: p.depth,
  }));
}

export function campfireProp(): StrongholdPropDef {
  return {
    id: "campfire",
    tex: CAMPFIRE_NATIVE_PROP.file,
    x: CAMPFIRE_NATIVE_PROP.x,
    y: CAMPFIRE_NATIVE_PROP.y,
    w: CAMPFIRE_NATIVE_PROP.width,
    h: CAMPFIRE_NATIVE_PROP.width * (887 / 1024),
    ax: 0.5,
    ay: CAMPFIRE_NATIVE_PROP.foot,
    flip: false,
    trim: 0,
    zBoost: 0,
    solid: true,
    foot: CAMPFIRE_NATIVE_PROP.foot,
    vertical: CAMPFIRE_NATIVE_PROP.vertical,
    shear: CAMPFIRE_NATIVE_PROP.shear,
    depth: CAMPFIRE_NATIVE_PROP.depth,
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
  const s = prop.shear !== undefined ? prop.shear : dir ? -0.5 : 0.5;
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
  y: 778,
  renderY: 798,
  width: 270,
  height: 135,
  openRadius: 120,
  closeRadius: 150,
  fps: 24,
  frames: 16,
  cols: 4,
  rows: 4,
  frameW: 360,
  frameH: 180,
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
