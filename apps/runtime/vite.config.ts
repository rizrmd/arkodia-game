import { cpSync, existsSync } from "node:fs";
import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
export default defineConfig({
  define: { __COMMIT__: JSON.stringify(commit) },
  plugins: [
    {
      name: "arkodia-runtime-content-lock",
      closeBundle() {
        if (existsSync("../../assets.lock.json"))
          cpSync("../../assets.lock.json", "dist/assets.lock.json");
        if (existsSync("../../asset-lock"))
          cpSync("../../asset-lock", "dist/asset-lock", { recursive: true });
      },
    },
  ],
  server: {
    proxy: {
      "/content": {
        target: "https://content.arkodia.online",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/content/, ""),
      },
    },
  },
  build: { sourcemap: false, rollupOptions: { preserveEntrySignatures: "strict", input: { main: "index.html", "hero-renderer": "src/hero-renderer.ts" }, output: { entryFileNames: chunk => chunk.name === "hero-renderer" ? "assets/hero-renderer.js" : "assets/[name]-[hash].js" } } },
});
