import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";
const origin = process.argv[2] || "http://127.0.0.1:3099";
const out = resolve(process.env.EVIDENCE_DIR || "../../docs/runtime/evidence");
await mkdir(out, { recursive: true });
let server;
if (!process.argv[2]) {
  server = spawn(process.execPath, ["ops/server.mjs"], {
    env: { ...process.env, PORT: "3099", RUNTIME_DIR: resolve("dist") },
    stdio: "inherit",
  });
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
}
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${process.env.HOME}/.local/browser-libs/usr/lib/x86_64-linux-gnu`,
    },
    executablePath:
      process.env.CHROMIUM_PATH ||
      `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGE ERROR", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE", m.text());
  });
  page.on("request", (r) =>
    requests.push({
      url: r.url(),
      method: r.method(),
      hasAuthorization: !!r.headers().authorization,
    }),
  );
  await page.goto(origin);
  await page.waitForFunction(
    () => ["ready", "error"].includes(window.__ARKODIA_RUNTIME__?.state),
    {},
    { timeout: 25000 },
  );
  console.log("INITIAL", await page.evaluate(() => window.__ARKODIA_RUNTIME__));
  assert.equal(
    (await page.evaluate(() => window.__ARKODIA_RUNTIME__)).state,
    "ready",
  );
  const read = () => page.evaluate(() => window.__ARKODIA_RUNTIME__);
  const before = await read();
  assert.equal(before.assetCount, 3);
  assert.equal(before.entities.length, 7);
  assert.equal(await page.locator("canvas").count(), 1);
  assert.equal(await page.locator("button,input,select,textarea").count(), 0);
  await page.keyboard.down("d");
  await page.waitForTimeout(700);
  await page.keyboard.up("d");
  const after = await read();
  assert(after.player.x > before.player.x + 50);
  assert(after.camera.x < before.camera.x);
  await page.mouse.click(1100, 390);
  await page.waitForTimeout(500);
  const clicked = await read();
  assert(clicked.player.x > after.player.x);
  await page.mouse.click(1190, 36);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__.sound === "Sound on",
  );
  await page.mouse.click(1190, 36);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__.sound === "Sound off",
  );
  await page.screenshot({ path: out + "/desktop.png" });
  // A real retry after an injected network failure, with Pixi hit testing.
  await page.route("**/content/v1/channels/**", (r) =>
    r.fulfill({
      status: 503,
      body: '{"error":"test_outage"}',
      contentType: "application/json",
    }),
  );
  await page.mouse.click(1190, 764);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__.state === "error",
  );
  const failed = await read();
  await page.screenshot({ path: out + "/error.png" });
  await page.unroute("**/content/v1/channels/**");
  await page.mouse.click(90, 470);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__.state === "ready",
    {},
    { timeout: 60000 },
  );
  // Loading state and contract rejection are exercised through the deployed consumer.
  await page.route("**/content/v1/channels/**", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await r.continue();
  });
  await page.mouse.click(1190, 764);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__.state === "loading",
  );
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__.state === "ready",
    {},
    { timeout: 60000 },
  );
  await page.unroute("**/content/v1/channels/**");
  await page.route("**/content/v1/releases/*", async (r) => {
    if (/\/releases\/[A-Za-z0-9_-]+$/.test(r.request().url())) {
      const upstream = await r.fetch();
      const m = await upstream.json();
      m.schemaVersion = 99;
      await r.fulfill({ response: upstream, json: m });
    } else await r.continue();
  });
  await page.mouse.click(1190, 764);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__.state === "error",
  );
  assert.match((await read()).message, /Unsupported release manifest version/);
  await page.unroute("**/content/v1/releases/*");
  await page.mouse.click(90, 470);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__.state === "ready",
    {},
    { timeout: 60000 },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + "/mobile.png" });
  assert.equal((await read()).state, "ready");
  const apiRequests = requests.filter((r) => r.url.includes("/content/"));
  assert(apiRequests.length > 0);
  assert(apiRequests.every((r) => r.method === "GET" && !r.hasAuthorization));
  assert(apiRequests.every((r) => !r.url.includes("/drafts")));
  assert.equal(errors.length, 0, errors.join("\n"));
  const proof = {
    status: "PASS",
    origin,
    commit: before.commit,
    release: before.release,
    schemaDigest: before.schemaDigest,
    before,
    after,
    clicked,
    errorState: failed.message,
    checks: [
      "Pixi canvas only",
      "7 content-driven entities",
      "keyboard movement",
      "camera follow",
      "pointer movement",
      "audio gesture toggle",
      "503 error and successful Pixi retry",
      "loading state",
      "unsupported manifest rejection",
      "mobile viewport",
      "no page errors",
      "only credential-free public GET requests",
    ],
    apiRequests,
  };
  await writeFile(out + "/browser.json", JSON.stringify(proof, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: proof.status,
      origin,
      commit: before.commit,
      release: before.release,
      checks: proof.checks,
    }),
  );
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
}
