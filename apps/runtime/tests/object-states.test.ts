import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Assets, Texture, TextureSource } from "pixi.js";
import {
  ObjectStateController,
  validStateAnimation,
} from "../src/authored-scene/object-states";
import { createSceneNode } from "../src/authored-scene/renderer";
import { parseScene } from "../src/authored-scene/scene";

const states = () => [
  {
    id: "position",
    name: "Position",
    partIds: ["door"],
    values: [
      { id: "closed", name: "Closed", frame: 0 },
      { id: "open", name: "Open", frame: 3 },
    ],
    transitions: [
      { from: "closed", to: "open", startFrame: 0, endFrame: 3, fps: 4 },
    ],
  },
  {
    id: "lock",
    name: "Lock",
    partIds: ["lock"],
    values: [
      { id: "unlocked", name: "Unlocked", frame: 0 },
      { id: "locked", name: "Locked", frame: 2 },
    ],
    transitions: [],
  },
  {
    id: "condition",
    name: "Condition",
    partIds: [],
    values: [
      { id: "intact", name: "Intact", frame: 0 },
      { id: "broken", name: "Broken", frame: 0 },
    ],
  },
];
test("Pixi scene uses named states concurrently and exposes validated gameplay changes", async () => {
  const atlas = new Texture({
    source: new TextureSource({ width: 40, height: 10 }),
  });
  const original = Assets.load;
  Assets.load = (async () => atlas) as typeof Assets.load;
  try {
    const instance = {
      id: "door",
      name: "Door",
      asset: "door.png",
      category: "Props",
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      visible: true,
      stateValues: { position: "closed", lock: "locked", condition: "broken" },
      definition: {
        id: "door",
        name: "Door",
        stateDefinitions: states(),
        parts: ["door", "lock"].map((id) => ({
          id,
          name: id,
          kind: "sprite" as const,
          asset: "https://fixture.invalid/" + id + ".png",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          color: "#ffffff",
          animation: {
            fps: 4,
            loop: false,
            frames: Array.from({ length: 4 }, (_, i) => ({
              x: i * 10,
              y: 0,
              width: 10,
              height: 10,
            })),
          },
        })),
      },
    };
    const node = await createSceneNode(instance);
    const other = await createSceneNode(instance);
    node.sceneTick(0);
    other.sceneTick(0);
    assert.equal(node.states.setState("position", "open"), true);
    node.sceneTick(0);
    node.sceneTick(0.25);
    assert.equal((node.children[0] as any).texture.frame.x, 10);
    assert.equal((node.children[1] as any).texture.frame.x, 20);
    assert.equal((other.children[0] as any).texture.frame.x, 0);
    node.states.setState("lock", "unlocked");
    node.sceneTick(0.5);
    assert.equal((node.children[0] as any).texture.frame.x, 20);
    assert.equal((node.children[1] as any).texture.frame.x, 0);
    assert.equal(node.states.current.condition, "broken");
    assert.equal(node.states.setState("position", "missing"), false);
    assert.equal(node.states.current.position, "open");
    const snapshot = node.states.current;
    snapshot.position = "closed";
    assert.equal(node.states.current.position, "open");
    node.sceneTick(1);
    assert.equal((node.children[0] as any).texture.frame.x, 30);
    node.destroy({ children: true });
    other.destroy({ children: true });
  } finally {
    Assets.load = original;
    atlas.destroy(true);
  }
});
test("state validation rejects ambiguous layer ownership and invalid values or transitions", () => {
  const def = {
    stateDefinitions: states(),
    parts: [{ id: "door" }, { id: "lock" }],
  };
  assert.equal(validStateAnimation(def), true);
  const overlap = structuredClone(def);
  overlap.stateDefinitions[1].partIds = ["door"];
  assert.equal(validStateAnimation(overlap), false);
  const missing = structuredClone(def);
  missing.stateDefinitions[1].partIds = ["missing"];
  assert.equal(validStateAnimation(missing), false);
  const duplicate = structuredClone(def);
  duplicate.stateDefinitions[1].name = "Position";
  assert.equal(validStateAnimation(duplicate), false);
  const bad = structuredClone(def);
  bad.stateDefinitions[0].transitions[0].to = "missing";
  assert.equal(validStateAnimation(bad), false);
  for (const invalid of [
    null,
    { stateDefinitions: [null] },
    { stateDefinitions: [{ id: "x", name: "X" }] },
  ])
    assert.equal(validStateAnimation(invalid as any), false);
});
test("scene loader preserves state definitions/selections and rejects unknown current values", () => {
  const scene = JSON.parse(
    readFileSync(
      new URL("../fixtures/authored-scene.json", import.meta.url),
      "utf8",
    ),
  );
  const o = scene.instances[0];
  o.definition.stateDefinitions = states().map((s) => ({ ...s, partIds: [] }));
  o.stateValues = { position: "open", lock: "locked", condition: "broken" };
  assert.deepEqual(parseScene(JSON.parse(JSON.stringify(scene))), scene);
  o.stateValues.position = "invalid";
  assert.throws(() => parseScene(scene), /Invalid current state values/);
});
test("legacy saved selection and defaults remain compatible with independent state API", () => {
  const definition = {
    image: "/gate-sheet.png",
    states: [
      { id: "closed", name: "Closed", frame: 0 },
      { id: "opened", name: "Opened", frame: 15 },
    ],
    transitions: [],
  };
  const controller = new ObjectStateController(definition, {}, "opened");
  assert.deepEqual(controller.current, { legacy: "opened" });
  assert.equal(controller.frames(0).legacy, 15);
  assert.equal(controller.setState("legacy", "closed"), true);
  assert.equal(controller.frames(1).legacy, 0);
});
