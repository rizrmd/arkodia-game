import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadContent,
  digest,
  validateManifest,
  validateDocuments,
} from "../src/content";
import { move, cameraFor, frameAt } from "../src/foundations";
import type {
  Manifest,
  ContentDocument,
} from "../../../packages/content-contracts/index";
const hash = "a".repeat(64);
function fixture() {
  const scene = {
    schemaVersion: 1,
    kind: "environment",
    name: "Test",
    assets: [hash],
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
    assets: [hash],
    data: {
      fps: 6,
      loop: true,
      frames: [{ asset: hash, x: 0, y: 0, width: 16, height: 16 }],
    },
  };
  const docs = new Map<string, ContentDocument>([
    ["scene", scene as ContentDocument],
    ["walk", animation as ContentDocument],
  ]);
  const manifest: Manifest = {
    id: "release",
    schemaVersion: 1,
    createdAt: "today",
    documents: [...docs].map(([id, d]) => ({
      id,
      kind: d.kind,
      schemaVersion: d.schemaVersion,
      sha256: hash,
      url: "https://evil.invalid/ignored",
      revision: 1,
    })),
    assets: [
      {
        sha256: hash,
        size: 4,
        mediaType: "image/png",
        url: "https://evil.invalid/ignored",
      },
    ],
  };
  return { docs, manifest };
}
test("supported manifest and profile bind exactly one player and all clips", () => {
  const { manifest, docs } = fixture();
  validateManifest(manifest, "release");
  assert.equal(validateDocuments(manifest, docs).clips.size, 1);
});
test("unknown manifest and document versions fail before applying content", () => {
  const { manifest } = fixture();
  assert.throws(
    () => validateManifest({ ...manifest, schemaVersion: 9 as 1 }, "release"),
    /version/,
  );
  manifest.documents[0].schemaVersion = 2;
  assert.throws(() => validateManifest(manifest, "release"), /Unsupported/);
});
test("identity, duplicate IDs and absent assets are rejected", () => {
  const { manifest, docs } = fixture();
  assert.throws(() => validateManifest(manifest, "other"), /identity/);
  manifest.documents.push(manifest.documents[0]);
  assert.throws(() => validateManifest(manifest, "release"), /entry/);
  manifest.documents.pop();
  manifest.assets = [];
  assert.throws(() => validateDocuments(manifest, docs), /missing asset/);
});
test("unknown profile, missing animation, duplicate entities and invalid coordinates fail", () => {
  for (const mutate of [
    (s: any) => (s.runtimeProfile = "future"),
    (s: any) => (s.layers[0].objects[0].animation = "missing"),
    (s: any) => s.layers[0].objects.push(s.layers[0].objects[0]),
    (s: any) => (s.spawn.x = NaN),
    (s: any) => (s.layers[0].objects[0].player = false),
  ]) {
    const { manifest, docs } = fixture();
    mutate(docs.get("scene")!.data);
    assert.throws(() => validateDocuments(manifest, docs));
  }
});
test("invalid fps and frame rectangle fail", () => {
  const { manifest, docs } = fixture();
  const c = docs.get("walk")!.data as any;
  c.fps = 0;
  assert.throws(() => validateDocuments(manifest, docs), /animation/);
  c.fps = 6;
  c.frames[0].x = -1;
  assert.throws(() => validateDocuments(manifest, docs), /rectangle/);
});
test("movement bounds, bounded delta, camera edges and animation loops", () => {
  const p = { x: 1900, y: 1 };
  move(p, { x: 1, y: -1 }, 600, 2, 1920, 1280);
  assert.deepEqual(p, { x: 1920, y: 0 });
  assert.deepEqual(cameraFor(1910, 1270, 800, 600, 1920, 1280), {
    x: -1120,
    y: -680,
  });
  assert.equal(frameAt(1.2, 6, 4, true), 3);
  assert.equal(frameAt(5, 6, 4, false), 3);
});
test("real loader pins channel once, ignores hostile URLs, checks document and asset integrity", async () => {
  const original = globalThis.fetch;
  const { manifest, docs } = fixture();
  const asset = new Uint8Array([1, 2, 3, 4]).buffer;
  const sha = await digest(asset);
  manifest.assets[0].sha256 = sha;
  for (const d of docs.values()) {
    d.assets = [sha];
    if (d.kind === "animation") (d.data as any).frames[0].asset = sha;
  }
  const encoded = new Map<string, ArrayBuffer>();
  for (const e of manifest.documents) {
    const b = new TextEncoder().encode(JSON.stringify(docs.get(e.id))).buffer;
    encoded.set(e.id, b);
    e.sha256 = await digest(b);
  }
  const paths: string[] = [];
  let corrupt = false;
  globalThis.fetch = async (input) => {
    const path = String(input);
    paths.push(path);
    let body: any = {};
    if (path.endsWith("/contracts"))
      body = { schemaVersions: [1, 2], schemaSha256: hash };
    else if (path.includes("/channels/")) body = { releaseId: "release" };
    else if (path.endsWith("/releases/release")) body = manifest;
    else if (path.includes("/documents/"))
      return new Response(encoded.get(path.split("/").at(-1)!));
    else if (path.includes("/assets/"))
      return new Response(corrupt ? new Uint8Array([0, 0, 0, 0]) : asset);
    else throw new Error("unexpected path");
    return Response.json(body);
  };
  try {
    assert.equal(
      (await loadContent("https://trusted.invalid")).manifest.id,
      "release",
    );
    assert.equal(paths.filter((p) => p.includes("/channels/")).length, 1);
    assert(paths.every((p) => p.startsWith("https://trusted.invalid/")));
    corrupt = true;
    await assert.rejects(
      loadContent("https://trusted.invalid"),
      /asset integrity/,
    );
    encoded.set("scene", new TextEncoder().encode("{}").buffer);
    await assert.rejects(
      loadContent("https://trusted.invalid"),
      /document integrity/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
