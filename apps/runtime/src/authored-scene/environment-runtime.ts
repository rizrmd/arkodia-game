import { Container, Texture } from "pixi.js";
import {
  DAY_MS,
  DEFAULT_TORCH_LIGHTS,
  computeActorOcclusion,
  createBiomeParallax,
  createProjectedShadowLayer,
  createTorchLayer,
  daylightAt,
  evaluateLightmapAt,
  strongholdAndFrontierOccluders,
  sunAt,
  type ActorOcclusionState,
  type BiomeParallaxLayerResult,
  type DaylightState,
  type OccluderCandidate,
  type ProjectedShadowLayerResult,
  type SunVector,
  type TorchLayerResult,
  type TorchLightSpec,
} from "./atmosphere";
import {
  DEFAULT_ENVIRONMENT_CATALOG,
  DEFAULT_PUBLISHED_ENVIRONMENT_MAP,
  createAuthoredEnvironmentLayer,
  type AuthoredEnvironmentLayerResult,
  type EnvironmentCatalog,
  type EnvironmentMap,
} from "./environment-catalog";
import {
  COURT,
  COURT_CENTER,
  DEFAULT_WORLD_MAP,
  ISO,
  STRONGHOLD_ORIGIN,
  campfireColumns,
  campfireProp,
  createCourtSurface,
  createGateDoorState,
  createInfiniteSnow,
  createPropFoundation,
  palisadeColumns,
  starterEnclosureProps,
  stepGateDoor,
  type ArkodiaWorldMap,
  type CourtSurfaceResult,
  type FootprintColumn,
  type GateDoorState,
  type InfiniteSnowState,
  type ReliefFeature,
  type StrongholdPropDef,
} from "./environment-map";
import {
  FRONTIER_PROPS,
  buildFrontierColumns,
  createFrontierLayer,
  type FrontierLayerResult,
  type FrontierProp,
} from "./frontier";
import {
  DEFAULT_RELIEF_FEATURES,
  cliff,
  createReliefLayer,
  heightAt,
  liftAt,
  normalizeReliefFeatures,
  recoverReliefPosition,
  reliefBlocked,
  type ReliefLayerResult,
} from "./relief";

export type EnvironmentRuntimeOptions = {
  textures?: Record<string, Texture | undefined>;
  worldMap?: ArkodiaWorldMap;
  frontierProps?: readonly FrontierProp[];
  reliefFeatures?: readonly ReliefFeature[];
  environmentMap?: EnvironmentMap;
  environmentCatalog?: EnvironmentCatalog;
  torches?: readonly TorchLightSpec[];
  strongholdProps?: readonly StrongholdPropDef[];
  initialTimeMs?: number;
  includeCampfireInStrongholdProps?: boolean;
};

export type EnvironmentRuntimeMetrics = {
  stage1: {
    mapId: string;
    sizeTiles: number;
    metersPerTile: number;
    chunkTiles: number;
    iso: { halfWidth: number; halfHeight: number };
    court: { x: number; y: number; size: number };
    strongholdOrigin: { u: number; v: number };
    snowDensity: number;
    foundationCount: number;
    gateDoor: GateDoorState;
  };
  stage2: {
    frontierPropCount: number;
    frontierVisibleCount: number;
    frontierColumnCount: number;
  };
  stage3: {
    reliefFeatureCount: number;
    reliefIds: string[];
    eastRidgeTopM: number;
    westTerraceTopM: number;
    templePodiumTopM: number;
  };
  stage4: {
    environmentMapName: string;
    environmentObjectCount: number;
    catalogAssetCount: number;
    authoredColumnCount: number;
    harvestedTreeCount: number;
  };
  stage5: {
    daylight: DaylightState;
    sun: SunVector;
    torchCount: number;
    shadowCount: number;
    actorOcclusion: ActorOcclusionState;
  };
};

export type EnvironmentRuntime = {
  worldMap: ArkodiaWorldMap;
  snow: InfiniteSnowState;
  frontier: FrontierLayerResult;
  frontierProps: FrontierProp[];
  frontierColumns: FootprintColumn[];
  courtSurface: CourtSurfaceResult;
  foundations: {
    under: Container;
    face: Container;
    count: number;
  };
  shadows: ProjectedShadowLayerResult;
  relief: ReliefLayerResult;
  reliefFeatures: ReliefFeature[];
  authored: AuthoredEnvironmentLayerResult;
  torches: TorchLayerResult;
  biomeParallax: BiomeParallaxLayerResult;
  occluders: OccluderCandidate[];
  strongholdProps: StrongholdPropDef[];
  strongholdColumns: FootprintColumn[];
  gateDoor: GateDoorState;
  daylight: DaylightState;
  sun: SunVector;
  actorOcclusion: ActorOcclusionState;
  heightAt: (x: number, y: number) => number;
  liftAt: (x: number, y: number) => number;
  cliff: (x0: number, y0: number, x1: number, y1: number) => boolean;
  reliefBlocked: (x: number, y: number) => boolean;
  recoverPosition: (x: number, y: number) => { x: number; y: number };
  evaluateLightmapAt: (
    x: number,
    y: number,
  ) => { r: number; g: number; b: number; hex: number; warmBoost: number };
  step: (
    dtSec: number,
    state?: {
      nowMs?: number;
      actor?: { x: number; y: number; lift?: number; heightPx?: number };
      camera?: {
        viewX: number;
        viewY: number;
        viewWidth: number;
        viewHeight: number;
        camX?: number;
        camY?: number;
        screenWidth?: number;
        screenHeight?: number;
      };
    },
  ) => void;
  metrics: () => EnvironmentRuntimeMetrics;
};

export function createEnvironmentRuntime(
  options: EnvironmentRuntimeOptions = {},
): EnvironmentRuntime {
  const textures = options.textures ?? {};
  const worldMap = options.worldMap ?? DEFAULT_WORLD_MAP;
  const reliefFeatures = normalizeReliefFeatures(
    options.reliefFeatures ?? DEFAULT_RELIEF_FEATURES,
  );
  const frontierProps = [...(options.frontierProps ?? FRONTIER_PROPS)];
  const frontierColumns = buildFrontierColumns(frontierProps);

  const includeCampfire = options.includeCampfireInStrongholdProps ?? true;
  const strongholdProps = options.strongholdProps
    ? [...options.strongholdProps]
    : [
        ...starterEnclosureProps(),
        ...(includeCampfire ? [campfireProp()] : []),
      ];

  const strongholdColumns: FootprintColumn[] = [
    ...campfireColumns(COURT_CENTER.x, COURT_CENTER.y),
  ];
  for (const prop of strongholdProps) {
    if (prop.id === "campfire") continue;
    strongholdColumns.push(...palisadeColumns(prop));
  }

  const snowTex =
    textures["/modular-stronghold/v2/snow-soft-texture.png"] ?? Texture.WHITE;
  const pavingTex =
    textures["/modular-stronghold/v2/paving-warm-texture.png"] ?? Texture.WHITE;

  const snow = createInfiniteSnow(snowTex);
  const courtSurface = createCourtSurface(pavingTex);

  const reliefLiftFn = (x: number, y: number) => liftAt(x, y, reliefFeatures);
  const frontier = createFrontierLayer(frontierProps, textures, {
    liftAt: reliefLiftFn,
  });
  const relief = createReliefLayer(textures, reliefFeatures);

  const foundationsUnder = new Container();
  foundationsUnder.zIndex = 3;
  const foundationsFace = new Container();
  foundationsFace.sortableChildren = true;
  foundationsFace.zIndex = 10.6;
  let foundationCount = 0;

  for (const prop of strongholdProps) {
    const f = createPropFoundation({
      id: prop.id,
      x: prop.x,
      y: prop.y,
      w: prop.w,
      h: prop.h,
      ax: prop.ax,
      ay: prop.ay,
      flip: prop.flip,
      kind:
        prop.id === "campfire"
          ? "campfire"
          : prop.tex.includes("gate")
            ? "gate"
            : prop.tex.includes("straight-se")
              ? "wall-se"
              : "wall-ne",
    });
    f.face.zIndex = prop.y + 0.25;
    foundationsUnder.addChild(f.under);
    foundationsFace.addChild(f.face);
    foundationCount++;
  }

  const shadows = createProjectedShadowLayer(strongholdProps, textures);

  const envMap = options.environmentMap ?? DEFAULT_PUBLISHED_ENVIRONMENT_MAP;
  const envCatalog = options.environmentCatalog ?? DEFAULT_ENVIRONMENT_CATALOG;
  const authored = createAuthoredEnvironmentLayer(
    envMap,
    envCatalog,
    textures,
    { liftAt: reliefLiftFn },
  );

  const torchSpecs = options.torches ?? DEFAULT_TORCH_LIGHTS;
  const torches = createTorchLayer(torchSpecs, textures, COURT_CENTER);
  const biomeParallax = createBiomeParallax(textures);

  const occluders = strongholdAndFrontierOccluders(
    strongholdProps,
    frontierProps,
  );

  let elapsedMs = options.initialTimeMs ?? DAY_MS * 0.22;
  let elapsedSec = 0;
  let daylight = daylightAt(elapsedMs);
  let sun = sunAt(elapsedMs);
  let gateDoor = createGateDoorState(false);
  let actorOcclusion: ActorOcclusionState = {
    occluded: false,
    occluderIds: [],
    cutoutAlpha: 0,
    residualAlpha: 1,
  };
  let cullStats = frontier.cull(-1024, -512, 3200, 2048);

  torches.step(0, daylight);
  shadows.sync(sun);

  const runtime: EnvironmentRuntime = {
    worldMap,
    snow,
    frontier,
    frontierProps,
    frontierColumns,
    courtSurface,
    foundations: {
      under: foundationsUnder,
      face: foundationsFace,
      count: foundationCount,
    },
    shadows,
    relief,
    reliefFeatures,
    authored,
    torches,
    biomeParallax,
    occluders,
    strongholdProps,
    strongholdColumns,
    get gateDoor() {
      return gateDoor;
    },
    get daylight() {
      return daylight;
    },
    get sun() {
      return sun;
    },
    get actorOcclusion() {
      return actorOcclusion;
    },
    heightAt: (x: number, y: number) => heightAt(x, y, reliefFeatures),
    liftAt: reliefLiftFn,
    cliff: (x0: number, y0: number, x1: number, y1: number) =>
      cliff(x0, y0, x1, y1, reliefFeatures),
    reliefBlocked: (x: number, y: number) =>
      reliefBlocked(x, y, reliefFeatures),
    recoverPosition: (x: number, y: number) =>
      recoverReliefPosition(x, y, reliefFeatures),
    evaluateLightmapAt: (x: number, y: number) =>
      evaluateLightmapAt(x, y, daylight, torchSpecs, COURT_CENTER),
    step: (dtSec, state) => {
      elapsedSec += Math.max(0, dtSec);
      if (typeof state?.nowMs === "number") {
        elapsedMs = state.nowMs;
      } else {
        elapsedMs += Math.max(0, dtSec) * 1000;
      }
      daylight = daylightAt(elapsedMs);
      sun = sunAt(elapsedMs);
      shadows.sync(sun);
      torches.step(elapsedSec, daylight);

      if (state?.actor) {
        gateDoor = stepGateDoor(
          gateDoor,
          state.actor.x,
          state.actor.y,
          dtSec,
        );
        actorOcclusion = computeActorOcclusion(
          {
            x: state.actor.x,
            y: state.actor.y,
            lift: state.actor.lift ?? reliefLiftFn(state.actor.x, state.actor.y),
            heightPx: state.actor.heightPx,
          },
          occluders,
          reliefFeatures,
        );
      }

      if (state?.camera) {
        const {
          viewX,
          viewY,
          viewWidth,
          viewHeight,
          camX = viewX,
          camY = viewY,
          screenWidth = viewWidth,
          screenHeight = viewHeight,
        } = state.camera;
        snow.sync(viewX, viewY, viewWidth, viewHeight);
        cullStats = frontier.cull(viewX, viewY, viewWidth, viewHeight);
        biomeParallax.sync(camX, camY, screenWidth, screenHeight);
      }
    },
    metrics: (): EnvironmentRuntimeMetrics => ({
      stage1: {
        mapId: worldMap.id,
        sizeTiles: worldMap.sizeTiles,
        metersPerTile: worldMap.metersPerTile,
        chunkTiles: worldMap.chunkTiles,
        iso: { ...ISO },
        court: { ...COURT },
        strongholdOrigin: { ...STRONGHOLD_ORIGIN },
        snowDensity: snow.density,
        foundationCount,
        gateDoor: { ...gateDoor },
      },
      stage2: {
        frontierPropCount: frontierProps.length,
        frontierVisibleCount: cullStats.visibleCount,
        frontierColumnCount: frontierColumns.length,
      },
      stage3: {
        reliefFeatureCount: reliefFeatures.length,
        reliefIds: reliefFeatures.map((f) => f.id),
        eastRidgeTopM: heightAt(2049, 176, reliefFeatures),
        westTerraceTopM: heightAt(1025, 672, reliefFeatures),
        templePodiumTopM: Number(
          (
            reliefFeatures.find((f) => f.id === "temple-podium")?.heightM ?? 0
          ).toFixed(4),
        ),
      },
      stage4: {
        environmentMapName: envMap.name,
        environmentObjectCount: envMap.objects.length,
        catalogAssetCount: envCatalog.assets.length,
        authoredColumnCount: authored.columns.length,
        harvestedTreeCount: authored.harvestedIds.size,
      },
      stage5: {
        daylight: {
          ...daylight,
          ambient: [...daylight.ambient] as [number, number, number],
        },
        sun: { ...sun },
        torchCount: torches.nodes.length,
        shadowCount: shadows.shadows.length,
        actorOcclusion: {
          ...actorOcclusion,
          occluderIds: [...actorOcclusion.occluderIds],
        },
      },
    }),
  };

  return runtime;
}

export * from "./atmosphere";
export * from "./environment-catalog";
export * from "./environment-map";
export * from "./frontier";
export * from "./relief";
