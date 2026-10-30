import {
  BlurFilter,
  ColorMatrixFilter,
  Container,
  DOMAdapter,
  Graphics,
  ImageSource,
  Matrix,
  Rectangle,
  Sprite,
  Texture,
} from "pixi.js";
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
  z?: number;
  r?: number;
  wall?: boolean;
  side?: number;
  radius?: number;
  intensity?: number;
};

export const DEFAULT_TORCH_LIGHTS: readonly TorchLightSpec[] = [
  { x: 769, y: -64, z: 65, r: 172, wall: true, side: 1 },
  { x: 385, y: -64, z: 65, r: 172, wall: true, side: -1 },
  { x: -223, y: 432, z: 65, r: 172, wall: true, side: -1 },
  { x: 1377, y: 432, z: 65, r: 172, wall: true, side: 1 },
  { x: 1057, y: 80, z: 65, r: 172, wall: true, side: 1 },
  { x: 97, y: 80, z: 65, r: 172, wall: true, side: -1 },
  { x: 65, y: 576, z: 65, r: 172, wall: true, side: -1 },
  { x: 1089, y: 576, z: 65, r: 172, wall: true, side: 1 },
  { x: 1345, y: 224, z: 65, r: 172, wall: true, side: 1 },
  { x: -191, y: 224, z: 65, r: 172, wall: true, side: -1 },
  { x: 353, y: 720, z: 65, r: 172, wall: true, side: -1 },
  { x: 801, y: 720, z: 65, r: 172, wall: true, side: 1 },
  { x: 577, y: 128, z: 48, r: 196, wall: false, side: 1 },
  { x: 193, y: 320, z: 48, r: 192, wall: false, side: -1 },
  { x: 961, y: 320, z: 48, r: 192, wall: false, side: 1 },
  { x: 577, y: 608, z: 48, r: 210, wall: false, side: 1 },
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
    const radius = light.radius ?? light.r ?? 190;
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
  groundContainer: Container;
  lightingContainer: Container;
  step: (timeSec: number, daylight: DaylightState) => void;
};

const REALISTIC_TORCH = {
  srcW: 180,
  srcH: 290,
  topH: 132,
  anchorX: 90,
  anchorY: 238,
  flameX: 90,
  flameY: 112,
  scaleWall: 24 / 180,
  scalePost: 26 / 180,
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

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  try {
    return DOMAdapter.get().createCanvas(
      Math.max(1, Math.ceil(w)),
      Math.max(1, Math.ceil(h)),
    ) as unknown as HTMLCanvasElement;
  } catch {
    return null;
  }
}

function sourceOf(tex: Texture | undefined): CanvasImageSource | null {
  if (!tex || tex === Texture.WHITE) return null;
  const src = (tex.source as { resource?: unknown } | undefined)?.resource;
  if (!src) return null;
  return src as CanvasImageSource;
}

function buildPostGroundTexture(
  soilImg: CanvasImageSource | null,
  driftImg: CanvasImageSource | null,
  index = 0,
): Texture | null {
  const c = makeCanvas(216, 108);
  if (!c) return null;
  const g = c.getContext("2d");
  if (!g) return null;

  g.scale(3, 3);
  g.translate(36, 19);
  let seed = 917 + index * 431;
  const random = () =>
    ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const shade = g.createRadialGradient(0, 0, 1, 0, 0, 29);
  shade.addColorStop(0, "#343b2480");
  shade.addColorStop(1, "#40472b00");
  g.save();
  g.scale(1, 0.38);
  g.fillStyle = shade;
  g.fillRect(-32, -32, 64, 64);
  g.restore();

  if (soilImg) {
    g.save();
    g.globalAlpha = 0.28;
    g.drawImage(soilImg, -22, -11, 44, 22);
    g.restore();
  }
  if (driftImg) {
    g.save();
    g.globalAlpha = 0.18;
    g.drawImage(driftImg, -20, -10, 40, 20);
    g.restore();
  }

  for (let i = 0; i < 180; i++) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random());
    const x = Math.cos(angle) * r * 30;
    const y = Math.sin(angle) * r * 10;
    g.globalAlpha = 0.35 + random() * 0.45;
    g.fillStyle = ["#555d35", "#687043", "#7b7d4c", "#464d2e"][i % 4]!;
    g.beginPath();
    g.ellipse(x, y, 1 + random() * 3, 0.4 + random() * 1.1, -0.35, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 0.85;
  for (let i = 0; i < 26; i++) {
    const x = (random() - 0.5) * 44;
    const y = (random() - 0.5) * 13;
    const h = 2 + random() * 5;
    g.strokeStyle = i % 2 ? "#777d48" : "#454f2e";
    g.lineWidth = 0.55;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x - 1, y - h * 0.6, x + (random() - 0.5) * 4, y - h);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = "#27271f88";
  g.beginPath();
  g.ellipse(0, 0, 4, 1.6, 0, 0, Math.PI * 2);
  g.fill();
  return new Texture({ source: new ImageSource({ resource: c }) });
}

function buildPostColumnTexture(): Texture | null {
  const c = makeCanvas(16, 56);
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createLinearGradient(4, 0, 12, 0);
  grad.addColorStop(0, "#241811");
  grad.addColorStop(0.45, "#4a3528");
  grad.addColorStop(1, "#1c120d");
  ctx.fillStyle = grad;
  ctx.fillRect(5, 6, 6, 46);
  ctx.fillStyle = "#18120e";
  ctx.fillRect(4, 10, 8, 3);
  ctx.fillRect(4, 42, 8, 3);
  return new Texture({ source: new ImageSource({ resource: c }) });
}

export function createTorchLayer(
  lights: readonly TorchLightSpec[] = DEFAULT_TORCH_LIGHTS,
  textures: Record<string, Texture | undefined> = {},
  campfirePos: { x: number; y: number } = COURT_CENTER,
): TorchLayerResult {
  const f0 = textures["/realistic-torch/frame-0.webp"];
  const f1 = textures["/realistic-torch/frame-1.webp"];
  const f2 = textures["/realistic-torch/frame-2.webp"];
  const f3 = textures["/realistic-torch/frame-3.webp"];

  const hasRealisticTorch = Boolean(
    f0 &&
      f1 &&
      f2 &&
      f3 &&
      f3.width >= REALISTIC_TORCH.srcW &&
      f3.height >= REALISTIC_TORCH.srcH,
  );

  const bodyFrame = hasRealisticTorch
    ? new Texture({
        source: f3!.source,
        frame: new Rectangle(
          0,
          REALISTIC_TORCH.topH,
          REALISTIC_TORCH.srcW,
          REALISTIC_TORCH.srcH - REALISTIC_TORCH.topH,
        ),
      })
    : f3;

  const topFrames = hasRealisticTorch
    ? [f0!, f1!, f2!].map(
        (t) =>
          new Texture({
            source: t.source,
            frame: new Rectangle(0, 0, REALISTIC_TORCH.srcW, REALISTIC_TORCH.topH),
          }),
      )
    : [];

  const rawSheetFlame = textures["/vfx/textures/flame.png"];
  const croppedSheetFlame =
    rawSheetFlame && rawSheetFlame !== Texture.WHITE && rawSheetFlame.width >= 64
      ? new Texture({
          source: rawSheetFlame.source,
          frame: new Rectangle(
            0,
            0,
            Math.floor(rawSheetFlame.width / 4),
            Math.floor(rawSheetFlame.height / 4),
          ),
        })
      : undefined;

  const flameTex =
    topFrames[0] ??
    croppedSheetFlame ??
    textures["/vfx/textures/flare.png"] ??
    defaultFlameTexture();
  const glowTex =
    textures["/vfx/textures/glow.png"] ??
    textures["/vfx/textures/flare.png"] ??
    defaultGlowTexture();

  const postGroundTex = buildPostGroundTexture(
    sourceOf(textures["/foundation-transitions/soil-moss.png"]),
    sourceOf(textures["/modular-stronghold/v2/snowdrift-edge.png"]),
  );
  const postColTex = buildPostColumnTexture();

  const nodes: TorchNodeEntry[] = [];
  const groundContainer = new Container();
  groundContainer.zIndex = 3.15;

  const lightingContainer = new Container();
  lightingContainer.sortableChildren = true;
  lightingContainer.zIndex = 9998;

  // Build multiply lightmap + additive warm glow matching arkodia-archived/src/stronghold/lighting.ts
  const lmScale = 0.25;
  const lmPad = 900;
  const lmLeft = -323 - lmPad;
  const lmTop = -160 - lmPad;
  const lmWorldW = 1800 + lmPad * 2;
  const lmWorldH = 1120 + lmPad * 2;
  const lmCanvas = makeCanvas(lmWorldW * lmScale, lmWorldH * lmScale);
  let lmCtx: CanvasRenderingContext2D | null = null;
  let lmSource: ImageSource | null = null;
  if (lmCanvas) {
    lmCtx = lmCanvas.getContext("2d");
    lmSource = new ImageSource({ resource: lmCanvas });
    const lmSprite = new Sprite(new Texture({ source: lmSource }));
    lmSprite.position.set(lmLeft, lmTop);
    lmSprite.scale.set(1 / lmScale);
    lmSprite.blendMode = "multiply";
    lmSprite.zIndex = 1;
    lightingContainer.addChild(lmSprite);
  }

  const warmGlow = new Container();
  warmGlow.zIndex = 2;
  lightingContainer.addChild(warmGlow);

  const campHalo = new Sprite(glowTex);
  campHalo.anchor.set(0.5);
  campHalo.position.set(campfirePos.x, campfirePos.y - 26);
  campHalo.width = 560;
  campHalo.height = 360;
  campHalo.tint = 0xff9442;
  campHalo.alpha = 0.22;
  campHalo.blendMode = "add";
  warmGlow.addChild(campHalo);

  const torchHalos: Sprite[] = [];

  for (let i = 0; i < lights.length; i++) {
    const spec = lights[i]!;
    const isWall = Boolean(spec.wall);
    const zLift = spec.z ?? 36;
    const scale = isWall ? REALISTIC_TORCH.scaleWall : REALISTIC_TORCH.scalePost;

    if (!isWall && postGroundTex) {
      const g = new Sprite(postGroundTex);
      g.anchor.set(0.5, 19 / 36);
      g.width = 72;
      g.height = 36;
      g.position.set(spec.x, spec.y);
      groundContainer.addChild(g);
    }

    const wrap = new Container();
    wrap.position.set(spec.x, spec.y);
    wrap.zIndex = spec.y + (isWall ? 6 : 2);

    if (!isWall) {
      if (postColTex) {
        const post = new Sprite(postColTex);
        post.anchor.set(0.5, 0.92);
        post.position.set(0, 2);
        wrap.addChild(post);
      } else {
        const post = new Graphics();
        post.rect(-3, -38, 6, 40).fill(0x3b2a20);
        wrap.addChild(post);
      }
    }

    if (bodyFrame) {
      const body = new Sprite(bodyFrame);
      if (hasRealisticTorch) {
        body.anchor.set(
          REALISTIC_TORCH.anchorX / REALISTIC_TORCH.srcW,
          (REALISTIC_TORCH.anchorY - REALISTIC_TORCH.topH) /
            (REALISTIC_TORCH.srcH - REALISTIC_TORCH.topH),
        );
        body.scale.set(scale * (spec.side === -1 ? -1 : 1), scale);
        body.position.set(0, -zLift + 16);
      } else {
        body.anchor.set(0.5, 0.9);
        body.width = 34;
        body.height = 54;
      }
      wrap.addChild(body);
    }

    const glow = new Sprite(glowTex);
    glow.anchor.set(0.5);
    glow.position.set(0, -zLift);
    glow.width = 76;
    glow.height = 76;
    glow.tint = 0xff8c3b;
    glow.alpha = 0.34;
    glow.blendMode = "add";
    wrap.addChild(glow);

    const flame = new Sprite(flameTex);
    if (hasRealisticTorch) {
      flame.anchor.set(
        REALISTIC_TORCH.anchorX / REALISTIC_TORCH.srcW,
        REALISTIC_TORCH.anchorY / REALISTIC_TORCH.topH,
      );
      flame.scale.set(scale * (spec.side === -1 ? -1 : 1), scale);
      flame.position.set(0, -zLift + 16);
    } else {
      flame.anchor.set(0.5, 0.82);
      flame.position.set(0, -zLift);
      flame.width = 24;
      flame.height = 34;
      flame.tint = 0xffc46b;
      flame.blendMode = "add";
    }
    wrap.addChild(flame);

    const groundHalo = new Sprite(glowTex);
    groundHalo.anchor.set(0.5);
    groundHalo.position.set(spec.x, spec.y - zLift * 0.45);
    const radius = spec.radius ?? spec.r ?? 188;
    groundHalo.width = radius * 1.65;
    groundHalo.height = radius * 1.15;
    groundHalo.tint = 0xff8a36;
    groundHalo.alpha = 0.14;
    groundHalo.blendMode = "add";
    warmGlow.addChild(groundHalo);
    torchHalos.push(groundHalo);

    nodes.push({
      spec,
      container: wrap,
      flame,
      glow,
      phase: i * 1.73,
    });
  }

  let lastLmKey = "";
  const step = (timeSec: number, daylight: DaylightState) => {
    const lightScale = Math.max(0.18, daylight.lightScale);
    const campFlicker =
      0.92 +
      0.08 * Math.sin(timeSec * 7.3) +
      0.04 * Math.cos(timeSec * 13.1);
    campHalo.alpha = 0.24 * lightScale * campFlicker;
    campHalo.width = 560 * campFlicker;
    campHalo.height = 360 * campFlicker;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const halo = torchHalos[i]!;
      const w1 = Math.sin(timeSec * 8.5 + node.phase);
      const w2 = Math.cos(timeSec * 14.2 + node.phase * 1.3);
      const flicker = 0.9 + 0.07 * w1 + 0.04 * w2;
      if (hasRealisticTorch && topFrames.length === 3) {
        const frameIdx =
          Math.floor(timeSec * 8.5 + i * 1.3) % topFrames.length;
        node.flame.texture = topFrames[Math.abs(frameIdx)]!;
        const isWall = Boolean(node.spec.wall);
        const sc =
          (isWall ? REALISTIC_TORCH.scaleWall : REALISTIC_TORCH.scalePost) *
          (0.96 + 0.05 * w1);
        node.flame.scale.set(
          sc * (node.spec.side === -1 ? -1 : 1),
          sc * flicker,
        );
      } else {
        node.flame.height = 34 * flicker;
        node.flame.width = 24 * (0.94 + 0.06 * w2);
        node.flame.alpha = Math.min(1, (0.65 + 0.35 * lightScale) * flicker);
      }
      node.glow.alpha = 0.32 * lightScale * flicker;
      halo.alpha = 0.14 * lightScale * flicker;
    }

    if (lmCtx && lmCanvas && lmSource) {
      const [ar, ag, ab] = daylight.ambient;
      const ri = Math.round(ar * 255);
      const gi = Math.round(ag * 255);
      const bi = Math.round(ab * 255);
      const key = `${ri},${gi},${bi},${Math.round(timeSec * 6)}`;
      if (key !== lastLmKey) {
        lastLmKey = key;
        const w = lmCanvas.width;
        const h = lmCanvas.height;
        lmCtx.globalCompositeOperation = "source-over";
        lmCtx.fillStyle = `rgb(${ri}, ${gi}, ${bi})`;
        lmCtx.fillRect(0, 0, w, h);

        lmCtx.globalCompositeOperation = "lighter";
        const punch = (wx: number, wy: number, r: number, strength: number) => {
          const cx = (wx - lmLeft) * lmScale;
          const cy = (wy - lmTop) * lmScale;
          const rad = r * lmScale;
          const g = lmCtx!.createRadialGradient(cx, cy, rad * 0.06, cx, cy, rad);
          const a = Math.min(1, strength * lightScale);
          g.addColorStop(0, `rgba(255, 224, 176, ${a.toFixed(3)})`);
          g.addColorStop(0.45, `rgba(240, 172, 102, ${(a * 0.52).toFixed(3)})`);
          g.addColorStop(1, "rgba(0, 0, 0, 0)");
          lmCtx!.fillStyle = g;
          lmCtx!.beginPath();
          lmCtx!.arc(cx, cy, rad, 0, Math.PI * 2);
          lmCtx!.fill();
        };

        punch(campfirePos.x, campfirePos.y - 22, 340 * campFlicker, 0.78);
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]!;
          const r = (n.spec.radius ?? n.spec.r ?? 188) * 1.05;
          punch(n.spec.x, n.spec.y - (n.spec.z ?? 36) * 0.5, r, 0.52);
        }
        lmSource.update();
      }
    }
  };

  return {
    nodes,
    groundContainer,
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
  const flip = prop.flip ? -1 : 1;
  const sx = prop.w / Math.max(1, texWidth);
  const sy = prop.h / Math.max(1, texHeight);
  const a = flip * sx;
  const c = -sx * sun.dx * (1 - prop.ay);
  const d = sy * Math.abs(sun.dy) * (1 - prop.ay);
  const tx = prop.x - a * texWidth * prop.ax - c * texHeight * prop.ay;
  const ty = prop.y - d * texHeight * prop.ay;
  return new Matrix(a, 0, c, d, tx, ty);
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
  container.zIndex = 3.2;

  try {
    const tint = new ColorMatrixFilter();
    tint.matrix = [
      0, 0, 0, 0, 18 / 255,
      0, 0, 0, 0, 26 / 255,
      0, 0, 0, 0, 40 / 255,
      0, 0, 0, 1, 0,
    ];
    container.filters = [tint, new BlurFilter({ strength: 4, quality: 2 })];
  } catch {
    // Headless fallback
  }

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
    sprite.anchor.set(0, 0);
    sprite.alpha = 0.22;
    container.addChild(sprite);
    entries.push({ prop, sprite, tex });
  }

  const sync = (sun: SunVector) => {
    const alpha = Math.max(0.05, Math.min(0.28, 0.25 * sun.strength));
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
