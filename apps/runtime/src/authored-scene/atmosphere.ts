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
import { blurOptions } from "./quality";

import {
  DAY_MS,
  MIN_AMBIENT_LUMA,
  MAX_SHADOW,
  daylightAt,
  sunAt,
  rgbToHex,
  type DaylightState,
  type SunVector,
} from "./daylight";
export * from "./daylight";
export const OCCLUSION_CUTOUT_ALPHA = 0.68;
export const RESIDUAL_SILHOUETTE_ALPHA = 1 - OCCLUSION_CUTOUT_ALPHA;

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
  width: 24,
  height: 39,
  top: 15.75,
  postStart: 13.5,
  postWidth: 3.75,
  flameHeight: (39 * 132) / 290,
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
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
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
    g.ellipse(
      x,
      y,
      1 + random() * 3,
      0.4 + random() * 1.1,
      -0.35,
      0,
      Math.PI * 2,
    );
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
        source: f1!.source,
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
            frame: new Rectangle(
              0,
              0,
              REALISTIC_TORCH.srcW,
              REALISTIC_TORCH.topH,
            ),
          }),
      )
    : [];

  const rawSheetFlame = textures["/vfx/textures/flame.png"];
  const croppedSheetFlame =
    rawSheetFlame &&
    rawSheetFlame !== Texture.WHITE &&
    rawSheetFlame.width >= 64
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

  const nodes: TorchNodeEntry[] = [];
  const groundContainer = new Container();
  groundContainer.zIndex = 3.15;

  const lightingContainer = new Container();
  lightingContainer.sortableChildren = true;
  lightingContainer.zIndex = 9998;

  const warmGlow = new Container();
  warmGlow.zIndex = 2;
  lightingContainer.addChild(warmGlow);

  const campHalo = new Sprite(glowTex);
  campHalo.anchor.set(0.5);
  campHalo.position.set(campfirePos.x, campfirePos.y - 26);
  campHalo.width = 210;
  campHalo.height = 115;
  campHalo.tint = 0xff9646;
  campHalo.alpha = 0.18;
  campHalo.blendMode = "add";
  warmGlow.addChild(campHalo);

  const torchHalos: Sprite[] = [];
  let postIndex = 0;

  for (let i = 0; i < lights.length; i++) {
    const spec = lights[i]!;
    const isWall = Boolean(spec.wall);
    const zLift = spec.z ?? (isWall ? 65 : 48);

    if (!isWall) {
      const postGroundTex = buildPostGroundTexture(null, null, postIndex++);
      if (postGroundTex) {
        const g = new Sprite(postGroundTex);
        g.anchor.set(0.5, 19 / 36);
        g.width = 72;
        g.height = 36;
        g.position.set(spec.x, spec.y);
        groundContainer.addChild(g);
      }
    }

    const wrap = new Container();
    wrap.position.set(spec.x, spec.y);
    wrap.zIndex = spec.y + (isWall ? 6 : 2);

    if (!isWall) {
      const post = new Graphics();
      post
        .moveTo(0, -zLift + REALISTIC_TORCH.postStart)
        .lineTo(0, 0)
        .stroke({
          color: 0x3b2a20,
          width: REALISTIC_TORCH.postWidth,
          cap: "butt",
        });
      wrap.addChild(post);
    }

    if (bodyFrame) {
      const body = new Sprite(bodyFrame);
      if (hasRealisticTorch) {
        body.anchor.set(0.5, 0);
        body.position.set(
          0,
          -zLift - REALISTIC_TORCH.top + REALISTIC_TORCH.flameHeight,
        );
        body.width = REALISTIC_TORCH.width;
        body.height = REALISTIC_TORCH.height - REALISTIC_TORCH.flameHeight;
      } else {
        body.anchor.set(0.5, 0.9);
        body.width = 24;
        body.height = 39;
      }
      wrap.addChild(body);
    }

    const glow = new Sprite(glowTex);
    glow.anchor.set(0.5);
    glow.position.set(0, -zLift - 7);
    glow.width = 36;
    glow.height = 36;
    glow.tint = 0xff9646;
    glow.alpha = 0.22;
    glow.blendMode = "add";
    wrap.addChild(glow);

    const flame = new Sprite(flameTex);
    if (hasRealisticTorch) {
      flame.anchor.set(0.5, 0);
      flame.position.set(0, -zLift - REALISTIC_TORCH.top);
      flame.width = REALISTIC_TORCH.width;
      flame.height = REALISTIC_TORCH.flameHeight;
    } else {
      flame.anchor.set(0.5, 0.82);
      flame.position.set(0, -zLift);
      flame.width = 18;
      flame.height = 24;
      flame.tint = 0xffc46b;
      flame.blendMode = "add";
    }
    wrap.addChild(flame);

    const groundHalo = new Sprite(glowTex);
    groundHalo.anchor.set(0.5);
    groundHalo.position.set(spec.x, spec.y);
    groundHalo.width = 190;
    groundHalo.height = 104;
    groundHalo.tint = 0xff9646;
    groundHalo.alpha = 0.12;
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

  const step = (timeSec: number, daylight: DaylightState) => {
    const lightScale = Math.max(0, daylight.lightScale);
    const campFlicker =
      0.94 + 0.04 * Math.sin(timeSec * 7.3) + 0.02 * Math.cos(timeSec * 13.1);
    campHalo.alpha = 0.18 * lightScale * campFlicker;
    campHalo.width = 210 * campFlicker;
    campHalo.height = 115 * campFlicker;

    const frameStep = Math.floor((timeSec * 1000) / 160);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const halo = torchHalos[i]!;
      const w1 = Math.sin(timeSec * 8.5 + node.phase);
      const w2 = Math.cos(timeSec * 14.2 + node.phase * 1.3);
      const flicker = 0.94 + 0.04 * w1 + 0.02 * w2;
      if (hasRealisticTorch && topFrames.length === 3) {
        node.flame.texture = topFrames[Math.abs(frameStep + i) % 3]!;
        node.flame.width = REALISTIC_TORCH.width;
        node.flame.height = REALISTIC_TORCH.flameHeight;
      } else {
        node.flame.height = 24 * flicker;
        node.flame.width = 18 * (0.94 + 0.06 * w2);
        node.flame.alpha = Math.min(1, (0.65 + 0.35 * lightScale) * flicker);
      }
      node.flame.visible = lightScale > 0.01;
      node.glow.alpha = 0.22 * lightScale * flicker;
      halo.alpha = 0.12 * lightScale * flicker;
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
      0,
      0,
      0,
      0,
      18 / 255,
      0,
      0,
      0,
      0,
      26 / 255,
      0,
      0,
      0,
      0,
      40 / 255,
      0,
      0,
      0,
      1,
      0,
    ];
    container.filters = [tint, new BlurFilter(blurOptions(4, 2))];
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
    const alpha = Math.min(0.4, 0.4 * sun.strength);
    for (const entry of entries) {
      entry.sprite.alpha = alpha;
      entry.sprite.setFromMatrix(
        projectShadowMatrix(entry.prop, entry.tex.width, entry.tex.height, sun),
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
