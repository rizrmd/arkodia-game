import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { loadPublished } from "../src/published";
import { digest } from "../src/content";
Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});
test("explicit v2 loader pins release and preserves SHA/size checks and trusted paths", async () => {
  const encoder = new TextEncoder(),
    asset = new Uint8Array([1, 2, 3]).buffer,
    sha = await digest(asset);
  const make = (kind: string, format: string) => ({
    schemaVersion: 2,
    kind,
    name: "Fixture",
    assets: [sha],
    data: { format, payload: {}, bindings: { "/fixture.png": sha } },
  });
  const raw = [
    encoder.encode(
      JSON.stringify(make("base", "arkadia.stronghold-prefab.v1")),
    ),
    encoder.encode(
      JSON.stringify(make("asset-manifest", "arkadia.asset-manifest.v1")),
    ),
  ];
  const manifest = {
    schemaVersion: 1,
    id: "pinned",
    documents: await Promise.all(
      raw.map(async (b, i) => ({
        id: "doc-" + i,
        revision: 1,
        schemaVersion: 2,
        kind: i ? "asset-manifest" : "base",
        format: i
          ? "arkadia.asset-manifest.v1"
          : "arkadia.stronghold-prefab.v1",
        sha256: await digest(b.buffer),
        url: "https://hostile.invalid",
      })),
    ),
    assets: [
      {
        sha256: sha,
        size: 3,
        mediaType: "image/png",
        url: "https://hostile.invalid",
      },
    ],
  };
  const original = globalThis.fetch;
  const requested: string[] = [];
  let corruption = false,
    version = 2;
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    requested.push(path);
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.redirect, "error");
    if (path.endsWith("/contracts"))
      return Response.json({
        schemaVersions: [1, 2],
        schemaSha256: "a".repeat(64),
      });
    if (path.endsWith("/channels/stronghold-original"))
      return Response.json({ releaseId: "pinned" });
    if (path.endsWith("/releases/pinned"))
      return Response.json({
        ...manifest,
        documents: manifest.documents.map((d) => ({
          ...d,
          schemaVersion: version,
        })),
      });
    const i = path.endsWith("/doc-0") ? 0 : path.endsWith("/doc-1") ? 1 : -1;
    if (i >= 0) return new Response(raw[i]);
    return new Response(corruption ? new Uint8Array([2, 2, 3]) : asset);
  };
  try {
    const result = await loadPublished(
      "/content",
      "stronghold-original",
      () => {},
    );
    assert.equal(result.manifest.id, "pinned");
    assert.equal(result.assets.size, 1);
    assert.equal(requested.filter((p) => p.includes("/channels/")).length, 1);
    assert.ok(requested.every((p) => p.startsWith("/content/")));
    corruption = true;
    await assert.rejects(
      loadPublished("/content", "stronghold-original", () => {}),
      /integrity/,
    );
    corruption = false;
    version = 99;
    await assert.rejects(
      loadPublished("/content", "stronghold-original", () => {}),
      /Unsupported document/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
