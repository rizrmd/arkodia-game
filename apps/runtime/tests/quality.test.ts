import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FrameBudgetMonitor,
  QUALITY_PROFILES,
  activeQuality,
  blurOptions,
  detectQualityTier,
  frameBudgetMs,
  layerCount,
  layerVisible,
  lowerTier,
  resolveQuality,
  setActiveQuality,
} from "../src/authored-scene/quality";

test("tiers only ever lower cost from High down to Low", () => {
  const { low, medium, high } = QUALITY_PROFILES;
  for (const [a, b] of [
    [low, medium],
    [medium, high],
  ] as const) {
    assert.ok(a.maxResolution <= b.maxResolution);
    assert.ok(a.sceneFilterResolution <= b.sceneFilterResolution);
    assert.ok(a.effectFilterResolution <= b.effectFilterResolution);
    assert.ok(a.blurQualityCap <= b.blurQualityCap);
    assert.ok(a.particleDensity <= b.particleDensity);
  }
  // High is today's rendering: nothing reduced, nothing capped.
  assert.deepEqual(
    {
      aa: high.antialias,
      fps: high.maxFPS,
      scene: high.sceneFilterResolution,
      density: high.particleDensity,
      effects: high.maxEffects,
      character: high.characterFPS,
    },
    { aa: true, fps: 0, scene: 1, density: 1, effects: 0, character: 0 },
  );
  assert.equal(low.bloom || low.distortion || low.antialias, false);
});

test("auto resolves to the detected tier, explicit settings win", () => {
  assert.equal(resolveQuality("auto", "low").tier, "low");
  assert.equal(resolveQuality("high", "low").tier, "high");
  assert.equal(lowerTier("high"), "medium");
  assert.equal(lowerTier("low"), undefined);
});

test("detection: software GL and old mobile GPUs are Low; strong desktops are High", () => {
  for (const gpu of [
    "Google SwiftShader",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "Mali-T860",
    "Mali-400 MP",
    "Adreno (TM) 306",
    "Adreno (TM) 418",
    "PowerVR SGX 544MP",
  ])
    assert.equal(detectQualityTier({ gpu }), "low", gpu);
  assert.equal(
    detectQualityTier({ cores: 2, memoryGB: 2, maxTextureSize: 4096 }),
    "low",
  );
  assert.equal(
    detectQualityTier({
      gpu: "ANGLE (NVIDIA GeForce RTX 3060)",
      cores: 12,
      memoryGB: 8,
      maxTextureSize: 16384,
    }),
    "high",
  );
  // A mid phone with a dense screen never auto-picks High.
  assert.equal(
    detectQualityTier({
      gpu: "Adreno (TM) 650",
      cores: 8,
      memoryGB: 8,
      maxTextureSize: 16384,
      mobile: true,
      devicePixelRatio: 3,
    }),
    "medium",
  );
  assert.equal(detectQualityTier({}), "medium");
});

test("frame monitor ignores warm-up and hidden-tab gaps, flags slow windows", () => {
  const m = new FrameBudgetMonitor(frameBudgetMs(QUALITY_PROFILES.high), 1000, 500);
  // Warm-up shader compile spikes do not count.
  for (let i = 0; i < 5; i++) assert.equal(m.sample(120), false);
  // A suspended tab's huge delta is ignored.
  assert.equal(m.sample(5000), false);
  let over = false;
  for (let i = 0; i < 60 && !over; i++) over = m.sample(16.7);
  assert.equal(over, false, "60 fps stays within budget");
  for (let i = 0; i < 40 && !over; i++) over = m.sample(33);
  assert.equal(over, true, "30 fps on a 60 fps tier steps down");
  // Low's budget is its 30 fps cap: a steady 30 is fine there.
  const low = new FrameBudgetMonitor(frameBudgetMs(QUALITY_PROFILES.low), 1000, 0);
  over = false;
  for (let i = 0; i < 60; i++) over ||= low.sample(33.3);
  assert.equal(over, false);
});

test("VFX layer budgets: reduce scales, keep holds, skip drops only at Low", () => {
  const { low, medium, high } = QUALITY_PROFILES;
  assert.equal(layerCount(40, high), 40);
  assert.equal(layerCount(40, medium), 28);
  assert.equal(layerCount(40, low), 14);
  assert.equal(layerCount(1, low), 1, "a single particle is never reduced away");
  assert.equal(layerCount(40, low, "keep"), 40);
  assert.equal(layerCount(40, low, "skip"), 0);
  assert.equal(layerCount(40, medium, "skip"), 28);
  assert.equal(layerVisible("skip", low), false);
  assert.equal(layerVisible("skip", medium), true);
  assert.equal(layerVisible(undefined, low), true);
});

test("shared filters follow the active profile; the default is High", () => {
  assert.equal(activeQuality().tier, "high");
  assert.deepEqual(blurOptions(4, 3), { strength: 4, quality: 3, resolution: 1 });
  setActiveQuality(QUALITY_PROFILES.low);
  try {
    assert.deepEqual(blurOptions(4, 3), { strength: 4, quality: 1, resolution: 0.5 });
  } finally {
    setActiveQuality(QUALITY_PROFILES.high);
  }
});

test("Stronghold creates its canvas and hero pass from the quality profile", () => {
  const main = readFileSync(new URL("../src/stronghold-main.ts", import.meta.url), "utf8");
  assert.match(main, /antialias: quality\.profile\.antialias/);
  assert.match(main, /resolution: quality\.resolution/);
  assert.match(main, /quality\.attach\(app\)/);
  const world = readFileSync(new URL("../src/arkodia/world.ts", import.meta.url), "utf8");
  assert.match(world, /characterFPS/);
});
