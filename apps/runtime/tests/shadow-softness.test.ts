import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGroundShade,
  encodeCell,
} from "../src/authored-scene/shadow-field";

test("ground coverage has soft symmetric edges and preserves translucent shadow interiors", () => {
  const w = 11,
    h = 9;
  const depth = new Uint8Array(w * h * 4);
  const receiver = depth.slice();
  for (let y = 2; y < 7; y++)
    for (let x = 3; x < 8; x++) encodeCell(depth, (y * w + x) * 4, 50, 2, 0.5);
  const original = depth.slice();
  const shade = buildGroundShade(receiver, depth, w, h, new Set());
  const at = (x: number, y: number) => shade[(y * w + x) * 4];
  assert.deepEqual([at(1, 4), at(2, 4), at(3, 4), at(4, 4)], [0, 32, 96, 128]);
  assert.equal(at(2, 4), at(8, 4));
  assert.equal(at(3, 4), at(7, 4));
  assert.equal(at(5, 1), 32);
  assert.deepEqual(
    depth,
    original,
    "packed height/owner bytes must never be blurred",
  );
});

test("ground fast path excludes raised receivers and zero-height caster feet", () => {
  const receiver = new Uint8Array(16);
  const depth = receiver.slice();
  encodeCell(receiver, 0, 0, 1, 1); // noncasting terrain
  encodeCell(receiver, 4, 20, 1, 1); // elevated terrain
  encodeCell(receiver, 8, 0, 2, 1); // caster foot, requires self exclusion
  const shade = buildGroundShade(receiver, depth, 4, 1, new Set([1]));
  assert.deepEqual([shade[1], shade[5], shade[9], shade[13]], [0, 255, 255, 0]);
});

test("blur does not wrap rows or produce shadows from near-ground depth bias", () => {
  const depth = new Uint8Array(3 * 3 * 4);
  encodeCell(depth, 0, 3, 4095, 1);
  assert.equal(
    buildGroundShade(depth.slice().fill(0), depth, 3, 3, new Set())[0],
    0,
  );
  encodeCell(depth, 0, 4, 4095, 1);
  const shade = buildGroundShade(depth.slice().fill(0), depth, 3, 3, new Set());
  assert.equal(shade[0], 64);
  assert.equal(shade[2 * 4], 0);
  assert.equal(shade[8 * 4], 0);
});
