import { loadContent } from "../src/content";
const origin = process.argv[2] || "https://content.arkodia.online";
const bundle = await loadContent(origin, "runtime-demo", (s) => console.log(s));
console.log(
  JSON.stringify(
    {
      status: "PASS",
      origin,
      release: bundle.manifest.id,
      schemaDigest: bundle.schemaDigest,
      documents: bundle.manifest.documents.map((d) => ({
        id: d.id,
        sha256: d.sha256,
      })),
      assets: bundle.manifest.assets.map((a) => ({
        sha256: a.sha256,
        size: a.size,
      })),
      entities: bundle.scene.layers.flatMap((l) => l.objects).map((o) => o.id),
      checks: [
        "real consumer loader",
        "contract and profile compatibility",
        "release pinning",
        "document and asset SHA-256",
        "entity/clip bindings",
      ],
    },
    null,
    2,
  ),
);
