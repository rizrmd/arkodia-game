import { test } from "node:test";
import assert from "node:assert/strict";
import { create, toBinary } from "@bufbuild/protobuf";
import {
  ManifestSchema,
  EnvironmentDocumentSchema,
  AnimationDocumentSchema,
} from "../../../packages/content-contracts/gen/ts/arkadia/content/v1/content_pb";
import { loadContent, digest } from "../src/content";

const hash = "a".repeat(64);
const assetBytes = new Uint8Array([1, 2, 3, 4]).buffer;

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

test("published release loads over protobuf with the same validated scene state", async () => {
  const assetHash = await digest(assetBytes);
  const scene = {
    schemaVersion: 1,
    kind: "environment",
    name: "Test",
    assets: [assetHash],
    data: {
      runtimeProfile: "arkodia.pixi-scene.v1",
      width: 1920,
      height: 1280,
      speed: 230,
      spawn: { x: 960, y: 640 },
      layers: [
        {
          id: "ground",
          objects: [
            {
              id: "hero",
              x: 1,
              y: 1,
              animation: "walk",
              scale: 1,
              player: true,
            },
          ],
        },
      ],
    },
  };
  const animation = {
    schemaVersion: 1,
    kind: "animation",
    name: "Walk",
    assets: [assetHash],
    data: {
      fps: 6,
      loop: true,
      frames: [{ asset: assetHash, x: 0, y: 0, width: 16, height: 16 }],
    },
  };

  const sceneWire = toBinary(
    EnvironmentDocumentSchema,
    create(EnvironmentDocumentSchema, scene),
  );
  const animationWire = toBinary(
    AnimationDocumentSchema,
    create(AnimationDocumentSchema, animation),
  );
  const sceneHash = await digest(
    new TextEncoder().encode(JSON.stringify(scene)).buffer,
  );
  const animationHash = await digest(
    new TextEncoder().encode(JSON.stringify(animation)).buffer,
  );
  const sceneWireHash = await digest(sceneWire.buffer as ArrayBuffer);
  const animationWireHash = await digest(animationWire.buffer as ArrayBuffer);

  const manifest = {
    id: "release",
    schemaVersion: 1,
    createdAt: "today",
    documents: [
      {
        id: "scene",
        kind: "environment",
        schemaVersion: 1,
        sha256: sceneHash,
        url: "https://hostile.invalid/scene",
        revision: 1,
        protobufSha256: sceneWireHash,
      },
      {
        id: "walk",
        kind: "animation",
        schemaVersion: 1,
        sha256: animationHash,
        url: "https://hostile.invalid/walk",
        revision: 1,
        protobufSha256: animationWireHash,
      },
    ],
    assets: [
      {
        sha256: assetHash,
        size: 4,
        mediaType: "image/png",
        url: "https://hostile.invalid/a.png",
      },
    ],
  };
  const manifestWire = toBinary(
    ManifestSchema,
    create(ManifestSchema, manifest),
  );

  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any, options: any) => {
    const path = String(input);
    const wantsProtobuf =
      options?.headers?.Accept === "application/vnd.arkadia.protobuf";
    if (path.endsWith("/contracts"))
      return Response.json({ schemaVersions: [1], schemaSha256: hash });
    if (path.endsWith("/channels/runtime-demo"))
      return Response.json({ releaseId: "release" });
    if (path.endsWith("/releases/release")) {
      return wantsProtobuf
        ? new Response(manifestWire, {
            headers: { "Content-Type": "application/vnd.arkadia.protobuf" },
          })
        : Response.json(manifest);
    }
    if (path.endsWith("/documents/scene")) {
      return wantsProtobuf
        ? new Response(sceneWire, {
            headers: { "Content-Type": "application/vnd.arkadia.protobuf" },
          })
        : new Response(JSON.stringify(scene));
    }
    if (path.endsWith("/documents/walk")) {
      return wantsProtobuf
        ? new Response(animationWire, {
            headers: { "Content-Type": "application/vnd.arkadia.protobuf" },
          })
        : new Response(JSON.stringify(animation));
    }
    if (path.includes("/assets/")) return new Response(assetBytes);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const jsonBundle = await loadContent("/content", "runtime-demo", () => {});
    const protoBundle = await loadContent("/content", "runtime-demo", () => {}, undefined, {
      format: "protobuf",
    });
    assert.equal(protoBundle.manifest.id, jsonBundle.manifest.id);
    assert.equal(protoBundle.assets.size, jsonBundle.assets.size);
    assert.deepEqual(
      normalize(protoBundle.scene),
      normalize(jsonBundle.scene),
      "scene state differs between protobuf and JSON",
    );
    assert.equal(protoBundle.clips.size, jsonBundle.clips.size);
    assert.deepEqual(
      normalize(protoBundle.clips.get("walk")),
      normalize(jsonBundle.clips.get("walk")),
      "animation clip differs between protobuf and JSON",
    );
    assert.equal(
      protoBundle.scene.layers[0].objects[0].animation,
      jsonBundle.scene.layers[0].objects[0].animation,
    );
  } finally {
    globalThis.fetch = original;
  }
});
