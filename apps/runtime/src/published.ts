import { digest } from "./content";
import type { Manifest } from "../../../packages/content-contracts/index";
import type { LegacyDocument } from "../../../packages/content-contracts/legacy-types";
export function requireContent(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error(message);
}
const ID = /^[A-Za-z0-9_-]{1,100}$/,
  HASH = /^[a-f0-9]{64}$/;
const SUPPORTED: Record<string, string> = {
  "arkadia.stronghold-prefab.v1": "base",
  "arkadia.asset-manifest.v1": "asset-manifest",
};
export type Published = {
  manifest: Manifest;
  documents: Map<string, LegacyDocument>;
  assets: Map<string, { bytes: ArrayBuffer; mediaType: string }>;
  schemaDigest: string;
};
/** Explicit v2 adapter; old v1 consumer continues to reject v2. URLs are constructed locally, never followed from content. */
export async function loadPublished(
  base: string,
  channel: string,
  progress: (text: string) => void,
  release?: string,
  onAsset?: (
    path: string,
    bytes: ArrayBuffer,
    mediaType: string,
  ) => Promise<void>,
): Promise<Published> {
  const check: typeof requireContent = requireContent;
  check(
    ID.test(channel) && (!release || ID.test(release)),
    "Invalid release/channel identity",
  );
  const bytes = async (path: string, max: number) => {
    const r = await fetch(base + path, {
      credentials: "omit",
      redirect: "error",
      cache: "no-cache",
      signal: AbortSignal.timeout(30000),
    });
    check(r.ok, `Content API request failed (${r.status})`);
    const length = Number(r.headers.get("content-length"));
    check(!length || length <= max, "Content response exceeds budget");
    const b = await r.arrayBuffer();
    check(b.byteLength <= max, "Content response exceeds budget");
    return b;
  };
  const json = async (path: string) =>
    JSON.parse(new TextDecoder().decode(await bytes(path, 4 * 1024 * 1024)));
  progress("Checking published contracts");
  const registry = await json("/v1/contracts");
  check(
    registry.schemaVersions?.includes(2) && HASH.test(registry.schemaSha256),
    "Content API v2 unavailable",
  );
  const id = release || (await json(`/v1/channels/${channel}`)).releaseId;
  check(typeof id === "string" && ID.test(id), "Invalid channel pointer");
  const m: Manifest = await json(`/v1/releases/${id}`);
  check(m.schemaVersion === 1 && m.id === id, "Unsupported release manifest");
  check(
    Array.isArray(m.documents) &&
      m.documents.length === 2 &&
      Array.isArray(m.assets) &&
      m.assets.length <= 96,
    "Invalid Stronghold release cardinality",
  );
  const docIDs = new Set<string>(),
    assetIDs = new Set<string>();
  let total = 0;
  for (const a of m.assets) {
    check(
      HASH.test(a.sha256) &&
        !assetIDs.has(a.sha256) &&
        Number.isInteger(a.size) &&
        a.size > 0 &&
        a.size <= 16 * 1024 * 1024 &&
        ["image/png", "image/webp", "image/jpeg"].includes(a.mediaType),
      "Invalid Stronghold asset",
    );
    assetIDs.add(a.sha256);
    total += a.size;
  }
  check(total <= 128 * 1024 * 1024, "Stronghold asset budget exceeded");
  const documents: Published["documents"] = new Map();
  for (const e of m.documents) {
    check(
      ID.test(e.id) &&
        !docIDs.has(e.id) &&
        HASH.test(e.sha256) &&
        Number.isInteger(e.revision) &&
        e.revision > 0 &&
        e.schemaVersion === 2 &&
        typeof e.format === "string" &&
        SUPPORTED[e.format] === e.kind,
      "Unsupported document version/format",
    );
    docIDs.add(e.id);
    progress(`Verifying ${e.id}`);
    const b = await bytes(
      `/v1/releases/${id}/documents/${e.id}`,
      4 * 1024 * 1024,
    );
    check(
      (await digest(b)) === e.sha256,
      "Published document integrity mismatch",
    );
    const d = JSON.parse(new TextDecoder().decode(b)) as LegacyDocument;
    check(
      d.schemaVersion === 2 &&
        d.kind === e.kind &&
        d.data?.format === e.format &&
        Array.isArray(d.assets) &&
        d.assets.every((a) => assetIDs.has(a)) &&
        d.data.bindings &&
        Object.values(d.data.bindings).every((a) => d.assets.includes(a)),
      "Document/manifest binding mismatch",
    );
    documents.set(e.id, d);
  }
  const presentation = [...documents.values()].find(
    (d) => d.data.format === "arkadia.asset-manifest.v1",
  );
  const bindings = presentation?.data.bindings || {};
  const loading = [
    "/typography/v2/loading/bg-desktop.webp",
    "/typography/v2/loading/bg-mobile.webp",
    "/typography/v2/loading/logo@1x.png",
    "/typography/v2/loading/bar-track@1x.png",
    "/typography/v2/loading/bar-fill@1x.png",
  ];
  m.assets.sort(
    (a, b) =>
      (loading.includes(
        Object.keys(bindings).find((p) => bindings[p] === a.sha256) || "",
      )
        ? -1
        : 0) -
      (loading.includes(
        Object.keys(bindings).find((p) => bindings[p] === b.sha256) || "",
      )
        ? -1
        : 0),
  );
  const assets: Published["assets"] = new Map();
  // Four bounded workers keep mobile startup responsive without unbounded parallel image downloads.
  let cursor = 0,
    done = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < m.assets.length) {
        const a = m.assets[cursor++];
        const b = await bytes(
          `/v1/releases/${id}/assets/${a.sha256}`,
          16 * 1024 * 1024,
        );
        check(
          b.byteLength === a.size && (await digest(b)) === a.sha256,
          "Published asset integrity mismatch",
        );
        assets.set(a.sha256, { bytes: b, mediaType: a.mediaType });
        if (onAsset) {
          const path = Object.keys(bindings).find(
            (p) => bindings[p] === a.sha256,
          );
          if (path) await onAsset(path, b, a.mediaType);
        }
        progress(`Loading artwork · ${++done}/${m.assets.length}`);
      }
    }),
  );
  return {
    manifest: m,
    documents,
    assets,
    schemaDigest: registry.schemaSha256,
  };
}
