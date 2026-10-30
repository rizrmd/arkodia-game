// Static runtime and allowlisted public-read gateway. No authorization is forwarded.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
const root = resolve(
  process.env.RUNTIME_DIR || fileURLToPath(new URL("./dist", import.meta.url)),
);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
};
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
    const file = resolve(
      root,
      "." + decodeURIComponent(path === "/" ? "/index.html" : path),
    );
    if (!file.startsWith(root + sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!(await stat(file)).isFile()) throw new Error("missing");
    const bytes = await readFile(file);
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
