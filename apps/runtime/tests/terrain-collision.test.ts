import test from "node:test";
import assert from "node:assert/strict";
import { cliffTile, heightAtTile, reliefBlockedTile, nativeTerrainCollision, terrainCollisionAnchor } from "../src/authored-scene/relief";
import { mapToCourt, type ReliefFeature } from "../src/authored-scene/environment-map";
import { validCollisionGeometry, type CollisionShape } from "../src/authored-scene/object-collision";
const feature = (): ReliefFeature => ({ id: "custom-cliff", type: "plateau", u0: 0, v0: 0, u1: 8, v1: 8, heightM: 3, maxStepM: .4 });
test("authored terrain boundaries affect traversal without flattening elevation or making the top solid", () => {
  const f = feature(), a = terrainCollisionAnchor(f);
  const points = [[2,2],[6,2],[6,6],[2,6]].map(([u,v]):[number,number] => { const p=mapToCourt(u,v); return [p.x-a.x,p.y-a.y]; });
  f.collisionGeometry = { version: 1, shapes: [{ id: "boundary", name: "Boundary", kind: "polygon", enabled: true, x: 0, y: 0, width: 1, height: 1, terrainRole: "height-region", points }] };
  assert.equal(cliffTile(-1,4,1,4,[f]), false);
  assert.equal(cliffTile(1,4,3,4,[f]), true);
  assert.equal(cliffTile(3,3,4,4,[f]), false);
  assert.equal(reliefBlockedTile(4,4,[f]), false);
  assert.equal(heightAtTile(1,4,[f]), 3);
  f.maxStepM=4; assert.equal(cliffTile(1,4,3,4,[f]), false);
});
test("native hill contours preserve the exact surface query until edited", () => {
  const f: ReliefFeature = { ...feature(), type: "hill", baseM: 0, topM: 3, ascend: "-v", rampStartV: 6 };
  const collisionGeometry=nativeTerrainCollision(f);
  assert.equal(validCollisionGeometry(collisionGeometry),true);
  for(let u=.1;u<8;u+=.4)for(let v=.1;v<8;v+=.4) assert.equal(reliefBlockedTile(u,v,[{...f,collisionGeometry}]),reliefBlockedTile(u,v,[f]));
});
test("thin authored blocked areas cannot be tunneled through and the terrain toggle disables them", () => {
  const f=feature(); f.maxStepM=100;
  const solid: CollisionShape = { id: "thin", name: "Thin barrier", kind: "box", x: 0, y: 0, width: .2, height: 80, enabled: true, terrainRole: "solid" };
  f.collisionGeometry={version:1,shapes:[solid]};
  assert.equal(cliffTile(3.94,4,4.05,4,[f]),true);
  f.collision=false;assert.equal(cliffTile(3.94,4,4.05,4,[f]),false);
});
