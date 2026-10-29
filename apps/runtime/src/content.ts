import type {
  Manifest,
  ContentDocument,
} from "../../../packages/content-contracts/index";
export type Frame = {
  asset: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type Clip = { fps: number; loop: boolean; frames: Frame[] };
export type EntitySpec = {
  id: string;
  x: number;
  y: number;
  animation: string;
  player?: boolean;
  scale: number;
};
export type SceneSpec = {
  runtimeProfile: "arkodia.pixi-scene.v1";
  width: number;
  height: number;
  spawn: { x: number; y: number };
  speed: number;
  layers: { id: string; objects: EntitySpec[] }[];
  audio?: string;
};
export type Bundle = {
  manifest: Manifest;
  scene: SceneSpec;
  name: string;
  clips: Map<string, Clip>;
  assets: Map<string, { bytes: ArrayBuffer; mediaType: string }>;
  schemaDigest: string;
};
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const HASH = /^[a-f0-9]{64}$/;
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export async function digest(bytes: ArrayBuffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function validateManifest(m: Manifest, expected: string) {
  check(m && m.schemaVersion === 1, "Unsupported release manifest version");
  check(m.id === expected && ID.test(m.id), "Release identity mismatch");
  check(
    Array.isArray(m.documents) &&
      m.documents.length > 0 &&
      m.documents.length <= 32,
    "Invalid document manifest",
  );
  check(
    Array.isArray(m.assets) && m.assets.length <= 64,
    "Invalid asset manifest",
  );
  const ids = new Set<string>();
  for (const e of m.documents) {
    check(
      ID.test(e.id) &&
        !ids.has(e.id) &&
        HASH.test(e.sha256) &&
        Number.isInteger(e.revision) &&
        e.revision > 0,
      "Invalid document entry",
    );
    ids.add(e.id);
    check(
      e.schemaVersion === 1 &&
        ["environment", "animation"].includes(e.kind || ""),
      "Unsupported document contract: only v1 environment/animation",
    );
  }
  check(
    m.assets.reduce((sum, a) => sum + a.size, 0) <= 64 * 1024 * 1024,
    "Release asset budget exceeded",
  );
  const assets = new Set<string>();
  for (const a of m.assets) {
    check(
      HASH.test(a.sha256) &&
        !assets.has(a.sha256) &&
        a.size > 0 &&
        a.size <= 16 * 1024 * 1024,
      "Invalid asset entry",
    );
    assets.add(a.sha256);
    check(
      [
        "image/png",
        "image/webp",
        "image/jpeg",
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "audio/mpeg",
      ].includes(a.mediaType),
      "Unsupported asset media type",
    );
  }
}
export function validateDocuments(
  manifest: Manifest,
  docs: Map<string, ContentDocument>,
) {
  const available = new Set(manifest.assets.map((a) => a.sha256));
  const clips = new Map<string, Clip>();
  let scene: SceneSpec | undefined;
  let name = "";
  for (const e of manifest.documents) {
    const doc = docs.get(e.id);
    check(
      doc && doc.schemaVersion === 1 && doc.kind === e.kind,
      "Document contract differs from manifest",
    );
    check(
      typeof doc.name === "string" && doc.name.length > 0,
      "Invalid document name",
    );
    check(
      Array.isArray(doc.assets) && doc.assets.every((a) => available.has(a)),
      "Document references missing asset",
    );
    if (doc.kind === "animation") {
      const c = doc.data as Clip;
      check(
        Number.isFinite(c.fps) &&
          c.fps > 0 &&
          c.fps <= 60 &&
          typeof c.loop === "boolean" &&
          Array.isArray(c.frames) &&
          c.frames.length > 0 &&
          c.frames.length <= 256,
        "Invalid animation",
      );
      for (const f of c.frames) {
        check(
          doc.assets.includes(f.asset) &&
            available.has(f.asset) &&
            manifest.assets
              .find((a) => a.sha256 === f.asset)
              ?.mediaType.startsWith("image/"),
          "Animation asset absent",
        );
        check(
          [f.x, f.y, f.width, f.height].every(Number.isInteger) &&
            f.x >= 0 &&
            f.y >= 0 &&
            f.width > 0 &&
            f.height > 0,
          "Invalid frame rectangle",
        );
      }
      clips.set(e.id, c);
    } else {
      check(!scene, "Release must contain exactly one environment");
      scene = doc.data as unknown as SceneSpec;
      name = doc.name;
    }
  }
  check(
    scene && scene.runtimeProfile === "arkodia.pixi-scene.v1",
    "Unsupported Pixi scene profile",
  );
  check(
    Number.isInteger(scene.width) &&
      scene.width >= 320 &&
      scene.width <= 8192 &&
      Number.isInteger(scene.height) &&
      scene.height >= 320 &&
      scene.height <= 8192,
    "Invalid scene dimensions",
  );
  const inside = (p: { x: number; y: number }) =>
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= 0 &&
    p.y >= 0 &&
    p.x <= scene!.width &&
    p.y <= scene!.height;
  check(
    inside(scene.spawn) &&
      Number.isFinite(scene.speed) &&
      scene.speed > 0 &&
      scene.speed <= 600,
    "Invalid scene movement",
  );
  check(
    Array.isArray(scene.layers) &&
      scene.layers.length > 0 &&
      scene.layers.length <= 16,
    "Invalid scene layers",
  );
  const ids = new Set<string>();
  const layers = new Set<string>();
  let players = 0;
  for (const l of scene.layers) {
    check(
      ID.test(l.id) &&
        !layers.has(l.id) &&
        Array.isArray(l.objects) &&
        l.objects.length <= 128,
      "Invalid entity layer",
    );
    layers.add(l.id);
    for (const o of l.objects) {
      check(
        ID.test(o.id) &&
          !ids.has(o.id) &&
          inside(o) &&
          clips.has(o.animation) &&
          Number.isFinite(o.scale) &&
          o.scale > 0 &&
          o.scale <= 4 &&
          (o.player === undefined || typeof o.player === "boolean"),
        "Invalid entity or animation binding",
      );
      ids.add(o.id);
      if (o.player) players++;
    }
  }
  check(players === 1, "Scene requires exactly one player");
  if (scene.audio)
    check(
      available.has(scene.audio) &&
        manifest.assets
          .find((a) => a.sha256 === scene!.audio)
          ?.mediaType.startsWith("audio/"),
      "Invalid scene audio",
    );
  return { scene, name, clips };
}
/** Public reads only. Never follows manifest URLs off the trusted Content API origin. */
export async function loadContent(
  base: string,
  channel = "runtime-demo",
  onProgress = (s: string) => {},
  releaseId?: string,
): Promise<Bundle> {
  check(ID.test(channel), "Invalid channel");
  if (releaseId) check(ID.test(releaseId), "Invalid release ID");
  const root = base.replace(/\/$/, "");
  async function bytes(path: string, max: number) {
    const r = await fetch(root + path, {
      signal: AbortSignal.timeout(20000),
      credentials: "omit",
      cache: "no-cache",
    });
    check(r.ok, `Content API request failed (${r.status})`);
    const declared = Number(r.headers.get("content-length"));
    check(!declared || declared <= max, "Content response too large");
    const b = await r.arrayBuffer();
    check(b.byteLength <= max, "Content response too large");
    return b;
  }
  const json = async (path: string) =>
    JSON.parse(new TextDecoder().decode(await bytes(path, 4 * 1024 * 1024)));
  onProgress("Checking published contracts");
  const registry = await json("/v1/contracts");
  check(
    registry.schemaVersions?.includes(1) && HASH.test(registry.schemaSha256),
    "Content API does not support contract v1",
  );
  onProgress("Resolving published release");
  const id = releaseId || (await json(`/v1/channels/${channel}`)).releaseId;
  check(typeof id === "string" && ID.test(id), "Invalid channel pointer");
  const manifest = (await json(`/v1/releases/${id}`)) as Manifest;
  validateManifest(manifest, id);
  const docs = new Map<string, ContentDocument>();
  for (const e of manifest.documents) {
    onProgress(`Verifying document ${e.id}`);
    const b = await bytes(
      `/v1/releases/${id}/documents/${e.id}`,
      4 * 1024 * 1024,
    );
    check(
      (await digest(b)) === e.sha256,
      "Published document integrity mismatch",
    );
    docs.set(e.id, JSON.parse(new TextDecoder().decode(b)));
  }
  const parsed = validateDocuments(manifest, docs);
  const assets: Bundle["assets"] = new Map();
  for (const [i, a] of manifest.assets.entries()) {
    onProgress(`Loading verified assets ${i + 1}/${manifest.assets.length}`);
    const b = await bytes(
      `/v1/releases/${id}/assets/${a.sha256}`,
      16 * 1024 * 1024,
    );
    check(
      b.byteLength === a.size && (await digest(b)) === a.sha256,
      "Published asset integrity mismatch",
    );
    assets.set(a.sha256, { bytes: b, mediaType: a.mediaType });
  }
  return { manifest, ...parsed, assets, schemaDigest: registry.schemaSha256 };
}
