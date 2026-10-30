import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Container, Sprite } from "pixi.js";
import {
  COURT,
  COURT_CENTER,
  DAY_MS,
  DEFAULT_ENVIRONMENT_CATALOG,
  DEFAULT_FRONTIER_KIT,
  DEFAULT_PUBLISHED_ENVIRONMENT_MAP,
  DEFAULT_RELIEF_FEATURES,
  DEFAULT_TORCH_LIGHTS,
  DEFAULT_WORLD_MAP,
  FROZEN_FRONTIER_SPRITES,
  GATE_DOOR_CONFIG,
  ISO,
  MAX_SHADOW,
  MAX_STEP_M,
  MIN_AMBIENT_LUMA,
  OCCLUSION_CUTOUT_ALPHA,
  PX_PER_METER,
  RESIDUAL_SILHOUETTE_ALPHA,
  SNOW_DENSITY,
  STRONGHOLD_ORIGIN,
  applyActorSilhouetteCutout,
  buildFrontierColumns,
  buildFrontierProps,
  campfireColumns,
  chunkOf,
  cliff,
  computeActorOcclusion,
  courtToMap,
  courtToScenePercent,
  createAuthoredEnvironmentLayer,
  createBiomeParallax,
  createCourtSurface,
  createEnvironmentRuntime,
  createFrontierLayer,
  createGateDoorState,
  createInfiniteSnow,
  createProjectedShadowLayer,
  createPropFoundation,
  createReliefLayer,
  createTorchLayer,
  daylightAt,
  environmentBlocked,
  environmentMapToScene,
  environmentObjectColumns,
  evaluateLightmapAt,
  gatewayApronAlphaAt,
  groundPlaneMatrix,
  heightAt,
  heightAtTile,
  insideMap,
  liftAt,
  mapToCourt,
  palisadeColumns,
  recoverReliefPosition,
  reliefBlocked,
  reliefHides,
  sceneEnvironmentMetrics,
  sceneGround,
  scenePercentToCourt,
  sceneToEnvironmentMap,
  starterEnclosureProps,
  stepGateDoor,
  sunAt,
  treeKind,
} from "../src/authored-scene/renderer";
import { parseScene } from "../src/authored-scene/scene";
import { strongholdCollision, walkStep } from "../src/arkodia/collision";
import { StrongholdWorld } from "../src/arkodia/world";
import { Texture } from "pixi.js";

test("Stage 1: world coordinate grid, infinite snow, court surface, foundations, enclosure & gate hysteresis", () => {
  assert.equal(DEFAULT_WORLD_MAP.sizeTiles, 936);
  assert.equal(DEFAULT_WORLD_MAP.metersPerTile, 3);
  assert.equal(DEFAULT_WORLD_MAP.chunkTiles, 24);
  assert.deepEqual(ISO, { halfWidth: 64, halfHeight: 32 });
  assert.deepEqual(COURT, { x: 577, y: -160, size: 15 });
  assert.deepEqual(STRONGHOLD_ORIGIN, { u: 460.5, v: 460.5 });

  const centerTile = courtToMap(COURT_CENTER.x, COURT_CENTER.y);
  assert.equal(centerTile.u, 468);
  assert.equal(centerTile.v, 468);
  assert.deepEqual(mapToCourt(468, 468), COURT_CENTER);
  assert.deepEqual(chunkOf(468, 468), { cu: 19, cv: 19 });
  assert.equal(insideMap(468, 468), true);
  assert.equal(insideMap(-1, 468), false);
  assert.equal(insideMap(936, 468), false);

  const pct = courtToScenePercent(COURT_CENTER.x, COURT_CENTER.y);
  assert.deepEqual(pct, { x: 50, y: 50 });
  assert.deepEqual(scenePercentToCourt(50, 50), COURT_CENTER);

  const snow = createInfiniteSnow(undefined as any);
  assert.equal(snow.density, SNOW_DENSITY);
  snow.sync(100, 200, 1280, 720);
  assert.equal(snow.sprite.x, 100 - snow.pad);
  assert.equal(snow.sprite.y, 200 - snow.pad);
  assert.equal(snow.sprite.width, 1280 + snow.pad * 2);
  assert.equal(snow.sprite.height, 720 + snow.pad * 2);
  assert.equal(snow.sprite.tilePosition.x, -(100 - snow.pad));
  assert.equal(snow.sprite.tilePosition.y, -(200 - snow.pad));

  const court = createCourtSurface(undefined as any);
  assert.equal(court.contactShadow.zIndex, 0);
  assert.equal(court.paving.zIndex, 1);
  assert.equal(court.snowApron.zIndex, 2);
  const apronSample = gatewayApronAlphaAt(577, 790);
  assert.ok(apronSample.alpha > 0);

  const enclosure = starterEnclosureProps();
  assert.equal(enclosure.length, 16);
  const fnd = createPropFoundation(enclosure[0]!);
  assert.equal(fnd.under.zIndex, 3);
  assert.equal(fnd.face.zIndex, 10.6);

  assert.ok(campfireColumns().length > 20);
  assert.ok(palisadeColumns(enclosure[0]!).length > 20);

  let gate = createGateDoorState(false);
  assert.equal(gate.passable, false);
  for (let i = 0; i < 20; i++) {
    gate = stepGateDoor(gate, GATE_DOOR_CONFIG.x, GATE_DOOR_CONFIG.y, 0.05);
  }
  assert.equal(gate.open, true);
  assert.equal(gate.frame, 15);
  assert.equal(gate.passable, true);
  // Hysteresis: at distance 135 (between 120 openRadius and 150 closeRadius), remains open
  gate = stepGateDoor(gate, GATE_DOOR_CONFIG.x + 135, GATE_DOOR_CONFIG.y, 0.05);
  assert.equal(gate.open, true);
  // Outside 150 closeRadius, begins closing
  gate = stepGateDoor(gate, GATE_DOOR_CONFIG.x + 180, GATE_DOOR_CONFIG.y, 1.0);
  assert.equal(gate.open, false);
  assert.equal(gate.frame, 0);
  assert.equal(gate.passable, false);
});

test("Stage 2: Frozen Frontier 46 sprites/kit, ground-plane rotation, cap linking, columns & frustum culling", () => {
  assert.equal(Object.keys(FROZEN_FRONTIER_SPRITES).length, 46);
  assert.equal(Object.keys(DEFAULT_FRONTIER_KIT).length, 46);

  const legacyFrontier = JSON.parse(
    readFileSync(
      new URL("../../../fixtures/legacy/frontier.json", import.meta.url),
      "utf8",
    ),
  ).payload;
  const fullProps = buildFrontierProps({
    placements: legacyFrontier.placements,
    kit: legacyFrontier.kit,
  });
  assert.equal(fullProps.length, 834);
  const fullCols = buildFrontierColumns(fullProps);
  assert.ok(fullCols.length > 1000);

  const liftedProp = fullProps.find((p) => p.lift > 0);
  assert.ok(liftedProp);
  assert.equal(liftedProp.lift, 25);

  const defaultProps = buildFrontierProps({
    placements: [
      ...legacyFrontier.placements,
      { a: "drift-ne", u: 473.5, v: 491.94, on: { u: 473.5, v: 491.94 } },
    ],
  });
  const capProp = defaultProps.find((p) => p.layer === "cap");
  assert.ok(capProp);
  assert.equal(capProp.solid, false);
  assert.ok(capProp.zBoost !== 0);

  const mat = groundPlaneMatrix(1, 1, 90, 100, 200);
  assert.ok(Math.abs(mat.b - 0.5) < 1e-6);
  assert.ok(Math.abs(mat.c - -2) < 1e-6);

  const layer = createFrontierLayer(fullProps.slice(0, 40), {});
  assert.equal(layer.ground.zIndex, 2.6);
  assert.equal(layer.shade.zIndex, 3.25);
  const culled = layer.cull(50000, 50000, 100, 100, 0);
  assert.equal(culled.visibleCount, 0);
  const allVisible = layer.cull(-50000, -50000, 100000, 100000, 512);
  assert.equal(allVisible.visibleCount, allVisible.totalCount);
});

test("Stage 3: Terrain relief plateaus, ramps, hills, elevation lift & cliff physics", () => {
  assert.equal(PX_PER_METER, 24);
  assert.equal(MAX_STEP_M, 0.4);
  assert.equal(DEFAULT_RELIEF_FEATURES.length, 4);

  // Court center is flat ground (0m)
  assert.equal(heightAt(COURT_CENTER.x, COURT_CENTER.y), 0);
  assert.equal(liftAt(COURT_CENTER.x, COURT_CENTER.y), 0);

  // East ridge crest (u=486, v=468) is 3m (72px lift)
  assert.equal(heightAtTile(486, 468), 3);
  const eastCrest = mapToCourt(486, 468);
  assert.equal(liftAt(eastCrest.x, eastCrest.y), 72);

  // West terrace crest (u=466, v=485.5) is 1.5m (36px lift)
  assert.equal(heightAtTile(466, 485.5), 1.5);

  // Temple podium (u=478.9, v=492.5) is ~1.054m, connected to temple-stairs ramp
  const podiumH = heightAtTile(478.9, 492.5);
  assert.ok(Math.abs(podiumH - 1.0541666) < 0.001);
  const stairsMidH = heightAtTile(480.179, 492.5);
  assert.ok(stairsMidH > 0.3 && stairsMidH < 0.8);

  // Steep side of temple-podium (north edge without ramp) is blocked by cliff()
  const podiumOutside = mapToCourt(478.9, 490.2);
  const podiumInside = mapToCourt(478.9, 490.8);
  assert.equal(
    cliff(podiumOutside.x, podiumOutside.y, podiumInside.x, podiumInside.y),
    true,
  );

  // Walking up temple-stairs gradually is permitted by cliff()
  const stairsBottom = mapToCourt(480.45, 492.5);
  const stairsStep = mapToCourt(480.35, 492.5);
  assert.equal(
    cliff(stairsBottom.x, stairsBottom.y, stairsStep.x, stairsStep.y),
    false,
  );

  // Relief occlusion check behind east-ridge
  const eastRidge = DEFAULT_RELIEF_FEATURES.find((f) => f.id === "east-ridge")!;
  const behindRidge = mapToCourt(485.5, 465.2);
  assert.equal(reliefHides(eastRidge, behindRidge.x, behindRidge.y), true);

  // Recovery from blocked hill edge
  const edgePt = mapToCourt(483.55, 466.55);
  if (reliefBlocked(edgePt.x, edgePt.y)) {
    const recovered = recoverReliefPosition(edgePt.x, edgePt.y);
    assert.equal(reliefBlocked(recovered.x, recovered.y), false);
  }

  const reliefLayer = createReliefLayer({});
  assert.equal(reliefLayer.nodes.length, 2); // east-ridge & west-terrace (scenery podium/stairs excluded)
});

test("Stage 4: Authored EnvironmentMap & Catalog, multi-part components, treeKind & Scene bridge", () => {
  assert.equal(treeKind("frontier:pine-tall"), "pine-tall");
  assert.equal(treeKind("spruce-mature.png"), "spruce-mature");
  assert.equal(treeKind("building:stronghold-bastion"), null);

  const customMap = {
    ...DEFAULT_PUBLISHED_ENVIRONMENT_MAP,
    objects: [
      ...DEFAULT_PUBLISHED_ENVIRONMENT_MAP.objects,
      { id: "tree-1", asset: "frontier:pine-tall", u: 472, v: 472, s: 1 },
      {
        id: "bastion-1",
        asset: "building:stronghold-bastion",
        u: 475,
        v: 474,
        s: 1,
      },
    ],
  };

  const colsAll = environmentObjectColumns(
    customMap,
    DEFAULT_ENVIRONMENT_CATALOG,
  );
  const colsNoTrees = environmentObjectColumns(
    customMap,
    DEFAULT_ENVIRONMENT_CATALOG,
    { skipHarvestableTrees: true },
  );
  assert.ok(colsAll.length > colsNoTrees.length);

  const treeCourt = mapToCourt(472, 472);
  assert.equal(environmentBlocked(treeCourt.x, treeCourt.y, colsAll), true);

  const layer = createAuthoredEnvironmentLayer(
    customMap,
    DEFAULT_ENVIRONMENT_CATALOG,
    {},
    { showSpawnMarkers: true },
  );
  assert.equal(layer.authoredGround.zIndex, 9.9);
  assert.equal(layer.authoredStage.zIndex, 10.65);
  assert.equal(layer.gatheringStage.zIndex, 10.67);
  assert.equal(layer.harvestTree("tree-1"), true);
  assert.equal(layer.harvestedIds.has("tree-1"), true);
  assert.equal(layer.restoreTree("tree-1"), true);
  assert.equal(layer.harvestedIds.has("tree-1"), false);

  const scene = environmentMapToScene(customMap, DEFAULT_ENVIRONMENT_CATALOG);
  const parsed = parseScene(scene);
  assert.equal(parsed.schema, "arkodia.scene");
  assert.equal(parsed.instances.length, 3);
  const roundTripMap = sceneToEnvironmentMap(parsed);
  assert.equal(roundTripMap.objects.length, 3);
});

test("Stage 5: Daylight cycle (Rec. 601 luma floor), flickering torches, lightmap, sun shadows, silhouette occlusion & biome parallax", () => {
  for (let ms = 0; ms <= DAY_MS; ms += DAY_MS / 20) {
    const d = daylightAt(ms);
    const [r, g, b] = d.ambient;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    assert.ok(
      luma >= MIN_AMBIENT_LUMA - 1e-4,
      `Expected luma >= ${MIN_AMBIENT_LUMA}, got ${luma} at ms=${ms}`,
    );
    const s = sunAt(ms);
    assert.ok(Math.hypot(s.dx, s.dy) <= MAX_SHADOW + 1e-4);
  }

  const night = daylightAt(DAY_MS * 0.9);
  const noon = daylightAt(DAY_MS * 0.35);
  assert.ok(night.lightScale > noon.lightScale);

  const nearCampfire = evaluateLightmapAt(
    COURT_CENTER.x,
    COURT_CENTER.y,
    night,
    DEFAULT_TORCH_LIGHTS,
  );
  const farSnow = evaluateLightmapAt(
    COURT_CENTER.x + 2000,
    COURT_CENTER.y + 2000,
    night,
    DEFAULT_TORCH_LIGHTS,
  );
  assert.ok(nearCampfire.warmBoost > farSnow.warmBoost);

  const torches = createTorchLayer(DEFAULT_TORCH_LIGHTS, {});
  assert.equal(torches.nodes.length, 16);
  torches.step(1.25, night);

  const shadows = createProjectedShadowLayer(starterEnclosureProps(), {});
  shadows.sync(sunAt(DAY_MS * 0.35));

  const runtime = createEnvironmentRuntime();
  // Place actor directly behind south gate at (577, 740)
  runtime.step(0.05, {
    nowMs: DAY_MS * 0.35,
    actor: { x: 577, y: 740, lift: 0, heightPx: 88 },
    camera: {
      viewX: 0,
      viewY: 0,
      viewWidth: 1280,
      viewHeight: 720,
      camX: 577,
      camY: 400,
      screenWidth: 1280,
      screenHeight: 720,
    },
  });
  assert.equal(runtime.actorOcclusion.occluded, true);
  assert.equal(runtime.actorOcclusion.cutoutAlpha, OCCLUSION_CUTOUT_ALPHA);
  assert.equal(runtime.actorOcclusion.residualAlpha, RESIDUAL_SILHOUETTE_ALPHA);

  const silhouette = new Sprite();
  applyActorSilhouetteCutout(silhouette, runtime.actorOcclusion);
  assert.equal(silhouette.visible, true);
  assert.ok(Math.abs(silhouette.alpha - RESIDUAL_SILHOUETTE_ALPHA) < 1e-6);

  const parallax = createBiomeParallax({});
  parallax.sync(600, 400, 1440, 900);
  assert.ok(parallax.corners.topRight.x > 1400);

  const m = runtime.metrics();
  assert.equal(m.stage1.sizeTiles, 936);
  assert.equal(m.stage2.frontierPropCount, 834);
  assert.equal(m.stage3.reliefFeatureCount, 4);
  assert.equal(m.stage4.environmentObjectCount, 4);
  assert.equal(m.stage5.torchCount, 16);

  // Verify sceneGround & sceneEnvironmentMetrics integration
  const root = new Container();
  const sampleScene = environmentMapToScene(DEFAULT_PUBLISHED_ENVIRONMENT_MAP);
  sceneGround(root, sampleScene);
  const sceneMetrics = sceneEnvironmentMetrics(root, sampleScene, 0.5);
  assert.equal(sceneMetrics.stage1.mapId, "arkodia-01");

  // Verify collision cliff integration in strongholdCollision + walkStep
  const source = JSON.parse(
    readFileSync(
      new URL("../../../docs/runtime/stronghold/source.json", import.meta.url),
      "utf8",
    ),
  );
  const col = strongholdCollision(
    source.prefab,
    source.nav.columns,
    source.ui["/world/map.json"],
  );
  const eastCrest = mapToCourt(486, 468);
  const podiumOutside = mapToCourt(478.9, 490.2);
  const podiumInside = mapToCourt(478.9, 490.8);
  assert.equal(col.heightAt(eastCrest.x, eastCrest.y), 3);
  assert.equal(col.liftAt(eastCrest.x, eastCrest.y), 72);
  assert.equal(
    col.cliff(podiumOutside.x, podiumOutside.y, podiumInside.x, podiumInside.y),
    true,
  );
  // Stepping into a cliff where both axes cross the cliff edge yields 0 progress
  const stepIntoCliff = walkStep(
    podiumOutside.x,
    podiumOutside.y,
    { x: 0, y: 1 },
    0.05,
    () => false,
    () => true,
  );
  assert.equal(stepIntoCliff.progress, 0);

  // End-to-end StrongholdWorld integration with all 5 environment runtime stages
  const mockResources = {
    published: { manifest: { id: "test-release" } },
    data: {
      prefab: source.prefab,
      nav: source.nav,
      ui: source.ui,
      props: source.props,
    },
    textures: new Map<string, Texture>(),
    texture: () => Texture.WHITE,
  } as any;
  const mockHeroRenderer = {
    canvas: { width: 256, height: 256, dataset: { clip: "idle" } },
    pivotY: 0.85,
    bones: new Array(24),
    render: () => {},
    destroy: () => {},
  } as any;
  const world = new StrongholdWorld(
    mockResources,
    "rift-runner",
    mockHeroRenderer,
  );
  world.tick(0.05, 1280, 720, { x: 1, y: 0 });
  assert.ok(world.player.x > source.prefab.heroSpawn.x);
  assert.equal(world.environment.metrics().stage1.sizeTiles, 936);
  assert.equal(world.environment.metrics().stage5.torchCount, 16);

  // Move player behind south gate (577, 740) and verify silhouette cutout activates
  world.player.position.set(577, 740);
  world.tick(0.05, 1280, 720, { x: 0, y: 0 });
  assert.equal(world.environment.actorOcclusion.occluded, true);
  assert.equal(world.playerSilhouette.visible, true);
  assert.ok(
    Math.abs(world.playerSilhouette.alpha - RESIDUAL_SILHOUETTE_ALPHA) < 1e-6,
  );

  // Move player onto east-ridge crest and verify terrain elevation lift (72px = 3m * 24px/m)
  world.player.position.set(eastCrest.x, eastCrest.y);
  world.tick(0.05, 1280, 720, { x: 0, y: 0 });
  assert.equal(world.playerLift, 72);
  world.destroy();
});
