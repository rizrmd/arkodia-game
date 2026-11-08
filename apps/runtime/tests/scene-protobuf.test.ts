import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  encodeSceneProtobuf,
  decodeScenePayload,
  SCENE_PROTOBUF_PREFIX,
} from "../src/authored-scene/scene";
import { instanceId } from "../src/authored-scene/instanceIdentity";

function normalize(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (
        v === null ||
        v === undefined ||
        v === "" ||
        v === false ||
        (typeof v === "number" && v === 0) ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0)
      ) {
        continue;
      }
      out[k] = normalize(v);
    }
    return out;
  }
  return value;
}

test("scene handoff round-trips through protobuf with the same validated scene", () => {
  const scene = JSON.parse(
    readFileSync(new URL("../fixtures/authored-scene.json", import.meta.url), "utf8"),
  );
  const encoded = encodeSceneProtobuf(scene);
  assert.ok(encoded.startsWith(SCENE_PROTOBUF_PREFIX));
  const decoded = decodeScenePayload(encoded);
  const expected = {
    ...scene,
    instances: scene.instances.map((o: any) => ({ ...o, id: instanceId(o.id) })),
  };
  assert.deepEqual(normalize(decoded), normalize(expected));
  // The JSON path still works.
  assert.deepEqual(
    normalize(decodeScenePayload(JSON.stringify(scene))),
    normalize(expected),
  );
});
