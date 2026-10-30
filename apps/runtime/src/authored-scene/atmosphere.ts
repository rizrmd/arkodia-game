import { Container, Graphics, Matrix, Sprite, Texture } from "pixi.js";
import {
  COURT_CENTER,
  type ReliefFeature,
   type StrongholdPropDef,
} from "./environment-map";
import type { FrontierProp } from "./frontier";
import { DEFAULT_RELIEF_FEATURES, reliefHides } from "./relief";

export const DAY_MS = 600_000;
export const MIN_AMBIENT_LUMA = 0.22;
export const MAX_SHADOW = 1.7;
export const OCCLUSION_CUTOUT_ALPHA = 0.68;
export const RESIDUAL_SILHOUETTE_ALPHA = 1 - OCCLUSION_CUTOUT_ALPHA;

export type DaylightKeyframe = {
  t: number;
  label: string;
  ambient: readonly [r: number, g: number, b: number];
  lightScale: number;
  sunStrength: number;
  sunAngle: number;
  sunLength: number;
};

export const DAYLIGHT_KEYFRAMES: readonly DaylightKeyframe[] = [
  {
    t: 0.0,
    label: "dawn",
    ambient: [0.68, 0.64, 0.76],
    lightScale: 0.72,
    sunStrength: 0.45,
    sunAngle: -0.85,
    sunLength: 1.35,
  },
  {
    t: 0.15,
    label: "morning",
    ambient: [0.92, 0.9, 0.94],
    lightScale: 0.28,
    sunStrength: 0.82,
    sunAngle: -0.45,
    sunLength: 0.95,
  },
  {
    t: 0.35,
    label: "noon",
    ambient: [1.0, 0.99, 1.0],
    lightScale: 0.14,
    sunStrength: 1.0,
    sunAngle: 0.05,
    sunLength: 0.58,
  },
  {
    t: 0.55,
    label: "afternoon",
    ambient: [0.96, 0.91, 0.86],
    lightScale: 0.32,
    sunStrength: 0.86,
    sunAngle: 0.52,
    sunLength: 0.92,
  },
  {
    t: 0.7,
    label: "dusk",
    ambient: [0.74, 0.6, 0.72],
    lightScale: 0.78,
    sunStrength: 0.42,
    sunAngle: 0.88,
    sunLength: 1.42,
  },
  {
    t: 0.8,
    label: "twilight",
    ambient: [0.46, 0.5, 0.68],
    lightScale: 0.95,
    sunStrength: 0.16,
    sunAngle: 1.1,
    sunLength: 1.65,
  },
  {
    t: 0.9,
    label: "night",
    ambient: [0.34, 0.4, 0.58],
    lightScale: 1.0,
    sunStrength: 0.08,
    sunAngle: -1.2,
    sunLength: 1.7,
  },
  {
    t: 1.0,
    label: "dawn",
    ambient: [0.68, 0.64, 0.76],
    lightScale: 0.72,
    sunStrength: 0.45,
    sunAngle: -0.85,
    sunLength: 1.35,
  },
];

export function srgbToLinear(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

export function enforceLumaFloor(
  rgb: readonly [number, number, number],
  minLuma = MIN_AMBIENT_LUMA,
): [number, number, number] {
  let [r, g, b] = rgb;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < minLuma && luma > 0.0001) {
    const scale = minLuma / luma;
    r = Math.min(1, r * scale);
    g = Math.min(1, g * scale);
    b = Math.min(1, b * scale);
  } else if (luma <= 0.0001) {
    r = minLuma;
    g = minLuma;
    b = minLuma;
  }
  return [r, g, b];
}

export function rgbToHex([r, g, b]: readonly [number, number, number]): number {
  const ri = Math.max(0, Math.min(255, Math.round(r * 255)));
  const gi = Math.max(0, Math.min(255, Math.round(g * 255)));
  const bi = Math.max(0, Math.min(255, Math.round(b * 255)));
  return (ri << 16) | (gi << 8) | bi;
}

export type DaylightState = {
  phase: number;
  label: string;
  ambient: [number, number, number];
  tintHex: number;
  lightScale: number;
  sunStrength: number;
};

export type SunVector = {
  dx: number;
  dy: number;
  strength: number;
  maxShadow: number;
};

function interpolateKeyframes(nowMs: number): {
  a: DaylightKeyframe;
  b: DaylightKeyframe;
  alpha: number;
  phase: number;
} {
  const phase = (((nowMs % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS;
  for (let i = 0; i < DAYLIGHT_KEYFRAMES.length - 1; i++) {
    const a = DAYLIGHT_KEYFRAMES[i]!;
    const b = DAYLIGHT_KEYFRAMES[i + 1]!;
    if (phase >= a.t && phase <= b.t) {
      const span = Math.max(0.0001, b.t - a.t);
      const raw = (phase - a.t) / span;
      const alpha = raw * raw * (3 - 2 * raw);
      return { a, b, alpha, phase };
    }
  }
  const last = DAYLIGHT_KEYFRAMES[0]!;
  return { a: last, b: last, alpha: 0, phase };
}

export function daylightAt(nowMs: number): DaylightState {
  const { a, b, alpha, phase } = interpolateKeyframes(nowMs);
  const linR =
    srgbToLinear(a.ambient[0]) * (1 - alpha) +
    srgbToLinear(b.ambient[0]) * alpha;
  const linG =
    srgbToLinear(a.ambient[1]) * (1 - alpha) +
    srgbToLinear(b.ambient[1]) * alpha;
  const linB =
    srgbToLinear(a.ambient[2]) * (1 - alpha) +
    srgbToLinear(b.ambient[2]) * alpha;

  const srgb = enforceLumaFloor([
    linearToSrgb(linR),
    linearToSrgb(linG),
    linearToSrgb(linB),
  ]);
  const lightScale = a.lightScale * (1 - alpha) + b.lightScale * alpha;
  const sunStrength = a.sunStrength * (1 - alpha) + b.sunStrength * alpha;

  return {
    phase,
    label: alpha < 0.5 ? a.label : b.label,
    ambient: srgb,
    tintHex: rgbToHex(srgb),
    lightScale,
    sunStrength,
  };
}

export function sunAt(nowMs: number): SunVector {
  const { a, b, alpha } = interpolateKeyframes(nowMs);
  const angle = a.sunAngle * (1 - alpha) + b.sunAngle * alpha;
  const len = Math.min(
    MAX_SHADOW,
    a.sunLength * (1 - alpha) + b.sunLength * alpha,
  );
  const strength = a.sunStrength * (1 - alpha) + b.sunStrength * alpha;
  return {
    dx: Math.sin(angle) * len,
    dy: -Math.cos(angle) * len * 0.45,
    strength,
    maxShadow: MAX_SHADOW,
  };
}

export type TorchLightSpec = {
  x: number;
  y: number;
  radius?: number;
  intensity?: number;
};

export const DEFAULT_TORCH_LIGHTS: readonly TorchLightSpec[] = [
  { x: 641, y: -44 },
  { x: 761, y: 16 },
  { x: 881, y: 76 },
  { x: 1001, y: 136 },
  { x: 513, y: -44 },
  { x: 393, y: 16 },
  { x: 273, y: 76 },
  { x: 153, y: 136 },
  { x: 112, y: 331 },
  { x: 232, y: 391 },
  { x: 352, y: 451 },
  { x: 1042, y: 331 },
  { x: 922, y: 391 },
  { x: 802, y: 451 },
  { x: 477, y: 742 },
  { x: 677, y: 742 },
];

export function evaluateLightmapAt(
  x: number,
  y: number,
  daylight: DaylightState,
  lights: readonly TorchLightSpec[] = DEFAULT_TORCH_LIGHTS,
  campfirePos: { x: number; y: number } = COURT_CENTER,
): { r: number; g: number; b: number; hex: number; warmBoost: number } {
  let [r, g, b] = daylight.ambient;
  const scale = daylight.lightScale;
  let warmBoost = 0;

  const campDist = Math.hypot(x - campfirePos.x, (y - campfirePos.y) * 1.35);
  const campRadius = 340;
  if (campDist < campRadius) {
    const falloff = (1 - campDist / campRadius) ** 2 * scale * 0.72;
    r += falloff * 1.05;
    g += falloff * 0.68;
    b += falloff * 0.28;
    warmBoost += falloff;
  }

  for (const light of lights) {
    const radius = light.radius ?? 190;
    const d = Math.hypot(x - light.x, (y - light.y) * 1.35);
    if (d >= radius) continue;
    const w = (1 - d / radius) ** 2 * scale * (light.intensity ?? 0.46);
    r += w * 1.0;
    g += w * 0.64;
    b += w * 0.24;
    warmBoost += w;
  }

  const cr = Math.min(1.25, r);
  const cg = Math.min(1.2, g);
  const cb = Math.min(1.15, b);
  return {
    r: cr,
    g: cg,
    b: cb,
    hex: rgbToHex([Math.min(1, cr), Math.min(1, cg), Math.min(1, cb)]),
    warmBoost,
  };
}

export type TorchNodeEntry = {
  spec: TorchLightSpec;
  container: Container;
  flame: Sprite;
  glow: Sprite;
  phase: number;
};

export type TorchLayerResult = {
  nodes: TorchNodeEntry[];
  lightingContainer: Container;
  step: (timeSec: number, daylight: DaylightState) => void;
};

let cachedGlowTex: Texture | null = null;
let cachedFlameTex: Texture | null = null;

function defaultGlowTexture(): Texture {
  if (cachedGlowTex) return cachedGlowTex;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(48, 48, 2, 48, 48, 46);
      grad.addColorStop(0, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.38, "rgba(255,220,165,0.48)");
      grad.addColorStop(0.75, "rgba(255,160,80,0.12)");
      grad.addColorStop(1, "rgba(255,140,60,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 96, 96);
      cachedGlowTex = Texture.from(canvas);
      return cachedGlowTex;
    }
  }
  return Texture.WHITE;
}

function defaultFlameTexture(): Texture {
  if (cachedFlameTex) return cachedFlameTex;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(24, 38, 2, 24, 34, 24);
      grad.addColorStop(0, "rgba(255,255,240,1)");
      grad.addColorStop(0.45, "rgba(255,196,90,0.85)");
      grad.addColorStop(0.85, "rgba(255,110,30,0.25)");
      grad.addColorStop(1, "rgba(255,80,10,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(24, 4);
      ctx.quadraticCurveTo(44, 28, 36, 52);
      ctx.quadraticCurveTo(24, 62, 12, 52);
      ctx.quadraticCurveTo(4, 28, 24, 4);
      ctx.closePath();
      ctx.fill();
      cachedFlameTex = Texture.from(canvas);
      return cachedFlameTex;
    }
  }
  return Texture.WHITE;
}

export function createTorchLayer(
  lights: readonly TorchLightSpec[] = DEFAULT_TORCH_LIGHTS,
  textures: Record<string, Texture | undefined> = {},
  campfirePos: { x: number; y: number } = COURT_CENTER,
): TorchLayerResult {
  const torchTex = textures["/realistic-torch/frame-3.webp"];
  const flameTex =
    textures["/vfx/textures/flame.png"] ??
    textures["/vfx/textures/flare.png"] ??
    defaultFlameTexture();
  const glowTex =
    textures["/vfx/textures/glow.png"] ??
    textures["/vfx/textures/flare.png"] ??
    defaultGlowTexture();

  const nodes: TorchNodeEntry[] = [];
  const lightingContainer = new Container();
  lightingContainer.zIndex = 20;

  const campHalo = new Sprite(glowTex);
  campHalo.anchor.set(0.5);
  campHalo.position.set(campfirePos.x, campfirePos.y - 18);
  campHalo.width = 480;
  campHalo.height = 290;
  campHalo.tint = 0xff9442;
  campHalo.alpha = 0.28;
  campHalo.blendMode = "add";
  lightingContainer.addChild(campHalo);

  const torchHalos: Sprite[] = [];

  for (let i = 0; i < lights.length; i++) {
    const spec = lights[i]!;
    const wrap = new Container();
    wrap.position.set(spec.x, spec.y);
    wrap.zIndex = spec.y + 1;

    if (torchTex) {
      const post = new Sprite(torchTex);
      post.anchor.set(0.5, 0.9);
      post.width = 44;
      post.height = 68;
      wrap.addChild(post);
    } else {
      const post = new Graphics();
      post
        .rect(-3, -38, 6, 38)
        .fill(0x3a281b)
        .circle(0, -40, 5)
        .fill(0x231810);
      wrap.addChild(post);
    }

    const glow = new Sprite(glowTex);
    glow.anchor.set(0.5);
    glow.position.set(0, -44);
    glow.width = 76;
    glow.height = 76;
    glow.tint = 0xff8c3b;
    glow.alpha = 0.42;
    glow.blendMode = "add";
    wrap.addChild(glow);

    const flame = new Sprite(flameTex);
    flame.anchor.set(0.5, 0.82);
    flame.position.set(0, -40);
    flame.width = 24;
    flame.height = 34;
    flame.tint = 0xffc46b;
    flame.blendMode = "add";
    wrap.addChild(flame);

    const groundHalo = new Sprite(glowTex);
    groundHalo.anchor.set(0.5);
    groundHalo.position.set(spec.x, spec.y - 10);
    groundHalo.width = 210;
    groundHalo.height = 130;
    groundHalo.tint = 0xff8a36;
    groundHalo.alpha = 0.18;
    groundHalo.blendMode = "add";
    lightingContainer.addChild(groundHalo);
    torchHalos.push(groundHalo);

    nodes.push({
      spec,
      container: wrap,
      flame,
      glow,
      phase: i * 1.73,
    });
  }

  const step = (timeSec: number, daylight: DaylightState) => {
    const lightScale = Math.max(0.18, daylight.lightScale);
    const campFlicker =
      0.92 +
      0.08 * Math.sin(timeSec * 7.3) +
      0.04 * Math.cos(timeSec * 13.1);
    campHalo.alpha = 0.34 * lightScale * campFlicker;
    campHalo.width = 480 * campFlicker;
    campHalo.height = 290 * campFlicker;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const halo = torchHalos[i]!;
      const w1 = Math.sin(timeSec * 8.5 + node.phase);
      const w2 = Math.cos(timeSec * 14.2 + node.phase * 1.3);
      const flicker = 0.88 + 0.1 * w1 + 0.06 * w2;
      node.flame.height = 34 * flicker;
      node.flame.width = 24 * (0.94 + 0.06 * w2);
      node.flame.alpha = Math.min(1, (0.65 + 0.35 * lightScale) * flicker);
      node.glow.alpha = 0.46 * lightScale * flicker;
      halo.alpha = 0.22 * lightScale * flicker;
    }
  };

  return {
    nodes,
    lightingContainer,
    step,
  };
}

export function projectShadowMatrix(
  prop: {
    x: number;
    y: number;
    w: number;
    h: number;
    ax: number;
    ay: number;
    flip?: boolean;
  },
  texWidth: number,
  texHeight: number,
  sun: SunVector,
): Matrix {
  const sx = (prop.w / Math.max(1, texWidth)) * (prop.flip ? -1 : 1);
  const sy = (prop.h / Math.max(1, texHeight)) * 0.42;
  const skewX = -sun.dx * sy * 0.55;
  const skewY = sun.dy * sy * 0.25;
  return new Matrix(sx, skewY, skewX, sy, prop.x, prop.y + 2);
}

export type ProjectedShadowLayerResult = {
  container: Container;
  shadows: Sprite[];
  sync: (sun: SunVector) => void;
};

export function createProjectedShadowLayer(
  props: ReadonlyArray<{
    id: string;
    tex: string;
    x: number;
    y: number;
    w: number;
    h: number;
    ax: number;
    ay: number;
    flip?: boolean;
  }>,
  textures: Record<string, Texture | undefined>,
): ProjectedShadowLayerResult {
  const container = new Container();
  container.zIndex = 3.5;

  const entries: Array<{
    prop: {
      x: number;
      y: number;
      w: number;
      h: number;
      ax: number;
      ay: number;
      flip?: boolean;
    };
    sprite: Sprite;
    tex: Texture;
  }> = [];

  for (const prop of props) {
    const tex = textures[prop.tex];
    if (!tex) continue;
    const sprite = new Sprite(tex);
    sprite.anchor.set(prop.ax, prop.ay);
    sprite.tint = 0x090e16;
    sprite.alpha = 0.2;
    container.addChild(sprite);
    entries.push({ prop, sprite, tex });
  }

  const sync = (sun: SunVector) => {
    const alpha = Math.max(0.05, Math.min(0.26, 0.24 * sun.strength));
    for (const entry of entries) {
      entry.sprite.alpha = alpha;
      entry.sprite.setFromMatrix(
        projectShadowMatrix(
          entry.prop,
          entry.tex.width,
          entry.tex.height,
          sun,
        ),
      );
    }
  };

  sync(sunAt(DAY_MS * 0.25));

  return {
    container,
    shadows: entries.map((e) => e.sprite),
    sync,
  };
}

export type OccluderCandidate = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  flip?: boolean;
  tex?: string;
  front?: (x: number) => number | null;
};

export function frontBound(
  prop: OccluderCandidate,
): (x: number) => number | null {
  if (prop.front) return prop.front;
  const left = prop.x - prop.w * (prop.flip ? 1 - prop.ax : prop.ax);
  const right = left + prop.w;
  const tex = prop.tex ?? "";
  const isGate = tex.includes("gate");
  const isSE = tex.includes("straight-se");
  const isWall = isSE || tex.includes("straight-ne");

  if (isWall || isGate) {
    const dir = isSE ? !prop.flip : Boolean(prop.flip);
    const slope = dir ? -0.5 : 0.5;
    return (x: number) => {
      if (x < left || x > right) return null;
      return prop.y + slope * (x - prop.x) + (isGate ? 14 : 8);
    };
  }

  return (x: number) => {
    if (x < left || x > right) return null;
    return prop.y;
  };
}

export type ActorOcclusionState = {
  occluded: boolean;
  occluderIds: string[];
  cutoutAlpha: number;
  residualAlpha: number;
};

export function computeActorOcclusion(
  actor: { x: number; y: number; lift?: number; heightPx?: number },
  occluders: readonly OccluderCandidate[],
  reliefFeatures: readonly ReliefFeature[] = DEFAULT_RELIEF_FEATURES,
): ActorOcclusionState {
  const actorHeight = actor.heightPx ?? 88;
  const actorLift = actor.lift ?? 0;
  const actorFootY = actor.y - actorLift;
  const actorHeadY = actorFootY - actorHeight;
  const occluderIds: string[] = [];

  for (const occ of occluders) {
    const fn = frontBound(occ);
    const frontY = fn(actor.x);
    if (frontY === null) continue;
    if (actor.y >= frontY) continue;
    const occTop = occ.y - occ.h * occ.ay;
    const occBottom = occ.y + occ.h * (1 - occ.ay);
    if (actorFootY >= occTop && actorHeadY <= occBottom) {
      occluderIds.push(occ.id);
    }
  }

  for (const f of reliefFeatures) {
    if (reliefHides(f, actor.x, actor.y, reliefFeatures)) {
      occluderIds.push(`relief:${f.id}`);
    }
  }

  const occluded = occluderIds.length > 0;
  return {
    occluded,
    occluderIds,
    cutoutAlpha: occluded ? OCCLUSION_CUTOUT_ALPHA : 0,
    residualAlpha: occluded ? RESIDUAL_SILHOUETTE_ALPHA : 1,
  };
}

export function applyActorSilhouetteCutout(
  silhouetteSprite: Sprite | Container,
  state: ActorOcclusionState,
): void {
  silhouetteSprite.visible = state.occluded;
  silhouetteSprite.alpha = state.occluded ? RESIDUAL_SILHOUETTE_ALPHA : 0;
}

export function strongholdAndFrontierOccluders(
  strongholdProps: readonly StrongholdPropDef[],
  frontierProps: readonly FrontierProp[],
): OccluderCandidate[] {
  const list: OccluderCandidate[] = [];
  for (const p of strongholdProps) {
    list.push({
      id: p.id,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      ax: p.ax,
      ay: p.ay,
      flip: p.flip,
      tex: p.tex,
    });
  }
  for (const f of frontierProps) {
    if (f.layer !== "upright") continue;
    list.push({
      id: f.id,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      ax: f.ax,
      ay: f.ay,
      flip: f.flip,
      front: f.front,
    });
  }
  return list;
}

export type BiomeParallaxLayerResult = {
  container: Container;
  corners: {
    topLeft: Sprite;
    topRight: Sprite;
    bottomLeft: Sprite;
    bottomRight: Sprite;
  };
  sync: (
    camX: number,
    camY: number,
    viewportWidth: number,
    viewportHeight: number,
  ) => void;
};

export function createBiomeParallax(
  textures: Record<string, Texture | undefined> = {},
  options?: { parallaxFactor?: number },
): BiomeParallaxLayerResult {
  const factor = options?.parallaxFactor ?? 0.035;
  const container = new Container();
  container.zIndex = 50;

  const treeTex =
    textures["/modular-stronghold/v2/spruce-mature.png"] ??
    textures["/modular-stronghold/v2/fir-young.png"] ??
    Texture.WHITE;
  const cliffTex =
    textures["/modular-stronghold/v2/cliff-snow.png"] ??
    textures["/modular-stronghold/v2/snowdrift-edge.png"] ??
    Texture.WHITE;

  const makeCorner = (tex: Texture, ax: number, ay: number, tint: number) => {
    const s = new Sprite(tex);
    s.anchor.set(ax, ay);
    s.width = 220;
    s.height = 180;
    s.tint = tint;
    s.alpha = 0.22;
    return s;
  };

  const topLeft = makeCorner(treeTex, 0, 0, 0x1a2636);
  const topRight = makeCorner(cliffTex, 1, 0, 0x1a2636);
  const bottomLeft = makeCorner(cliffTex, 0, 1, 0x16202e);
  const bottomRight = makeCorner(treeTex, 1, 1, 0x16202e);

  container.addChild(topLeft, topRight, bottomLeft, bottomRight);

  const sync = (
    camX: number,
    camY: number,
    viewportWidth: number,
    viewportHeight: number,
  ) => {
    const ox = -camX * factor;
    const oy = -camY * factor;
    const clampedX = Math.max(-48, Math.min(48, ox));
    const clampedY = Math.max(-36, Math.min(36, oy));

    topLeft.position.set(clampedX - 24, clampedY - 24);
    topRight.position.set(viewportWidth + clampedX + 24, clampedY - 24);
    bottomLeft.position.set(clampedX - 24, viewportHeight + clampedY + 24);
    bottomRight.position.set(
      viewportWidth + clampedX + 24,
      viewportHeight + clampedY + 24,
    );
  };

  return {
    container,
    corners: { topLeft, topRight, bottomLeft, bottomRight },
    sync,
  };
}
