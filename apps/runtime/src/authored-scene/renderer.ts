import {
  Assets,
  Container,
  Graphics,
  Matrix,
  Rectangle,
  Sprite,
  Texture,
} from "pixi.js";
import {
  frameAt,
  placementProfile,
  propMatrix,
  viewBox,
  type Instance,
  type Part,
  type Scene,
} from "./scene";
import {
  COURT_CENTER,
  DAY_MS,
  GATE_DOOR_CONFIG,
  createEnvironmentRuntime,
  mapToCourt,
  noise2,
  sceneToEnvironmentMap,
  topOf,
  PX_PER_METER,
  type EnvironmentRuntime,
  type EnvironmentRuntimeMetrics,
} from "./environment-runtime";
export * from "./environment-runtime";
export { propMatrix };
export function applyNativeProp(
  sprite: Sprite,
  p: {
    width: number;
    foot: number;
    vertical: number;
    shear: number;
    x: number;
    y: number;
  },
) {
  const m = propMatrix(p, sprite.texture.width);
  sprite.anchor.set(0.5, p.foot);
  sprite.setFromMatrix(new Matrix(m.a, m.b, m.c, m.d, m.tx, m.ty));
}
const textures = new Map<string, Promise<Texture>>();
async function texture(p: Part) {
  const key = p.asset + ":" + (p.sha256 ?? "");
  if (!textures.has(key))
    textures.set(
      key,
      (async () => {
        if (!p.sha256) return Assets.load<Texture>(p.asset);
        const r = await fetch(p.asset, { credentials: "omit" });
        if (!r.ok) throw Error(`Texture HTTP ${r.status}`);
        const bytes = await r.arrayBuffer();
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (n) => n.toString(16).padStart(2, "0"),
        ).join("");
        if (digest !== p.sha256)
          throw Error("Scene texture integrity mismatch");
        const bitmap = await createImageBitmap(
          new Blob([bytes], {
            type: r.headers.get("Content-Type") ?? "image/png",
          }),
        );
        return Texture.from(bitmap);
      })().catch((e) => {
        textures.delete(key);
        throw e;
      }),
    );
  return textures.get(key)!;
}
export type SceneNode = Container & {
  sceneTick: (time: number) => void;
  sceneMetrics: () => unknown;
};
export async function createSceneNode(o: Instance): Promise<SceneNode> {
  const node = new Container() as SceneNode;
  node.label = o.id;
  const animations: {
    sprite: Sprite;
    frames: Texture[];
    clip: NonNullable<Part["animation"]>;
  }[] = [];
  const visuals: { part: Part; visual: Sprite | Graphics }[] = [];
  for (const p of o.definition.parts) {
    let visual: Sprite | Graphics;
    if (p.kind === "pillar")
      visual = new Graphics()
        .rect(-9, -65, 18, 60)
        .fill(p.color)
        .rect(-14, -72, 28, 9)
        .fill(p.color)
        .rect(-14, -8, 28, 8)
        .fill(p.color);
    else {
      const atlas = await texture(p);
      let t = atlas;
      const frames = p.animation?.frames.map((f) => {
        if (f.x + f.width > atlas.width || f.y + f.height > atlas.height)
          throw Error("Scene animation exceeds texture bounds");
        return new Texture({
          source: atlas.source,
          frame: new Rectangle(f.x, f.y, f.width, f.height),
        });
      });
      if (frames) t = frames[0];
      const s = new Sprite(t),
        profile =
          p.presentation ??
          placementProfile({
            asset: p.asset,
            category: p.category ?? o.category,
          });
      s.anchor.set(
        p.sourceTransform ? 0 : 0.5,
        p.sourceTransform ? 0 : profile.anchorY,
      );
      if (p.sourceTransform)
        s.setFromMatrix(new Matrix(...p.sourceTransform, 0, 0));
      else if (profile.plane) {
        const sx = profile.width / (2 * t.width),
          sy = profile.width / (2 * t.height);
        s.setFromMatrix(new Matrix(sx, sx * 0.5, -sy, sy * 0.5, 0, 0));
      } else s.scale.set(profile.width / t.width);
      s.tint = p.color;
      visual = s;
      if (p.animation && frames)
        animations.push({ sprite: s, frames, clip: p.animation });
    }
    visual.position.set(p.x, p.y);
    visual.scale.set(visual.scale.x * p.scale, visual.scale.y * p.scale);
    visual.rotation += (p.rotation * Math.PI) / 180;
    if (p.pivot) visual.pivot.set(p.pivot.x, p.pivot.y);
    node.addChild(visual);
    visuals.push({ part: p, visual });
  }
  node.position.set(o.x * 10, o.y * 7);
  node.scale.set(o.scale);
  node.angle = o.rotation;
  if (o.pivot) node.pivot.set(o.pivot.x, o.pivot.y);
  node.zIndex = placementProfile(o).layer + o.y * 7;
  node.sceneTick = (time) => {
    for (const a of animations)
      a.sprite.texture = a.frames[frameAt(time, a.clip)];
  };
  node.sceneMetrics = () => {
    for (const { visual } of visuals) visual.updateLocalTransform();
    return {
      id: o.id,
      name: o.name,
      category: o.category,
      position: [node.x, node.y],
      scale: [node.scale.x, node.scale.y],
      rotation: node.angle,
      pivot: [node.pivot.x, node.pivot.y],
      depth: node.zIndex,
      parts: visuals.map(({ part: p, visual: v }) => ({
        id: p.id,
        asset: p.asset,
        sha256: p.sha256,
        anchor: v instanceof Sprite ? [v.anchor.x, v.anchor.y] : null,
        pivot: [v.pivot.x, v.pivot.y],
        matrix: [
          v.localTransform.a,
          v.localTransform.b,
          v.localTransform.c,
          v.localTransform.d,
          v.x,
          v.y,
        ],
        frame:
          v instanceof Sprite
            ? [
                v.texture.frame.x,
                v.texture.frame.y,
                v.texture.frame.width,
                v.texture.frame.height,
              ]
            : null,
        tint: v instanceof Sprite ? v.tint : p.color,
      })),
    };
  };
  node.on("destroyed", () => {
    for (const a of animations) for (const t of a.frames) t.destroy();
  });
  return node;
}
export function resizeScene(
  root: Container,
  width: number,
  height: number,
  scene: Scene,
) {
  const b = viewBox(width, height, scene.world);
  root.position.set(b.x, b.y);
  root.scale.set(b.scale);
  return b;
}
export type SceneGroundOptions = {
  stage1?: boolean;
  stage2?: boolean;
  stage3?: boolean;
  stage4?: boolean;
  stage5?: boolean;
  daylightPhase?: string;
  gateOpen?: boolean;
  actorPreview?: boolean;
  textures?: Record<string, Texture | undefined>;
};

let envTexturesPromise: Promise<Record<string, Texture>> | null = null;

function createProceduralSnowTexture(): Texture {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const img = ctx.createImageData(128, 128);
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const n1 = noise2(x * 0.08, y * 0.08);
          const n2 = noise2(x * 0.22 + 17, y * 0.22 + 31);
          const v = 0.84 + (n1 - 0.5) * 0.1 + (n2 - 0.5) * 0.05;
          const idx = (y * 128 + x) * 4;
          img.data[idx] = Math.round(218 * v);
          img.data[idx + 1] = Math.round(229 * v);
          img.data[idx + 2] = Math.round(240 * v);
          img.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return Texture.from(canvas);
    }
  }
  return Texture.WHITE;
}

export function loadEnvironmentRuntimeTextures(
  baseUrl = "",
): Promise<Record<string, Texture>> {
  if (envTexturesPromise) return envTexturesPromise;
  const resolveAsset = (name: string) =>
    baseUrl ? new URL(`/assets/${name}`, baseUrl).href : `/assets/${name}`;
  envTexturesPromise = (async () => {
    const [
      paving,
      cliff,
      spruce,
      wall,
      gate,
      campfire,
      flame,
      brazier,
      bastion,
    ] = await Promise.all([
      Assets.load<Texture>(resolveAsset("paving-warm-texture.png")),
      Assets.load<Texture>(resolveAsset("cliff-snow.png")),
      Assets.load<Texture>(resolveAsset("spruce-mature.png")),
      Assets.load<Texture>(resolveAsset("wall-broken.png")),
      Assets.load<Texture>(resolveAsset("gateway-grand.png")),
      Assets.load<Texture>(resolveAsset("buildings/core/campfire.png")),
      Assets.load<Texture>(resolveAsset("flame.png")),
      Assets.load<Texture>(resolveAsset("brazier.png")),
      Assets.load<Texture>(resolveAsset("bastion.png")),
    ]);
    const snow = createProceduralSnowTexture();
    return {
      "/modular-stronghold/v2/snow-soft-texture.png": snow,
      "/modular-stronghold/v2/snowdrift-edge.png": snow,
      "/modular-stronghold/v2/paving-warm-texture.png": paving,
      "/modular-stronghold/v2/paving-worn.png": paving,
      "/modular-stronghold/v2/cliff-snow.png": cliff,
      "/modular-stronghold/v2/boulders-snow.png": cliff,
      "/modular-stronghold/v2/spruce-mature.png": spruce,
      "/modular-stronghold/v2/fir-young.png": spruce,
      "/modular-stronghold/v2/weeds-edge.png": spruce,
      "/buildings/starter-boundary/straight-ne-a.png": wall,
      "/buildings/starter-boundary/straight-ne-b.png": wall,
      "/buildings/starter-boundary/straight-se-a.png": wall,
      "/buildings/starter-boundary/straight-se-b.png": wall,
      "/buildings/starter-boundary/gate-closed.png": gate,
      "/buildings/starting-campfire/campfire-v1.png": campfire,
      "/vfx/textures/flame.png": flame,
      "/realistic-torch/frame-3.webp": brazier,
      "/buildings/bastion/bastion-v1.png": bastion,
    };
  })().catch((e) => {
    envTexturesPromise = null;
    throw e;
  });
  return envTexturesPromise;
}

type MountedEnvState = {
  env: EnvironmentRuntime;
  stage1: Container;
  stage2: Container;
  stage3: Container;
  stage4: Container;
  stage5: Container;
  gateGraphic: Graphics;
  shadowGraphic: Graphics;
  occlusionGraphic: Graphics;
  ambientGraphic: Graphics;
};

const rootEnvironments = new WeakMap<Container, EnvironmentRuntime>();
const mountedEnvStates = new WeakMap<Container, MountedEnvState>();

function resolveDaylightMs(phase: string | undefined, timeSec: number): number {
  const key = (phase ?? "").toLowerCase();
  if (key === "dawn") return DAY_MS * 0.02;
  if (key === "morning") return DAY_MS * 0.16;
  if (key === "noon") return DAY_MS * 0.35;
  if (key === "afternoon") return DAY_MS * 0.55;
  if (key === "dusk") return DAY_MS * 0.7;
  if (key === "twilight") return DAY_MS * 0.8;
  if (key === "night") return DAY_MS * 0.9;
  return 132_000 + timeSec * 1000;
}

function drawGateDoorGraphic(g: Graphics, open: boolean, progress: number) {
  g.clear();
  const gx = GATE_DOOR_CONFIG.x;
  const gy = GATE_DOOR_CONFIG.y;
  g.ellipse(gx, gy, GATE_DOOR_CONFIG.closeRadius, GATE_DOOR_CONFIG.closeRadius * 0.5)
    .stroke({ color: 0x6ea8d6, width: 1.5, alpha: 0.22 })
    .ellipse(gx, gy, GATE_DOOR_CONFIG.openRadius, GATE_DOOR_CONFIG.openRadius * 0.5)
    .stroke({
      color: open ? 0x8be29b : 0xe9ac4c,
      width: 2,
      alpha: 0.42,
    });
  const gap = 14 + progress * 48;
  g.rect(gx - 56, gy - 36, 56 - gap * 0.5, 34)
    .fill({ color: open ? 0x4f7758 : 0x5c4332, alpha: 0.86 })
    .rect(gx + gap * 0.5, gy - 36, 56 - gap * 0.5, 34)
    .fill({ color: open ? 0x4f7758 : 0x5c4332, alpha: 0.86 })
    .poly([gx - 64, gy - 38, gx, gy - 58, gx + 64, gy - 38])
    .stroke({ color: open ? 0x9ce8a8 : 0xe9ac4c, width: 3, alpha: 0.8 });
}

function drawProjectedShadowsGraphic(g: Graphics, env: EnvironmentRuntime) {
  g.clear();
  const sun = env.sun;
  const alpha = Math.max(0.08, Math.min(0.32, 0.28 * sun.strength));
  const ox = -sun.dx * 46;
  const oy = Math.abs(sun.dy) * 34 + 14;
  for (const prop of env.strongholdProps) {
    const hw = Math.max(24, prop.w * 0.28);
    const hh = Math.max(12, prop.h * 0.12);
    g.poly([
      prop.x - hw,
      prop.y,
      prop.x + hw,
      prop.y,
      prop.x + hw + ox,
      prop.y + oy,
      prop.x - hw + ox,
      prop.y + oy,
    ]).fill({ color: 0x070c14, alpha });
  }
  for (const fp of env.frontierProps) {
    if (fp.layer !== "upright") continue;
    const lift = env.liftAt(fp.x, fp.y);
    const py = fp.y - lift;
    const hw = Math.max(14, fp.w * 0.22);
    g.ellipse(
      fp.x + ox * 0.65,
      py + oy * 0.55,
      hw,
      Math.max(10, hhFromProp(fp) * 0.45),
    ).fill({ color: 0x070c14, alpha: alpha * 0.85 });
  }
}

function hhFromProp(fp: { h: number }): number {
  return Math.max(16, fp.h * 0.22);
}

function drawActorOcclusionGraphic(
  g: Graphics,
  env: EnvironmentRuntime,
  visible: boolean,
) {
  g.clear();
  if (!visible) return;
  const ax = GATE_DOOR_CONFIG.x;
  const ay = 740;
  const occ = env.actorOcclusion;
  g.circle(ax, ay - 44, 52)
    .fill({ color: 0x101822, alpha: occ.cutoutAlpha * 0.45 })
    .stroke({ color: 0x75b8db, width: 2, alpha: 0.72 });
  g.ellipse(ax, ay, 20, 10).fill({ color: 0x0b1018, alpha: 0.45 });
  g.roundRect(ax - 12, ay - 68, 24, 52, 8)
    .fill({ color: 0x75b8db, alpha: Math.max(0.32, occ.residualAlpha) })
    .circle(ax, ay - 78, 11)
    .fill({ color: 0x9be0ff, alpha: Math.max(0.32, occ.residualAlpha) });
}

function findMountedState(root: Container): MountedEnvState | undefined {
  const direct = mountedEnvStates.get(root);
  if (direct) return direct;
  for (const child of root.children) {
    if (child instanceof Container && mountedEnvStates.has(child)) {
      return mountedEnvStates.get(child);
    }
  }
  return undefined;
}

export function sceneGround(
  root: Container,
  scene: Scene,
  options: SceneGroundOptions = {},
): EnvironmentRuntime {
  const g = new Graphics()
    .rect(0, 0, scene.world.width, scene.world.height)
    .fill(0x202c2b);
  for (let x = -700; x < 1700; x += 64)
    g.moveTo(x, 0)
      .lineTo(x + 1400, 700)
      .stroke({ color: 0x40534d, alpha: 0.25, width: 1 });
  for (let x = -700; x < 1700; x += 64)
    g.moveTo(x, 0)
      .lineTo(x - 1400, 700)
      .stroke({ color: 0x40534d, alpha: 0.25, width: 1 });
  g.zIndex = -20000;
  root.addChild(g);
  root.sortableChildren = true;

  const hasTextures = Boolean(
    options.textures && Object.keys(options.textures).length > 0,
  );
  const env = createEnvironmentRuntime({
    environmentMap: sceneToEnvironmentMap(scene),
    textures: options.textures,
  });

  const envStage = new Container();
  envStage.label = "environment-runtime-stage";
  envStage.zIndex = -19000;
  envStage.sortableChildren = true;
  envStage.eventMode = "none";
  const scale = 0.42;
  envStage.scale.set(scale);
  envStage.position.set(
    scene.world.width * 0.5 - COURT_CENTER.x * scale,
    scene.world.height * 0.5 - COURT_CENTER.y * scale,
  );

  // Stage 1: Coordinate grid, snow backdrop, court surface, gateway apron, foundations & south gate
  const stage1 = new Container();
  stage1.zIndex = 1;
  stage1.sortableChildren = true;
  if (hasTextures) {
    env.snow.sprite.zIndex = -10;
    env.snow.sprite.alpha = 0.72;
    stage1.addChild(env.snow.sprite);
  } else {
    const snowField = new Graphics()
      .roundRect(-620, -320, 2400, 1480, 64)
      .fill({ color: 0x2a3947, alpha: 0.44 })
      .ellipse(COURT_CENTER.x, COURT_CENTER.y + 40, 1080, 560)
      .stroke({ color: 0x8fb3d4, width: 2, alpha: 0.22 });
    snowField.zIndex = -5;
    stage1.addChild(snowField);
  }
  stage1.addChild(
    env.courtSurface.container,
    env.foundations.under,
    env.foundations.face,
  );
  const enclosureOutline = new Graphics();
  enclosureOutline.zIndex = 4;
  for (const prop of env.strongholdProps) {
    if (prop.id === "campfire") {
      enclosureOutline
        .circle(prop.x, prop.y, 34)
        .fill({ color: 0x3b2a1e, alpha: 0.72 })
        .circle(prop.x, prop.y, 18)
        .fill({ color: 0xff8c3b, alpha: 0.82 });
      continue;
    }
    const isSE = prop.tex.includes("straight-se");
    const dir = isSE ? !prop.flip : prop.flip;
    const slope = dir ? -0.5 : 0.5;
    const hw = prop.tex.includes("gate") ? 130 : 68;
    enclosureOutline
      .moveTo(prop.x - hw, prop.y - slope * hw)
      .lineTo(prop.x + hw, prop.y + slope * hw)
      .stroke({ color: 0x6d5846, width: 8, alpha: 0.65, cap: "round" });
  }
  const gateGraphic = new Graphics();
  gateGraphic.zIndex = 12;
  stage1.addChild(enclosureOutline, gateGraphic);

  // Stage 2: Frozen Frontier 46-sprite kit, ground-plane decals, strip shade & upright props
  const stage2 = new Container();
  stage2.zIndex = 2;
  stage2.sortableChildren = true;
  if (hasTextures) {
    stage2.addChild(env.frontier.ground, env.frontier.shade, env.frontier.upright);
  } else {
    const frontierVector = new Graphics();
    frontierVector.zIndex = 6;
    for (const fp of env.frontierProps) {
      const lift = env.liftAt(fp.x, fp.y) + fp.lift;
      const py = fp.y - lift;
      if (fp.asset.includes("pine")) {
        const r = Math.max(22, fp.w * 0.22);
        const h = Math.max(54, fp.h * 0.48);
        frontierVector
          .poly([fp.x, py - h, fp.x + r, py - 10, fp.x - r, py - 10])
          .fill({ color: 0x25423b, alpha: 0.88 })
          .poly([
            fp.x,
            py - h * 0.92,
            fp.x + r * 0.72,
            py - h * 0.42,
            fp.x - r * 0.72,
            py - h * 0.42,
          ])
          .fill({ color: 0xdbe7f2, alpha: 0.75 });
      } else if (fp.layer === "ground") {
        frontierVector
          .ellipse(
            fp.x,
            py,
            Math.max(18, fp.w * 0.25),
            Math.max(10, fp.h * 0.18),
          )
          .fill({ color: 0x6f7c8a, alpha: 0.34 });
      } else {
        const rw = Math.max(20, fp.w * 0.26);
        const rh = Math.max(22, fp.h * 0.28);
        frontierVector
          .roundRect(fp.x - rw * 0.5, py - rh, rw, rh, 4)
          .fill({ color: 0x6c7a89, alpha: 0.78 })
          .stroke({ color: 0xd8e4f0, width: 2, alpha: 0.55 });
      }
    }
    stage2.addChild(env.frontier.shade, frontierVector);
  }

  // Stage 3: Terrain relief hills (east-ridge 3m, west-terrace 1.5m), plateaus & ramps
  const stage3 = new Container();
  stage3.zIndex = 3;
  stage3.sortableChildren = true;
  for (const node of env.relief.nodes) {
    stage3.addChild(node.container);
  }
  const sceneryRelief = new Graphics();
  sceneryRelief.zIndex = 8;
  for (const f of env.reliefFeatures) {
    if (f.visual !== "scenery") continue;
    const top = mapToCourt(f.u0, f.v0);
    const right = mapToCourt(f.u1, f.v0);
    const bottom = mapToCourt(f.u1, f.v1);
    const left = mapToCourt(f.u0, f.v1);
    const lift = topOf(f, env.reliefFeatures) * PX_PER_METER;
    sceneryRelief
      .poly([
        left.x,
        left.y - lift,
        bottom.x,
        bottom.y - lift,
        bottom.x,
        bottom.y,
        left.x,
        left.y,
      ])
      .fill({ color: 0x5c6978, alpha: 0.82 })
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
      .fill({ color: 0x45515f, alpha: 0.88 })
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
      .fill({ color: 0xdce6f2, alpha: 0.86 })
      .stroke({ color: 0x8fb3d4, width: 2, alpha: 0.65 });
  }
  stage3.addChild(sceneryRelief);

  // Stage 4: Authored EnvironmentCatalog & collision footprint columns
  const stage4 = new Container();
  stage4.zIndex = 4;
  const authoredOverlay = new Graphics();
  for (let i = 0; i < env.authored.columns.length; i += 3) {
    const [cx, y0, y1] = env.authored.columns[i]!;
    authoredOverlay
      .moveTo(cx, y0)
      .lineTo(cx, y1)
      .stroke({ color: 0xa4d68f, width: 2, alpha: 0.28 });
  }
  stage4.addChild(
    env.authored.authoredGround,
    authoredOverlay,
    env.authored.gatheringStage,
  );

  // Stage 5: Daylight cycle, 16 flickering torches, projected sun shadows, actor silhouette occlusion
  const stage5 = new Container();
  stage5.zIndex = 5;
  stage5.sortableChildren = true;
  const shadowGraphic = new Graphics();
  shadowGraphic.zIndex = 3.5;
  const torchesWrap = new Container();
  torchesWrap.zIndex = 18;
  for (const tNode of env.torches.nodes) {
    torchesWrap.addChild(tNode.container);
  }
  const occlusionGraphic = new Graphics();
  occlusionGraphic.zIndex = 24;
  const ambientGraphic = new Graphics();
  ambientGraphic.zIndex = 30;
  stage5.addChild(
    shadowGraphic,
    env.torches.lightingContainer,
    torchesWrap,
    occlusionGraphic,
    ambientGraphic,
  );

  envStage.addChild(stage1, stage2, stage3, stage4, stage5);
  root.addChild(envStage);

  const mounted: MountedEnvState = {
    env,
    stage1,
    stage2,
    stage3,
    stage4,
    stage5,
    gateGraphic,
    shadowGraphic,
    occlusionGraphic,
    ambientGraphic,
  };
  mountedEnvStates.set(root, mounted);
  mountedEnvStates.set(envStage, mounted);
  rootEnvironments.set(root, env);
  rootEnvironments.set(envStage, env);

  syncSceneEnvironment(root, scene.playback?.time ?? 0, options);
  return env;
}

export function syncSceneEnvironment(
  root: Container,
  timeSec = 0,
  options: SceneGroundOptions = {},
): EnvironmentRuntimeMetrics {
  const mounted = findMountedState(root);
  const env = mounted?.env ?? getSceneEnvironment(root);
  const nowMs = resolveDaylightMs(options.daylightPhase, timeSec);
  const gateOpen = Boolean(options.gateOpen);
  const actorX = GATE_DOOR_CONFIG.x;
  const actorY = gateOpen ? GATE_DOOR_CONFIG.y : 740;

  env.step(0.05, {
    nowMs,
    actor: { x: actorX, y: actorY, lift: 0, heightPx: 88 },
  });

  if (mounted) {
    mounted.stage1.visible = options.stage1 !== false;
    mounted.stage2.visible = options.stage2 !== false;
    mounted.stage3.visible = options.stage3 !== false;
    mounted.stage4.visible = options.stage4 !== false;
    mounted.stage5.visible = options.stage5 !== false;

    drawGateDoorGraphic(
      mounted.gateGraphic,
      env.gateDoor.open || gateOpen,
      gateOpen ? 1 : env.gateDoor.progress,
    );
    drawProjectedShadowsGraphic(mounted.shadowGraphic, env);
    drawActorOcclusionGraphic(
      mounted.occlusionGraphic,
      env,
      options.actorPreview !== false,
    );

    mounted.ambientGraphic.clear();
    const darkness = Math.max(0, (env.daylight.lightScale - 0.18) * 0.42);
    if (darkness > 0.01) {
      mounted.ambientGraphic
        .roundRect(-620, -320, 2400, 1480, 64)
        .fill({ color: env.daylight.tintHex, alpha: darkness });
    }
  }

  return env.metrics();
}

export function getSceneEnvironment(
  root: Container,
  scene?: Scene,
): EnvironmentRuntime {
  const mounted = findMountedState(root);
  if (mounted) return mounted.env;
  let env = rootEnvironments.get(root);
  if (!env) {
    env = createEnvironmentRuntime(
      scene ? { environmentMap: sceneToEnvironmentMap(scene) } : {},
    );
    rootEnvironments.set(root, env);
  }
  return env;
}

export function sceneEnvironmentMetrics(
  root: Container,
  scene?: Scene,
  timeSec?: number,
  options?: SceneGroundOptions,
): EnvironmentRuntimeMetrics {
  const mounted = findMountedState(root);
  if (mounted) {
    return syncSceneEnvironment(root, timeSec ?? 0, options);
  }
  const env = getSceneEnvironment(root, scene);
  if (typeof timeSec === "number") {
    env.step(0, { nowMs: resolveDaylightMs(options?.daylightPhase, timeSec) });
  }
  return env.metrics();
}
