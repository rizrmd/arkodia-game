import { Container, Graphics, Matrix, Sprite, Texture } from "pixi.js";
import {
  STRONGHOLD_ORIGIN,
  courtToMap,
  courtToScenePercent,
  mapToCourt,
  scenePercentToCourt,
  type FootprintColumn,
} from "./environment-map";
import {
  groundPlaneMatrix,
  rectColumns,
  scaleAndFlipFootprint,
  type FrontierRect,
} from "./frontier";
import {
  WORLD,
  assetName,
  type Instance,
  type Part,
  type Scene,
} from "./scene";

export type EnvironmentAssetComponent = {
  id?: string;
  src: string;
  du: number;
  dv: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  shear?: number;
  flip?: boolean;
  zBoost?: number;
  ground?: readonly number[];
};

export type EnvironmentCatalogAsset = {
  id: string;
  label: string;
  category: string;
  layer: "ground" | "upright" | "spawn";
  src?: string;
  world?: readonly [w: number, h: number];
  pivot?: readonly [ax: number, ay: number];
  shear?: number;
  band?: number;
  footprint: readonly FrontierRect[];
  ground?: readonly number[];
  components?: readonly EnvironmentAssetComponent[];
};

export type EnvironmentCatalog = {
  schema: 1;
  tilePx: { w: number; h: number };
  assets: EnvironmentCatalogAsset[];
};

export type EnvironmentMapObject = {
  id: string;
  asset: string;
  u: number;
  v: number;
  s?: number;
  flip?: boolean;
  r?: number;
  count?: number;
  radius?: number;
  interval?: number;
};

export type EnvironmentMap = {
  schema: 1;
  revision: number;
  name: string;
  objects: EnvironmentMapObject[];
};

export type HarvestableTreeKind =
  | "pine-tall"
  | "pine-broad"
  | "pine-sapling"
  | "dead-tree"
  | "dead-snag"
  | "spruce-mature"
  | "fir-young";

const HARVESTABLE_TREE_KINDS: ReadonlySet<HarvestableTreeKind> = new Set([
  "pine-tall",
  "pine-broad",
  "pine-sapling",
  "dead-tree",
  "dead-snag",
  "spruce-mature",
  "fir-young",
]);

export function treeKind(assetId: string): HarvestableTreeKind | null {
  const normalized = assetId
    .replace(/^(frontier:|tree:|veg:|nature:)/, "")
    .replace(/\.(png|webp)$/, "");
  for (const kind of HARVESTABLE_TREE_KINDS) {
    if (normalized === kind || normalized.endsWith(`/${kind}`)) {
      return kind;
    }
  }
  return null;
}

export const DEFAULT_ENVIRONMENT_CATALOG: EnvironmentCatalog = {
  schema: 1,
  tilePx: { w: 128, h: 64 },
  assets: [
    {
      id: "ground:frozen-region-0--1",
      label: "Frozen Surface Region (0, -1)",
      category: "Ground",
      layer: "ground",
      src: "/modular-stronghold/v2/snow-soft-texture.png",
      world: [512, 256],
      pivot: [0.5, 0.5],
      band: -1,
      footprint: [],
    },
    {
      id: "ground:paving-warm",
      label: "Warm Court Paving",
      category: "Ground",
      layer: "ground",
      src: "/modular-stronghold/v2/paving-warm-texture.png",
      world: [256, 128],
      pivot: [0.5, 0.5],
      band: 0,
      footprint: [],
    },
    {
      id: "ground:paving-worn",
      label: "Worn Stone Flagstones",
      category: "Ground",
      layer: "ground",
      src: "/modular-stronghold/v2/paving-worn.png",
      world: [196, 103],
      pivot: [0.5, 0.5],
      band: 0,
      footprint: [],
    },
    {
      id: "frontier:pine-tall",
      label: "Tall Winter Pine",
      category: "Trees",
      layer: "upright",
      src: "/modular-stronghold/v2/spruce-mature.png",
      world: [126.36, 270.58],
      pivot: [0.5, 0.9587],
      footprint: [[-0.2, -0.2, 0.2, 0.2]],
      ground: [0.85, 0.9, 0.96, 0.98, 0.96, 0.9, 0.87],
    },
    {
      id: "frontier:pine-broad",
      label: "Broad Winter Spruce",
      category: "Trees",
      layer: "upright",
      src: "/modular-stronghold/v2/spruce-mature.png",
      world: [210.49, 197.75],
      pivot: [0.5, 0.9388],
      footprint: [[-0.3, -0.3, 0.3, 0.3]],
      ground: [0.77, 0.83, 0.94, 0.97, 0.94, 0.88, 0.76],
    },
    {
      id: "frontier:pine-sapling",
      label: "Young Fir Sapling",
      category: "Trees",
      layer: "upright",
      src: "/modular-stronghold/v2/fir-young.png",
      world: [39.13, 70.37],
      pivot: [0.5, 0.9482],
      footprint: [[-0.08, -0.08, 0.08, 0.08]],
      ground: [0.69, 0.76, 0.95, 0.98, 0.9, 0.79, 0.78],
    },
    {
      id: "frontier:dead-tree",
      label: "Dead Frost Tree",
      category: "Trees",
      layer: "upright",
      src: "/modular-stronghold/v2/fir-young.png",
      world: [169.29, 158.52],
      pivot: [0.5, 0.937],
      footprint: [[-0.18, -0.18, 0.18, 0.18]],
      ground: [0.65, 0.8, 0.93, 0.98, 0.95, 0.88, 0.86],
    },
    {
      id: "frontier:dead-snag",
      label: "Dead Snag",
      category: "Trees",
      layer: "upright",
      src: "/modular-stronghold/v2/fir-young.png",
      world: [76.77, 101.08],
      pivot: [0.4705, 0.9175],
      footprint: [[-0.12, -0.12, 0.12, 0.12]],
      ground: [0.85, 0.9, 0.97, 0.98, 0.96, 0.95, 0.92],
    },
    {
      id: "frontier:rock-boulders",
      label: "Snow Boulders",
      category: "Rocks",
      layer: "upright",
      src: "/modular-stronghold/v2/boulders-snow.png",
      world: [109.98, 46.96],
      pivot: [0.5, 0.7164],
      footprint: [[-0.25, -0.25, 0.25, 0.25]],
      ground: [0.83, 0.96, 0.93, 0.88, 0.93, 0.95, 0.87],
    },
    {
      id: "building:stronghold-bastion",
      label: "Stronghold Bastion Compound",
      category: "Buildings",
      layer: "upright",
      footprint: [
        [-0.9, -0.45, 0.9, 0.45],
        [-0.45, -0.9, 0.45, 0.9],
      ],
      components: [
        {
          id: "wall-left",
          src: "/buildings/starter-boundary/straight-ne-a.png",
          du: -0.45,
          dv: 0,
          w: 220,
          h: 220,
          ax: 0.5,
          ay: 0.793,
          flip: true,
        },
        {
          id: "wall-right",
          src: "/buildings/starter-boundary/straight-ne-b.png",
          du: 0,
          dv: -0.45,
          w: 220,
          h: 220,
          ax: 0.5,
          ay: 0.793,
          flip: false,
        },
        {
          id: "gate-front",
          src: "/buildings/starter-boundary/gate-closed.png",
          du: 0.25,
          dv: 0.25,
          w: 320,
          h: 266,
          ax: 0.5,
          ay: 0.855,
          zBoost: 12,
        },
      ],
    },
    {
      id: "spawn",
      label: "Enemy Spawn Marker",
      category: "Gameplay",
      layer: "spawn",
      footprint: [],
    },
  ],
};

export const DEFAULT_PUBLISHED_ENVIRONMENT_MAP: EnvironmentMap = {
  schema: 1,
  revision: 3,
  name: "Arkodia published environment",
  objects: [
    {
      id: "frozen-v1-surface-0--1",
      asset: "ground:frozen-region-0--1",
      u: 389.4921875,
      v: 452.5078125,
    },
    {
      id: "skeleton-gateway",
      asset: "spawn",
      u: 479,
      v: 479,
      count: 3,
      radius: 6,
      interval: 5,
    },
    {
      id: "skeleton-west",
      asset: "spawn",
      u: 442,
      v: 480,
      count: 3,
      radius: 9,
      interval: 8,
    },
    {
      id: "skeleton-north",
      asset: "spawn",
      u: 480,
      v: 440,
      count: 2,
      radius: 9,
      interval: 10,
    },
  ],
};

export function findCatalogAsset(
  catalog: EnvironmentCatalog,
  assetId: string,
): EnvironmentCatalogAsset | undefined {
  const exact = catalog.assets.find((a) => a.id === assetId);
  if (exact) return exact;
  const suffix = assetId.replace(/^(frontier:|building:|ground:)/, "");
  return catalog.assets.find(
    (a) => a.id === `frontier:${suffix}` || a.id.endsWith(`:${suffix}`),
  );
}

export function environmentObjectColumns(
  map: EnvironmentMap,
  catalog: EnvironmentCatalog = DEFAULT_ENVIRONMENT_CATALOG,
  options?: {
    skipHarvestableTrees?: boolean;
    origin?: { u: number; v: number };
  },
): FootprintColumn[] {
  const origin = options?.origin ?? STRONGHOLD_ORIGIN;
  const cols: FootprintColumn[] = [];
  for (const obj of map.objects) {
    if (options?.skipHarvestableTrees && treeKind(obj.asset) !== null) {
      continue;
    }
    const asset = findCatalogAsset(catalog, obj.asset);
    if (!asset || asset.footprint.length === 0) continue;
    const scale = obj.s ?? 1;
    const flip = Boolean(obj.flip);
    const rects = scaleAndFlipFootprint(asset.footprint, scale, flip);
    for (const r of rects) {
      cols.push(...rectColumns(obj.u, obj.v, r, origin));
    }
  }
  return cols;
}

export function environmentBlocked(
  x: number,
  y: number,
  columns: readonly FootprintColumn[],
): boolean {
  for (const [cx, y0, y1] of columns) {
    if (Math.abs(x - cx) <= 3 && y >= y0 && y <= y1) {
      return true;
    }
  }
  return false;
}

export function sceneToEnvironmentMap(
  scene: Scene,
  options?: {
    revision?: number;
    name?: string;
    origin?: { u: number; v: number };
  },
): EnvironmentMap {
  const origin = options?.origin ?? STRONGHOLD_ORIGIN;
  const base = { width: scene.world.width, height: scene.world.height };
  const objects: EnvironmentMapObject[] = scene.instances.map((inst) => {
    const court = scenePercentToCourt(inst.x, inst.y, base);
    const tile = courtToMap(court.x, court.y, origin);
    const s = Number(inst.scale.toFixed(3));
    const baseAsset = assetName(inst.asset).replace(/\.(png|webp)$/, "");
    return {
      id: inst.id,
      asset:
        inst.category === "Ground"
          ? `ground:${baseAsset}`
          : inst.category === "Spawns"
            ? "spawn"
            : `building:${baseAsset}`,
      u: Number(tile.u.toFixed(4)),
      v: Number(tile.v.toFixed(4)),
      ...(s !== 1 ? { s } : {}),
      ...(inst.rotation !== 0 ? { r: inst.rotation } : {}),
    };
  });

  return {
    schema: 1,
    revision: options?.revision ?? 1,
    name: options?.name ?? "Arkodia authored scene environment",
    objects,
  };
}

export function environmentMapToScene(
  map: EnvironmentMap,
  catalog: EnvironmentCatalog = DEFAULT_ENVIRONMENT_CATALOG,
  options?: {
    assetBaseUrl?: string;
    origin?: { u: number; v: number };
  },
): Scene {
  const origin = options?.origin ?? STRONGHOLD_ORIGIN;
  const assetBaseUrl = options?.assetBaseUrl ?? "https://arkodia.online";
  const toUrl = (src: string) =>
    /^https?:\/\//.test(src)
      ? src
      : `${assetBaseUrl.replace(/\/$/, "")}/${src.replace(/^\//, "")}`;

  const instances: Instance[] = [];

  for (const obj of map.objects) {
    if (obj.asset === "spawn") continue;
    const asset = findCatalogAsset(catalog, obj.asset);
    const court = mapToCourt(obj.u, obj.v, origin);
    const pct = courtToScenePercent(court.x, court.y, WORLD);
    const clampedX = Math.max(0, Math.min(100, Number(pct.x.toFixed(2))));
    const clampedY = Math.max(0, Math.min(100, Number(pct.y.toFixed(2))));
    const s = Math.max(0.1, Math.min(3, obj.s ?? 1));
    const primarySrc = toUrl(
      asset?.src ??
        asset?.components?.[0]?.src ??
        "/modular-stronghold/v2/snow-soft-texture.png",
    );

    const parts: Part[] =
      asset?.components && asset.components.length > 0
        ? asset.components.map((comp, idx) => ({
            id: comp.id ?? `${obj.id}-part-${idx}`,
            name: comp.id ?? `Part ${idx + 1}`,
            kind: "sprite" as const,
            asset: toUrl(comp.src),
            x: Number(((comp.du - comp.dv) * 64).toFixed(2)),
            y: Number(((comp.du + comp.dv) * 32).toFixed(2)),
            scale: 1,
            rotation: 0,
            color: "#ffffff",
            category: asset.category,
            presentation: {
              width: Math.max(1, Math.min(4096, comp.w)),
              anchorY: Math.max(0, Math.min(1, comp.ay)),
              footprint: [2, 2] as const,
              plane: asset.layer === "ground",
              layer: comp.zBoost ?? 0,
            },
          }))
        : [
            {
              id: `${obj.id}-main`,
              name: asset?.label ?? obj.asset,
              kind: "sprite" as const,
              asset: primarySrc,
              x: 0,
              y: 0,
              scale: 1,
              rotation: 0,
              color: "#ffffff",
              category: asset?.category ?? "Environment",
              presentation: {
                width: Math.max(1, Math.min(4096, asset?.world?.[0] ?? 180)),
                anchorY: Math.max(0, Math.min(1, asset?.pivot?.[1] ?? 0.85)),
                footprint: [2, 2] as const,
                plane: asset?.layer === "ground",
                layer: asset?.band ?? 0,
              },
            },
          ];

    instances.push({
      id: obj.id,
      name: asset?.label ?? obj.asset,
      asset: primarySrc,
      category: asset?.category ?? "Environment",
      x: clampedX,
      y: clampedY,
      scale: s,
      rotation: obj.r ?? 0,
      visible: true,
      definition: {
        id: asset?.id ?? obj.asset,
        name: asset?.label ?? obj.asset,
        parts,
      },
    });
  }

  return {
    schema: "arkodia.scene",
    version: 1,
    coordinateSystem: "percent-projected-world/pixel-local",
    world: { ...WORLD },
    playback: { playing: true, time: 0 },
    instances,
  };
}

export type AuthoredEnvironmentLayerResult = {
  authoredGround: Container;
  authoredStage: Container;
  gatheringStage: Container;
  spawnMarkers: Container;
  columns: FootprintColumn[];
  harvestedIds: Set<string>;
  harvestTree: (id: string) => boolean;
  restoreTree: (id: string) => boolean;
};

export function createAuthoredEnvironmentLayer(
  map: EnvironmentMap = DEFAULT_PUBLISHED_ENVIRONMENT_MAP,
  catalog: EnvironmentCatalog = DEFAULT_ENVIRONMENT_CATALOG,
  textures: Record<string, Texture | undefined> = {},
  options?: {
    liftAt?: (x: number, y: number) => number;
    enableGatheringStage?: boolean;
    showSpawnMarkers?: boolean;
    origin?: { u: number; v: number };
  },
): AuthoredEnvironmentLayerResult {
  const origin = options?.origin ?? STRONGHOLD_ORIGIN;
  const liftAt = options?.liftAt ?? (() => 0);
  const enableGatheringStage = options?.enableGatheringStage ?? true;

  const authoredGround = new Container();
  authoredGround.sortableChildren = true;
  authoredGround.zIndex = 9.9;

  const authoredStage = new Container();
  authoredStage.sortableChildren = true;
  authoredStage.zIndex = 10.65;

  const gatheringStage = new Container();
  gatheringStage.sortableChildren = true;
  gatheringStage.zIndex = 10.67;

  const spawnMarkers = new Container();
  spawnMarkers.zIndex = 9.95;
  spawnMarkers.visible = Boolean(options?.showSpawnMarkers);

  const treeSprites = new Map<string, Container>();
  const harvestedIds = new Set<string>();

  const resolveTex = (src?: string): Texture => {
    if (!src) return Texture.WHITE;
    return (
      textures[src] ??
      textures["/modular-stronghold/v2/snow-soft-texture.png"] ??
      Texture.WHITE
    );
  };

  for (const obj of map.objects) {
    const pos = mapToCourt(obj.u, obj.v, origin);
    const lift = liftAt(pos.x, pos.y);
    const drawY = pos.y - lift;
    const scale = obj.s ?? 1;
    const flip = Boolean(obj.flip);

    if (obj.asset === "spawn") {
      const marker = new Graphics();
      const radiusPx = (obj.radius ?? 6) * 24;
      marker
        .ellipse(pos.x, drawY, radiusPx, radiusPx * 0.5)
        .stroke({ color: 0xe05a47, width: 2, alpha: 0.45 })
        .circle(pos.x, drawY, 6)
        .fill({ color: 0xe05a47, alpha: 0.75 });
      spawnMarkers.addChild(marker);
      continue;
    }

    const asset = findCatalogAsset(catalog, obj.asset);
    if (!asset) continue;

    if (asset.layer === "ground") {
      const tex = resolveTex(asset.src);
      const sprite = new Sprite(tex);
      const w = (asset.world?.[0] ?? 256) * scale;
      const h = (asset.world?.[1] ?? 128) * scale;
      const sx = (w / Math.max(1, tex.width)) * (flip ? -1 : 1);
      const sy = h / Math.max(1, tex.height);
      sprite.anchor.set(asset.pivot?.[0] ?? 0.5, asset.pivot?.[1] ?? 0.5);
      sprite.position.set(pos.x, drawY);
      sprite.scale.set(sx, sy);
      sprite.zIndex = asset.band ?? 0;
      if (obj.r !== undefined) {
        sprite.setFromMatrix(
          groundPlaneMatrix(sx, sy, obj.r, pos.x, drawY),
        );
      }
      authoredGround.addChild(sprite);
      continue;
    }

    const harvestKind = treeKind(obj.asset);
    const targetStage =
      enableGatheringStage && harvestKind !== null
        ? gatheringStage
        : authoredStage;

    const group = new Container();
    group.sortableChildren = true;
    group.zIndex = pos.y;

    if (asset.components && asset.components.length > 0) {
      for (const comp of asset.components) {
        const compU = obj.u + (flip ? comp.dv : comp.du) * scale;
        const compV = obj.v + (flip ? comp.du : comp.dv) * scale;
        const compPos = mapToCourt(compU, compV, origin);
        const compLift = liftAt(compPos.x, compPos.y);
        const compY = compPos.y - compLift;
        const tex = resolveTex(comp.src);
        const sprite = new Sprite(tex);
        const compFlip = flip ? !comp.flip : Boolean(comp.flip);
        const w = comp.w * scale;
        const h = comp.h * scale;
        const sx = (w / Math.max(1, tex.width)) * (compFlip ? -1 : 1);
        const sy = h / Math.max(1, tex.height);
        sprite.anchor.set(comp.ax, comp.ay);
        sprite.position.set(compPos.x, compY);
        sprite.scale.set(sx, sy);
        if (comp.shear) {
          sprite.setFromMatrix(
            new Matrix(sx, comp.shear * sx, 0, sy, compPos.x, compY),
          );
        }
        sprite.zIndex = compPos.y + (comp.zBoost ?? 0);
        group.addChild(sprite);
      }
    } else {
      const tex = resolveTex(asset.src);
      const sprite = new Sprite(tex);
      const w = (asset.world?.[0] ?? 128) * scale;
      const h = (asset.world?.[1] ?? 128) * scale;
      const sx = (w / Math.max(1, tex.width)) * (flip ? -1 : 1);
      const sy = h / Math.max(1, tex.height);
      sprite.anchor.set(asset.pivot?.[0] ?? 0.5, asset.pivot?.[1] ?? 0.9);
      sprite.position.set(pos.x, drawY);
      sprite.scale.set(sx, sy);
      if (asset.shear) {
        sprite.setFromMatrix(
          new Matrix(sx, asset.shear * sx, 0, sy, pos.x, drawY),
        );
      }
      group.addChild(sprite);
    }

    targetStage.addChild(group);
    if (harvestKind !== null) {
      treeSprites.set(obj.id, group);
    }
  }

  const columns = environmentObjectColumns(map, catalog, {
    skipHarvestableTrees: false,
    origin,
  });

  const harvestTree = (id: string): boolean => {
    const node = treeSprites.get(id);
    if (!node || harvestedIds.has(id)) return false;
    harvestedIds.add(id);
    node.visible = false;
    return true;
  };

  const restoreTree = (id: string): boolean => {
    const node = treeSprites.get(id);
    if (!node || !harvestedIds.has(id)) return false;
    harvestedIds.delete(id);
    node.visible = true;
    return true;
  };

  return {
    authoredGround,
    authoredStage,
    gatheringStage,
    spawnMarkers,
    columns,
    harvestedIds,
    harvestTree,
    restoreTree,
  };
}
