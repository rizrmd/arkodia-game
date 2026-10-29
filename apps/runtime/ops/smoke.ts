import { writeFileSync } from "node:fs";
import { loadContent } from "../src/content";
const origin = process.argv[2] || "https://content.arkodia.online";
const bundle = await loadContent(origin, "runtime-demo", (s) => console.log(s));
const evidence = {
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
};
console.log(JSON.stringify(evidence, null, 2));
if (process.env.EVIDENCE_FILE)
  writeFileSync(
    process.env.EVIDENCE_FILE,
    JSON.stringify(evidence, null, 2) + "\n",
  );
