// Operator-only: run inside Content API sandbox. Tokens never leave its private config.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const config = JSON.parse(
  readFileSync(`${process.env.HOME}/private/content.env.json`, "utf8"),
);
const origin = "https://content.arkodia.online";
async function request(method, path, body, token, expected = 200) {
  const headers = {
    "Idempotency-Key": `runtime-demo-v1-${method}-${path}-${createHash("sha256")
      .update(Buffer.isBuffer(body) ? body : JSON.stringify(body) || "")
      .digest("hex")
      .slice(0, 20)}`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(origin + path, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(30000),
  });
  const result = await r.json();
  if (r.status !== expected)
    throw new Error(`${method} ${path}: ${r.status} ${result.error}`);
  return result;
}
async function asset(path) {
  const r = await fetch("https://arkodia.online" + path, {
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Existing test asset unavailable: ${path}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  const a = await request(
    "POST",
    "/v1/assets",
    bytes,
    config.CONTENT_API_AUTHOR_TOKEN,
    201,
  );
  if (a.sha256 !== createHash("sha256").update(bytes).digest("hex"))
    throw new Error("Upload digest mismatch");
  return { a, bytes, path };
}
const hero = await asset("/assets/characters/hero.png"),
  tree = await asset("/starter-wilds-review/v1/golden-tree.png");
// Deterministic quiet test chime, not a gameplay soundtrack.
const samples = 22050 * 2,
  wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(22050, 24);
wav.writeUInt32LE(44100, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++)
  wav.writeInt16LE(
    Math.round(
      Math.sin((i / 22050) * 2 * Math.PI * 220) * Math.exp(-i / 6000) * 1500,
    ),
    44 + i * 2,
  );
const audio = {
  a: await request(
    "POST",
    "/v1/assets",
    wav,
    config.CONTENT_API_AUTHOR_TOKEN,
    201,
  ),
  path: "synthetic:test-chime-220Hz-2s",
  bytes: wav,
};
const manifest = await (
  await fetch("https://arkodia.online/assets/characters/manifest.json")
).json();
const atlas = manifest.characters.hero;
const frame = (i) => {
  const f = atlas.frames[i];
  return { asset: hero.a.sha256, x: f.x, y: f.y, width: f.w, height: f.h };
};
const documents = [
  [
    "runtime-demo-walk",
    {
      schemaVersion: 1,
      kind: "animation",
      name: "Test knight walk",
      assets: [hero.a.sha256],
      data: {
        fps: atlas.clips.move.fps,
        loop: true,
        frames: atlas.clips.move.frames.map(frame),
      },
    },
  ],
  [
    "runtime-demo-tree",
    {
      schemaVersion: 1,
      kind: "animation",
      name: "Test golden tree",
      assets: [tree.a.sha256],
      data: {
        fps: 1,
        loop: true,
        frames: [
          {
            asset: tree.a.sha256,
            x: 0,
            y: 0,
            width: tree.bytes.readUInt32BE(16),
            height: tree.bytes.readUInt32BE(20),
          },
        ],
      },
    },
  ],
  [
    "runtime-demo-grove",
    {
      schemaVersion: 1,
      kind: "environment",
      name: "The Published Grove",
      assets: [hero.a.sha256, tree.a.sha256, audio.a.sha256],
      data: {
        runtimeProfile: "arkodia.pixi-scene.v1",
        width: 1920,
        height: 1280,
        spawn: { x: 960, y: 640 },
        speed: 230,
        audio: audio.a.sha256,
        layers: [
          {
            id: "inhabitants",
            objects: [
              {
                id: "knight",
                x: 960,
                y: 640,
                animation: "runtime-demo-walk",
                player: true,
                scale: 0.8,
              },
              ...[
                { x: 450, y: 430 },
                { x: 1450, y: 440 },
                { x: 480, y: 1060 },
                { x: 1470, y: 1000 },
                { x: 780, y: 320 },
                { x: 1150, y: 1150 },
              ].map((p, i) => ({
                id: `tree-${i}`,
                animation: "runtime-demo-tree",
                scale: 0.35,
                ...p,
              })),
            ],
          },
        ],
      },
    },
  ],
];
const selections = [];
for (const [id, document] of documents) {
  const saved = await request(
    "PUT",
    `/v1/drafts/${id}`,
    { revision: 0, document },
    config.CONTENT_API_AUTHOR_TOKEN,
  );
  if (saved.revision !== 1) throw new Error("Unexpected save revision");
  const loaded = await request(
    "GET",
    `/v1/drafts/${id}`,
    undefined,
    config.CONTENT_API_AUTHOR_TOKEN,
  );
  if (loaded.revision !== saved.revision) throw new Error("Save/load mismatch");
  selections.push({ id, revision: saved.revision });
}
const release = await request(
  "POST",
  "/v1/releases",
  { channel: "runtime-demo", documents: selections },
  config.CONTENT_API_PUBLISHER_TOKEN,
  201,
);
for (const e of release.documents) {
  const r = await fetch(e.url);
  const b = Buffer.from(await r.arrayBuffer());
  if (createHash("sha256").update(b).digest("hex") !== e.sha256)
    throw new Error("Public snapshot integrity mismatch");
}
const evidence = {
  status: "PASS",
  channel: "runtime-demo",
  releaseId: release.id,
  documents: release.documents.map(({ id, revision, sha256 }) => ({
    id,
    revision,
    sha256,
  })),
  assets: release.assets.map(({ sha256, size, mediaType }) => ({
    sha256,
    size,
    mediaType,
  })),
  sources: [hero, tree, audio].map((x) => ({
    url: x.path.startsWith("synthetic:")
      ? x.path
      : "https://arkodia.online" + x.path,
    sha256: x.a.sha256,
  })),
  checks: [
    "ordinary asset POST",
    "author draft Save",
    "author draft reload",
    "publisher immutable release",
    "unauthenticated public document hashes",
  ],
};
writeFileSync(
  `${process.env.HOME}/private/runtime-demo-evidence.json`,
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence));
