// Operator-only ordinary author/publisher workflow. Execute in Content API sandbox; never export credentials.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
const source = JSON.parse(
  readFileSync(`${process.env.HOME}/private/stronghold-source.json`),
);
const config = JSON.parse(
  readFileSync(`${process.env.HOME}/private/content.env.json`),
);
const hash = (b) => createHash("sha256").update(b).digest("hex");
async function request(method, path, body, token, expected = 200, attempt = 0) {
  const bytes = Buffer.isBuffer(body)
    ? body
    : body === undefined
      ? undefined
      : JSON.stringify(body);
  const headers = {
    "Idempotency-Key": `stronghold-first-v1-${method}-${path}-${hash(bytes || "").slice(0, 20)}`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !Buffer.isBuffer(body))
    headers["Content-Type"] = "application/json";
  const r = await fetch("https://content.arkodia.online" + path, {
    method,
    headers,
    body: bytes,
    signal: AbortSignal.timeout(60000),
  });
  const result = await r.json();
  if (
    r.status === 409 &&
    result.error === "transaction_conflict_retry" &&
    attempt < 4
  ) {
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    return request(method, path, body, token, expected, attempt + 1);
  }
  if (r.status !== expected)
    throw Error(`${method} ${path}: ${r.status} ${JSON.stringify(result)}`);
  return result;
}
const entries = [];
const queue = Object.entries(source.paths);
let cursor = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cursor < queue.length) {
      const [path, sha] = queue[cursor++];
      const b = readFileSync(
        `${process.env.HOME}/private/stronghold-assets${path}`,
      );
      if (hash(b) !== sha) throw Error(`Original source changed: ${path}`);
      const a = await request(
        "POST",
        "/v1/assets",
        b,
        config.CONTENT_API_AUTHOR_TOKEN,
        201,
      );
      if (a.sha256 !== sha) throw Error("Upload integrity mismatch");
      entries.push({ path, ...a });
      writeFileSync(
        `${process.env.HOME}/private/stronghold-upload-entries.json`,
        JSON.stringify(entries),
      );
    }
  }),
);
entries.sort((a, b) => a.path.localeCompare(b.path));
function doc(
  kind,
  format,
  name,
  payload,
  bindings,
  sourcePath,
  selector,
  legacyId,
) {
  return {
    schemaVersion: 2,
    kind,
    name,
    assets: [...new Set(Object.values(bindings))],
    dependencies: [],
    provenance: {
      repository: "arkadia",
      sourcePath,
      selector,
      sourceSha256: source.sources[sourcePath],
      legacyId,
    },
    data: { format, payload, bindings },
  };
}
const allBindings = Object.fromEntries(entries.map((a) => [a.path, a.sha256]));
const documents = [
  [
    "stronghold-original-prefab",
    doc(
      "base",
      "arkadia.stronghold-prefab.v1",
      "Original Stronghold prefab",
      source.prefab,
      {},
      "src/stronghold/prefabs/stronghold.json",
      "$",
      "stronghold",
    ),
  ],
];
const presentation = {
  runtimeProfile: "arkodia.stronghold-presentation.v1",
  characters: source.characters,
  entries: entries.map(({ path, sha256, size, mediaType }) => ({
    path,
    sha256,
    size,
    mediaType,
  })),
  ui: source.ui,
  fonts: source.fonts,
  props: source.props,
  nav: source.nav,
  sourceCommit: source.sourceCommit,
  sources: source.sources,
};
documents.push([
  "stronghold-original-presentation",
  doc(
    "asset-manifest",
    "arkadia.asset-manifest.v1",
    "Original Stronghold presentation",
    presentation,
    allBindings,
    "public/assets/choose-hero/manifest.json",
    "$",
    "stronghold-first-presentation",
  ),
]);
const selections = [];
for (const [id, document] of documents) {
  let existing;
  try {
    existing = await request(
      "GET",
      `/v1/drafts/${id}`,
      undefined,
      config.CONTENT_API_AUTHOR_TOKEN,
    );
  } catch (e) {
    if (!e.message.includes(": 404 ")) throw e;
  }
  if (
    existing &&
    existing.document.provenance.legacyId !== document.provenance.legacyId
  )
    throw Error("Existing draft identity differs; refusing overwrite");
  const saved =
    existing && isDeepStrictEqual(existing.document, document)
      ? existing
      : await request(
          "PUT",
          `/v1/drafts/${id}`,
          { revision: existing?.revision || 0, document },
          config.CONTENT_API_AUTHOR_TOKEN,
        );
  const loaded = await request(
    "GET",
    `/v1/drafts/${id}`,
    undefined,
    config.CONTENT_API_AUTHOR_TOKEN,
  );
  if (
    saved.revision !== loaded.revision ||
    !isDeepStrictEqual(saved.document, loaded.document)
  )
    throw Error("Draft Save/reload mismatch");
  selections.push({ id, revision: saved.revision });
  console.log(`Saved/reloaded ${id}`);
}
const release = await request(
  "POST",
  "/v1/releases",
  { channel: "stronghold-original", documents: selections },
  config.CONTENT_API_PUBLISHER_TOKEN,
  201,
);
for (const d of release.documents) {
  const r = await fetch(
    `https://content.arkodia.online/v1/releases/${release.id}/documents/${d.id}`,
  );
  if (hash(Buffer.from(await r.arrayBuffer())) !== d.sha256)
    throw Error("Public snapshot integrity mismatch");
}
const evidence = {
  releaseId: release.id,
  channel: "stronghold-original",
  sourceCommit: source.sourceCommit,
  documents: release.documents,
  assets: release.assets,
  checks: [
    "all original source asset hashes",
    "ordinary asset POST",
    "author Save/reload",
    "publisher release",
    "public immutable snapshot hashes",
  ],
};
writeFileSync(
  `${process.env.HOME}/private/stronghold-publication.json`,
  JSON.stringify(evidence, null, 2),
);
console.log(
  JSON.stringify({
    status: "PASS",
    releaseId: release.id,
    documents: release.documents.length,
    assets: release.assets.length,
  }),
);
