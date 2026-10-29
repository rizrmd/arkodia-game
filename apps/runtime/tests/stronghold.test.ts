import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { strongholdCollision, walkStep } from "../src/arkodia/collision";
import { createAutoWalk } from "../src/navigation";
const source = JSON.parse(
  readFileSync(
    new URL("../../../docs/runtime/stronghold/source.json", import.meta.url),
    "utf8",
  ),
);
const c = strongholdCollision(
  source.prefab,
  source.nav.columns,
  source.ui["/world/map.json"],
);
test("original fresh camp footprints block campfire and wall, permit court and gate only after opening", () => {
  assert.equal(c.blocked(577, 320, true), true);
  assert.equal(c.blocked(590, 420, false), false);
  assert.equal(c.blocked(577, 777, false), true);
  assert.equal(c.blocked(577, 777, true), false);
  assert.equal(c.blocked(200, 40, true), true);
  assert.equal(c.blocked(577, -10000, true), false);
});
test("movement keeps original 120/90 ellipse and cannot tunnel through campfire", () => {
  const free = () => false;
  assert.equal(walkStep(0, 0, { x: 1, y: 0 }, 0.05, free).x, 6);
  assert.equal(walkStep(0, 0, { x: 0, y: 1 }, 0.05, free).y, 4.5);
  let p = { x: 577, y: 420 };
  for (let i = 0; i < 200; i++)
    p = walkStep(p.x, p.y, { x: 0, y: -1 }, 0.05, (x, y) =>
      c.blocked(x, y, true),
    );
  assert.ok(p.y > 340);
});
test("bounded A* sweeps around original campfire and manual movement cancels route", () => {
  let p = { x: 590, y: 420 };
  const walker = createAutoWalk({
    position: () => p,
    blocked: (x, y) => c.blocked(x, y, true),
    onMap: c.onMap,
    passage: c.passage,
  });
  assert.equal(walker.goTo(577, 240), true);
  assert.ok(walker.route()!.expanded <= 20000);
  for (let i = 0; i < 500 && walker.route(); i++) {
    const d = walker.input({ x: 0, y: 0 });
    p = walkStep(p.x, p.y, d, 0.05, (x, y) => c.blocked(x, y, true));
    assert.equal(c.blocked(p.x, p.y, true), false);
  }
  assert.ok(Math.hypot(p.x - 577, p.y - 240) < 4);
  walker.goTo(700, 420);
  walker.input({ x: 1, y: 0 });
  assert.equal(walker.route(), null);
});
test("route crosses opening gateway without cutting walls or closed door", () => {
  let p = { x: 590, y: 420 },
    frame = 0;
  const G = source.prefab.gate;
  const walker = createAutoWalk({
    position: () => p,
    blocked: (x, y) => c.blocked(x, y, frame >= 12),
    onMap: c.onMap,
    passage: c.passage,
  });
  assert.equal(walker.goTo(577, 900), true);
  for (let i = 0; i < 1500 && walker.route(); i++) {
    const r = G.trigger[frame > 0 ? "open" : "closed"],
      near = Math.abs(p.x - G.x) < r.x && Math.abs(p.y - G.trigger.y) < r.y;
    frame = Math.max(0, Math.min(15, frame + (near ? 1 : -1)));
    const d = walker.input({ x: 0, y: 0 });
    p = walkStep(p.x, p.y, d, 0.05, (x, y) =>
      c.blocked(x, y, frame / 15 >= G.passableAt),
    );
    assert.equal(c.blocked(p.x, p.y, frame / 15 >= G.passableAt), false);
  }
  assert.ok(p.y > 890);
});
