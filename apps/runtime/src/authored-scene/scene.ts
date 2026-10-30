// Canonical authored-scene presentation contract, shared by game and editor.
export type Animation = {
  fps: number;
  loop: boolean;
  frames: { x: number; y: number; width: number; height: number }[];
};
export type Profile = {
  width: number;
  anchorY: number;
  footprint: readonly [number, number];
  plane: boolean;
  layer: number;
};
export type Part = {
  id: string;
  name: string;
  kind: "sprite" | "pillar";
  asset: string;
  sha256?: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: string;
  category?: string;
  animation?: Animation;
  pivot?: { x: number; y: number };
  presentation?: Profile;
};
export type Instance = {
  id: string;
  name: string;
  asset: string;
  category: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  visible: boolean;
  pivot?: { x: number; y: number };
  definition: { id: string; name: string; parts: Part[] };
};
export type Scene = {
  schema: "arkodia.scene";
  version: 1;
  coordinateSystem: "percent-projected-world/pixel-local";
  world: { width: number; height: number; rotation: 0; projection: "2:1" };
  playback?: { playing: boolean; time: number };
  instances: Instance[];
};
export const WORLD = {
  width: 1000,
  height: 700,
  rotation: 0 as const,
  projection: "2:1" as const,
};
export const assetName = (asset: string) =>
  asset.split(/[?#]/)[0].split("/").at(-1) ?? asset;
export function placementProfile(o: {
  asset: string;
  category: string;
}): Profile {
  const asset = assetName(o.asset);
  if (o.category === "Ground" || o.category === "Water")
    return {
      width: 132,
      anchorY: 0.5,
      footprint: [6, 6],
      plane: true,
      layer: -10000,
    };
  if (o.category === "Spawns")
    return {
      width: 44,
      anchorY: 0.5,
      footprint: [2, 2],
      plane: true,
      layer: -1000,
    };
  if (asset === "brazier.png")
    return {
      width: 90,
      anchorY: 0.9,
      footprint: [4, 2],
      plane: false,
      layer: 0,
    };
  if (asset === "spruce-mature.png")
    return {
      width: 180,
      anchorY: 0.97,
      footprint: [3, 2],
      plane: false,
      layer: 0,
    };
  if (asset === "cliff-snow.png")
    return {
      width: 320,
      anchorY: 0.97,
      footprint: [6, 3],
      plane: false,
      layer: 0,
    };
  const footprints: Record<string, readonly [number, number]> = {
    "gateway-grand.png": [5, 4],
    "wall-broken.png": [4, 1],
    "bastion.png": [2, 2],
    "core.png": [3, 3],
    "forge.png": [3, 3],
    "barracks.png": [4, 3],
    "gate-sheet.png": [5, 2],
  };
  return {
    width: 180,
    anchorY: asset === "gate-sheet.png" ? 0.97 : 0.8,
    footprint: footprints[asset] ?? [2, 2],
    plane: false,
    layer: 0,
  };
}
// Same 2:1 projection as Stronghold court (64,32), at a 1/4 footprint grid density.
export function groundPoint(
  u: number,
  v: number,
  width: number,
  depth: number,
) {
  return [
    (u - width / 2 - (v - depth / 2)) * 16,
    (u - width / 2 + (v - depth / 2)) * 8,
  ];
}
export function viewBox(width: number, height: number, world = WORLD) {
  const scale = Math.min(width / world.width, height / world.height);
  return {
    scale,
    x: (width - world.width * scale) / 2,
    y: (height - world.height * scale) / 2,
    width: world.width * scale,
    height: world.height * scale,
  };
}
export function contentRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const b = viewBox(rect.width, rect.height);
  return {
    left: rect.left + b.x,
    top: rect.top + b.y,
    width: b.width,
    height: b.height,
  };
}
export function frameAt(time: number, clip: Animation) {
  const n = Math.max(0, Math.floor(time * clip.fps));
  return clip.loop
    ? n % clip.frames.length
    : Math.min(clip.frames.length - 1, n);
}
// This is also the native Stronghold prop transform, including its nonuniform/sheared artwork.
export function propMatrix(
  p: {
    width: number;
    foot: number;
    vertical: number;
    shear: number;
    x: number;
    y: number;
  },
  textureWidth: number,
) {
  const s = p.width / textureWidth;
  return { a: s, b: s * p.shear, c: 0, d: s * p.vertical, tx: p.x, ty: p.y };
}
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const requireValue = (v: unknown, message: string) => {
  if (!v) throw Error(message);
};
export function parseScene(input: unknown): Scene {
  const scene = ((input as { scene?: unknown })?.scene ?? input) as Scene;
  requireValue(
    scene?.schema === "arkodia.scene" &&
      scene.version === 1 &&
      scene.coordinateSystem === "percent-projected-world/pixel-local",
    "Unsupported authored scene",
  );
  requireValue(
    scene.world?.width === WORLD.width &&
      scene.world.height === WORLD.height &&
      scene.world.rotation === 0 &&
      scene.world.projection === "2:1",
    "Unsupported world projection",
  );
  requireValue(
    Array.isArray(scene.instances) && scene.instances.length <= 1000,
    "Invalid scene instances",
  );
  if (scene.playback)
    requireValue(
      typeof scene.playback.playing === "boolean" &&
        finite(scene.playback.time) &&
        scene.playback.time >= 0,
      "Invalid scene playback",
    );
  const ids = new Set<string>();
  const point = (p: { x: number; y: number } | undefined) =>
    !p || (finite(p.x) && finite(p.y));
  for (const o of scene.instances) {
    requireValue(
      o &&
        typeof o.id === "string" &&
        o.id.length > 0 &&
        !ids.has(o.id) &&
        typeof o.name === "string" &&
        typeof o.category === "string" &&
        typeof o.visible === "boolean",
      "Invalid scene identity",
    );
    ids.add(o.id);
    requireValue(
      [o.x, o.y, o.scale, o.rotation].every(finite) &&
        o.x >= 0 &&
        o.x <= 100 &&
        o.y >= 0 &&
        o.y <= 100 &&
        o.scale >= 0.1 &&
        o.scale <= 3 &&
        point(o.pivot),
      "Invalid scene transform",
    );
    requireValue(
      o.definition &&
        Array.isArray(o.definition.parts) &&
        o.definition.parts.length <= 200,
      "Invalid scene components",
    );
    const parts = new Set<string>();
    for (const p of o.definition.parts) {
      requireValue(
        p &&
          !parts.has(p.id) &&
          typeof p.id === "string" &&
          ["sprite", "pillar"].includes(p.kind) &&
          [p.x, p.y, p.scale, p.rotation].every(finite) &&
          p.scale >= 0.1 &&
          p.scale <= 5 &&
          /^#[0-9a-f]{6}$/i.test(p.color) &&
          point(p.pivot),
        "Invalid scene component",
      );
      parts.add(p.id);
      if (p.kind === "sprite")
        requireValue(
          typeof p.asset === "string" &&
            /^https?:\/\//.test(p.asset) &&
            (!p.sha256 || /^[a-f0-9]{64}$/.test(p.sha256)),
          "Invalid scene texture",
        );
      if (p.presentation) {
        const v = p.presentation;
        requireValue(
          [v.width, v.anchorY, v.layer, ...v.footprint].every(finite) &&
            v.width > 0 &&
            v.width <= 4096 &&
            v.anchorY >= 0 &&
            v.anchorY <= 1 &&
            v.footprint.every((n) => n > 0 && n <= 100) &&
            typeof v.plane === "boolean",
          "Invalid presentation",
        );
      }
      if (p.animation) {
        const a = p.animation;
        requireValue(
          finite(a.fps) &&
            a.fps > 0 &&
            a.fps <= 120 &&
            typeof a.loop === "boolean" &&
            Array.isArray(a.frames) &&
            a.frames.length > 0 &&
            a.frames.length <= 256,
          "Invalid animation",
        );
        for (const f of a.frames)
          requireValue(
            [f.x, f.y, f.width, f.height].every(finite) &&
              f.x >= 0 &&
              f.y >= 0 &&
              f.width > 0 &&
              f.height > 0 &&
              f.width === a.frames[0].width &&
              f.height === a.frames[0].height,
            "Invalid animation frame",
          );
      }
    }
  }
  return scene;
}
