import type { ShadowSurface, ShadowResult } from "../src/authored-scene/shadow-field";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShadowField } from "../src/authored-scene/shadow-field";

function fixture(options: Partial<ShadowSurface> = {}, strength = 1, extra: ShadowSurface[] = []) {
  // Wide canopy with a narrow trunk: contact must follow the trunk, not canopy.
  const alpha = new Uint8Array(40 * 80);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 40; x++)
    if (y < 60 || (x >= 16 && x < 24)) alpha[y * 40 + x] = 255;
  const tree: ShadowSurface = { owner: 2, image: 1, frame: [0, 0, 40, 80],
    matrix: [1, 0, 0, 1, 64, 90], anchor: [0.5, 1], lift: 0,
    ground: false, cast: true, alpha: 1, order: 2, baseline: [1, 1], ...options };
  return buildShadowField({ id: 1, scene: 1,
    bounds: { left: 0, top: 0, step: 1, width: 128, height: 128 },
    sun: { dx: 1, dy: 0, strength }, surfaces: [tree, ...extra],
    images: [{ id: 1, width: 40, height: 80, alpha }] }, new Map());
}
const at = (field: ShadowResult, x: number, y: number) => field.groundShade[(y * 128 + x) * 4 + 2];
const coverage = (field: ShadowResult) => field.groundShade.filter((_, i) => i % 4 === 2);

test("contact anchors the visible trunk and adjacent ground with soft local coverage", () => {
  const field = fixture();
  assert.ok(at(field, 64, 89) > 60, "visible root needs contact despite self exclusion");
  assert.ok(at(field, 64, 90) > 0, "ground immediately below the foot needs contact");
  assert.equal(at(field, 48, 89), 0, "canopy width must not define contact radius");
  assert.ok(new Set(coverage(field)).size > 10, "contact must fade smoothly");
  assert.ok(Math.max(...coverage(field)) <= 140, "subtle bounded strength");
});

test("contact respects casting, ground layers, visibility, nighttime and airborne props", () => {
  for (const options of [{ cast: false }, { ground: true }, { alpha: 0 }, { lift: 20 }])
    assert.equal(Math.max(...coverage(fixture(options))), 0, JSON.stringify(options));
  assert.equal(Math.max(...coverage(fixture({}, 0))), 0);
  const half = fixture({ alpha: 0.5 });
  assert.ok(at(half, 64, 89) > 0);
  assert.ok(at(half, 64, 89) < at(fixture(), 64, 89));
});

test("contact follows translated and mirrored objects and overlapping contacts use max", () => {
  const normal = fixture();
  const moved = fixture({ matrix: [-1, 0, 0, 1, 74, 95] });
  assert.equal(at(normal, 64, 89), at(moved, 73, 94));
  const duplicate: ShadowSurface = { owner: 3, image: 1, frame: [0, 0, 40, 80],
    matrix: [1, 0, 0, 1, 64, 90], anchor: [0.5, 1], lift: 0,
    ground: false, cast: true, alpha: 1, order: 3, baseline: [1, 1] };
  assert.deepEqual(coverage(normal), coverage(fixture({}, 1, [duplicate])));
});

test("contact does not bleed onto unrelated elevated receivers but supports elevated bases", () => {
  const terrain: ShadowSurface = { owner: 1, image: 0, frame: [0, 0, 0, 0],
    matrix: [1, 0, 0, 1, 0, 0], anchor: [0, 0], lift: 0,
    ground: true, cast: false, alpha: 1, order: 4,
    triangles: new Float32Array([0,0,20, 128,0,20, 0,128,20, 128,0,20, 128,128,20, 0,128,20]) };
  assert.equal(Math.max(...coverage(fixture({}, 1, [terrain]))), 0);
  assert.ok(at(fixture({ lift: 20 }, 1, [terrain]), 64, 90) > 0);
});
