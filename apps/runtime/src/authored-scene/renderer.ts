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
  createEnvironmentRuntime,
  sceneToEnvironmentMap,
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
const rootEnvironments = new WeakMap<Container, EnvironmentRuntime>();

export function sceneGround(root: Container, scene: Scene): EnvironmentRuntime {
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

  const env = createEnvironmentRuntime({
    environmentMap: sceneToEnvironmentMap(scene),
  });
  if (scene.playback?.time !== undefined) {
    env.step(scene.playback.time);
  }
  rootEnvironments.set(root, env);
  return env;
}

export function getSceneEnvironment(
  root: Container,
  scene?: Scene,
): EnvironmentRuntime {
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
): EnvironmentRuntimeMetrics {
  const env = getSceneEnvironment(root, scene);
  if (typeof timeSec === "number") {
    env.step(0, { nowMs: 132_000 + timeSec * 1000 });
  }
  return env.metrics();
}
