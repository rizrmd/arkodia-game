// Static runtime and allowlisted public-read gateway. No authorization is forwarded.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
const root = resolve(
  process.env.RUNTIME_DIR || fileURLToPath(new URL("./dist", import.meta.url)),
);
const mime = {
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
};
let loadedManifestKey = "";
const contentAssets = new Map();
const ENV_RUNTIME_ASSETS = {
  "/terrain-height/natural/snow-cliff-crisp-v3.png": {
    sha256: "d10cedc68a970c196b39a4504c36e536a602b59d2be21bc13c8e4b046397a2d0",
    size: 2369849,
    releaseId: "2d228b50387522520e0d2e70c77fd9ea",
  },
  "/frozen-frontier/game/atlas-5083a8ebd8c8bb4b.webp": {
    sha256: "5083a8ebd8c8bb4bb4fccc0dcaaa9f71deb9821af1648fbf053506c37617961c",
    size: 1221014,
    releaseId: "65a1789db23220a150bc1257cd15b001",
  },
  "/terrain-height/natural/cliff-strip-v2.webp": {
    sha256: "0349a1d72597a28387965448fe59406ac45115072e70cf931fc577da4817409c",
    size: 1069210,
    releaseId: "65a1789db23220a150bc1257cd15b001",
  },
  "/foundation-transitions/soil-moss.png": {
    sha256: "7ec12a875ba46d0950d126165d842142bbc60a92616ceba78df853c02e0a4ad7",
    size: 175072,
    releaseId: "65a1789db23220a150bc1257cd15b001",
  },
  "/foundation-transitions/moss.png": {
    sha256: "d8a264e1901c2cbbfbbdce9b6169d7ca0e00f5249e2216365497110fe20fbcb1",
    size: 91209,
    releaseId: "65a1789db23220a150bc1257cd15b001",
  },
  "/realistic-torch/frame-0.webp": {
    sha256: "1a29e76bd0150a5a75182846245088ddb4048c99f0af1cc6bf45dc0d34f0fad2",
    size: 29538,
    releaseId: "65a1789db23220a150bc1257cd15b001",
  },
  "/realistic-torch/frame-1.webp": {
    sha256: "3aacd2652597aad56249fbb1b454e3e93b583e5f5ee577a5dfbee18d0291dc63",
    size: 29156,
    releaseId: "65a1789db23220a150bc1257cd15b001",
  },
  "/realistic-torch/frame-2.webp": {
    sha256: "5f617cec82c413bd7320aca32d403f3511e9cf74519b7fe7fcfb592a7a2e4659",
    size: 28708,
    releaseId: "65a1789db23220a150bc1257cd15b001",
  },
};
async function getContentAsset(pathname) {
  const normalized = pathname.startsWith("/assets/")
    ? pathname.slice("/assets".length)
    : pathname;
  const envEntry = ENV_RUNTIME_ASSETS[normalized];
  if (envEntry) {
    return {
      sha256: envEntry.sha256,
      size: envEntry.size,
      source: {
        origin: "https://content.arkodia.online",
        releaseId: envEntry.releaseId,
        type: "content",
      },
    };
  }
  for (const candidate of [
    resolve(root, "asset-lock/part-000.json"),
    resolve(root, "../../asset-lock/part-000.json"),
    fileURLToPath(new URL("../../../asset-lock/part-000.json", import.meta.url)),
  ]) {
    const st = await stat(candidate).catch(() => null);
    if (!st) continue;
    const key = `${candidate}:${st.mtimeMs}:${st.size}`;
    if (key !== loadedManifestKey) {
      const parsed = JSON.parse(await readFile(candidate, "utf8"));
      contentAssets.clear();
      for (const e of parsed.assets || []) {
        if (
          e.path?.startsWith("apps/runtime/public/") &&
          e.source?.type === "content"
        )
          contentAssets.set(
            "/" + e.path.slice("apps/runtime/public/".length),
            e,
          );
      }
      loadedManifestKey = key;
    }
    break;
  }
  return contentAssets.get(pathname);
}
const assetCache = new Map();
async function fetchContentAsset(entry) {
  const cached = assetCache.get(entry.sha256);
  if (cached) return cached;
  for (const base of [
    "https://arkodia-content-api-arkodia.fural.space",
    entry.source.origin,
  ]) {
    try {
      const r = await fetch(
        `${base}/v1/releases/${entry.source.releaseId}/assets/${entry.sha256}`,
        { signal: AbortSignal.timeout(20000), redirect: "error" },
      );
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (
        buf.length === entry.size &&
        createHash("sha256").update(buf).digest("hex") === entry.sha256
      ) {
        assetCache.set(entry.sha256, buf);
        return buf;
      }
    } catch {}
  }
  throw Object.assign(new Error("missing"), { code: "ENOENT" });
}
export function publicPath(path) {
  return /^\/v1\/(contracts|channels\/[A-Za-z0-9_-]{1,100}|releases\/[A-Za-z0-9_-]{1,100}(\/(documents\/[A-Za-z0-9_-]{1,100}|assets\/[a-f0-9]{64}))?)$/.test(
    path,
  );
}
export const server = http.createServer(async (req, res) => {
  try {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Access-Control-Allow-Origin", "https://editor.arkodia.online");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' https://editor.arkodia.online blob: data:; connect-src 'self' https://editor.arkodia.online; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'self'",
    );
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    const path = new URL(req.url, "http://runtime").pathname;
    // Bootstrap readiness only. Artifact installation still verifies the exact public build SHA.
    if (path === "/" && !(await stat(resolve(root, "index.html")).catch(() => null))) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify({ status: "initializing" }));
      return;
    }
    if (path.startsWith("/content/")) {
      const upstream = path.slice(8);
      if (!publicPath(upstream)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const r = await fetch("https://arkodia-content-api-arkodia.fural.space" + upstream, {
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      });
      res.writeHead(r.status, {
        "Content-Type": r.headers.get("content-type") || "application/json",
        "Cache-Control": !r.ok
          ? "no-store"
          : upstream.includes("/releases/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
      });
      if (req.method === "HEAD") {
        await r.body?.cancel();
        res.end();
        return;
      }
      const { Readable } = await import("node:stream");
      Readable.fromWeb(r.body)
        .on("error", () => res.destroy())
        .pipe(res);
      return;
    }
    const decoded = decodeURIComponent(path === "/" ? "/index.html" : path);
    const file = resolve(root, "." + decoded);
    if (!file.startsWith(root + sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const bytes = await readFile(file).catch(async (err) => {
      const entry = await getContentAsset(decoded);
      if (!entry) throw err;
      return fetchContentAsset(entry);
    });
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Cache-Control": path.startsWith("/assets/") && !path.endsWith("hero-renderer.js")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(e?.code === "ENOENT" ? 404 : 502, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ error: "runtime_resource_unavailable" }));
    } else res.destroy();
  }
});
if (process.argv[1] === fileURLToPath(import.meta.url))
  server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
    console.log("Standalone Pixi runtime listening"),
  );
