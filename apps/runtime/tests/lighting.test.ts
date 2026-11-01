import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  daylightAt,
  sunAt,
  resolveDaylightMs,
} from "../src/authored-scene/daylight";
import {
  buildShadowField,
  decodeCell,
  type ShadowSurface,
} from "../src/authored-scene/shadow-field";
test("shared clock keeps midnight readable, noon white and nighttime sun shadows absent", () => {
  for (const phase of [0, 0.05, 0.1, 0.9, 0.99])
    assert.equal(sunAt(phase * DAY_MS).strength, 0);
  assert.ok(
    daylightAt(DAY_MS * 0.5).ambient.every((n) => Math.abs(n - 1) < 1e-10),
  );
  assert.equal(resolveDaylightMs("Night", 999), 0);
  assert.equal(resolveDaylightMs("Live", 999), 999);
});
test("depth fields retain an elevated receiver and a separate higher caster", () => {
  const quad = (owner: number, y: number, z: number): ShadowSurface => ({
    owner,
    image: 0,
    frame: [0, 0, 1, 1],
    matrix: [1, 0, 0, 1, 0, 0],
    anchor: [0, 0],
    ground: false,
    cast: true,
    lift: 0,
    alpha: 1,
    order: owner,
    triangles: new Float32Array([
      20,
      y,
      z,
      80,
      y,
      z,
      80,
      y + 20,
      z,
      20,
      y,
      z,
      80,
      y + 20,
      z,
      20,
      y + 20,
      z,
    ]),
  });
  const result = buildShadowField(
    {
      id: 1,
      scene: 1,
      bounds: { left: 0, top: 0, step: 1, width: 160, height: 160 },
      sun: { dx: 0, dy: 0, strength: 1 },
      surfaces: [quad(1, 80, 20), quad(2, 40, 60)],
      images: [],
    },
    new Map(),
  );
  assert.equal(decodeCell(result.receiver, (90 * 160 + 30) * 4).z, 20);
  assert.equal(decodeCell(result.depth, (110 * 160 + 30) * 4).z, 60);
  assert.equal(decodeCell(result.second, (110 * 160 + 30) * 4).owner, 1);
});
