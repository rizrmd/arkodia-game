import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = process.argv[2] || "http://127.0.0.1:3099";
const out = resolve("../../docs/runtime/stronghold/evidence");
await mkdir(out, { recursive: true });
let server, browser;
try {
  if (!process.argv[2]) {
    server = spawn(process.execPath, ["ops/server.mjs"], {
      env: { ...process.env, PORT: "3099", RUNTIME_DIR: resolve("dist") },
      stdio: "inherit",
    });
    await new Promise((r) => setTimeout(r, 500));
  }
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
    viewport: { width: 1440, height: 900 },
  });
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE", m.text());
  });
  page.on("request", (r) =>
    requests.push({
      url: r.url(),
      method: r.method(),
      authorization: !!r.headers().authorization,
    }),
  );
  const diag = () => page.evaluate(() => window.__ARKODIA_RUNTIME__);
  await page.goto(origin + "/?hero=reset");
  await page.waitForFunction(
    () => ["selecting", "error"].includes(window.__ARKODIA_RUNTIME__?.state),
    null,
    { timeout: 180000 },
  );
  console.log("INITIAL", JSON.stringify(await diag()));
  assert.equal((await diag()).state, "selecting");
  assert.equal(await page.locator("canvas").count(), 1);
  assert.equal(await page.locator("button,input,select").count(), 0);
  await page.screenshot({ path: out + "/picker-desktop.png" });
  assert.equal(
    (await diag()).highlights.length,
    7,
    "original UI highlight recipes loaded",
  );
  const targets = (await diag()).picker;
  await page.mouse.click(...targets.cards["ember-warden"]);
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__?.state === "ready",
  );
  let a = await diag();
  assert.equal(a.hero, "ember-warden");
  await page.screenshot({ path: out + "/world-desktop.png" });
  await page.keyboard.down("d");
  await page.waitForFunction(
    (x) => window.__ARKODIA_RUNTIME__?.player?.x > x + 35,
    a.player.x,
    { timeout: 15000 },
  );
  await page.keyboard.up("d");
  let b = await diag();
  assert.ok(b.player.x > a.player.x + 30, "keyboard movement");
  assert.ok(b.clip.includes("E"), "direction animation");
  // Route around the original campfire using an actual visible ground click.
  const routeStart = await diag();
  await page.mouse.click(
    routeStart.camera.x + 577 * routeStart.camera.scale,
    routeStart.camera.y + 240 * routeStart.camera.scale,
  );
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__.player.y < 246,
    null,
    { timeout: 45000 },
  );
  // Pan so the gateway exit is on-screen, then click a real target through its arch.
  await page.mouse.move(300, 700);
  await page.mouse.down();
  await page.mouse.move(300, 100, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const gateStart = await diag();
  const gateTarget = {
    x: gateStart.camera.x + 577 * gateStart.camera.scale,
    y: gateStart.camera.y + 900 * gateStart.camera.scale,
  };
  assert.ok(
    gateTarget.y > 0 && gateTarget.y < 900,
    "gate target on screen after pan",
  );
  await page.mouse.click(gateTarget.x, gateTarget.y);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__.player.y > 890,
    null,
    { timeout: 60000 },
  );
  await page.screenshot({ path: out + "/gate-desktop.png" });
  await page.reload();
  await page.waitForFunction(
    () => ["ready", "error"].includes(window.__ARKODIA_RUNTIME__?.state),
    null,
    { timeout: 180000 },
  );
  assert.equal((await diag()).hero, "ember-warden");
  const desktop = await diag();
  assert.equal(desktop.environment?.stage1?.sizeTiles, 936);
  assert.equal(desktop.environment?.stage5?.torchCount, 16);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/?hero=reset");
  await page.waitForFunction(
    () => ["selecting", "error"].includes(window.__ARKODIA_RUNTIME__?.state),
    null,
    { timeout: 180000 },
  );
  assert.equal((await diag()).state, "selecting");
  await page.screenshot({ path: out + "/picker-mobile.png" });
  const mobileTargets = (await diag()).picker;
  await page.mouse.click(...mobileTargets.cards["rift-runner"]);
  await page.mouse.click(...mobileTargets.journey);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__?.state === "ready",
  );
  await page.screenshot({ path: out + "/world-mobile.png" });
  const mobile = await diag();
  assert.equal(mobile.hero, "rift-runner");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 110, y: 650 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 170, y: 650 }],
  });
  await page.waitForFunction(
    (x) => window.__ARKODIA_RUNTIME__.player.x > x + 12,
    mobile.player.x,
    { timeout: 20000 },
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const touched = await diag();
  const panBefore = touched.camera;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 120, y: 200 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 190, y: 200 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForFunction(
    (x) => Math.abs(window.__ARKODIA_RUNTIME__.camera.x - x) > 20,
    panBefore.x,
    { timeout: 10000 },
  );
  await page.screenshot({ path: out + "/world-mobile.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(origin + "/?pick");
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__?.state === "selecting",
    null,
    { timeout: 180000 },
  );
  await page.screenshot({ path: out + "/picker-landscape.png" });
  await page.route("**/content/v1/contracts", (r) =>
    r.fulfill({ status: 503, body: "temporary outage" }),
  );
  await page.goto(origin);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__?.state === "error",
  );
  await page.screenshot({ path: out + "/error-mobile.png" });
  await page.unroute("**/content/v1/contracts");
  await page.mouse.click(422, 350);
  await page.waitForFunction(
    () => ["ready", "selecting"].includes(window.__ARKODIA_RUNTIME__?.state),
    null,
    { timeout: 180000 },
  );
  await page.route("**/documents/stronghold-original-prefab", async (r) => {
    const response = await r.fetch();
    await r.fulfill({ response, body: (await response.text()) + " " });
  });
  await page.goto(origin);
  await page.waitForFunction(
    () => window.__ARKODIA_RUNTIME__?.state === "error",
  );
  assert.match((await diag()).message, /integrity/);
  await page.unroute("**/documents/stronghold-original-prefab");
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.ok(requests.every((r) => r.method === "GET" && !r.authorization));
  await writeFile(
    out + "/browser.json",
    JSON.stringify(
      {
        origin,
        desktop,
        mobile,
        errors,
        requests,
        checks: [
          "original desktop picker pointer/keyboard",
          "Amber Warden selection remembered after reload",
          "keyboard movement/direction animation",
          "ground click routes around original campfire",
          "pan and ground click route through opening gate",
          "mobile picker pointer",
          "Rift Runner mobile exploration",
          "real CDP touch stick movement",
          "upper-half touch pan",
          "mobile landscape picker",
          "503 and Pixi Retry",
          "corrupt immutable document rejected",
          "one canvas / no HTML controls",
          "public credential-free GET only",
        ],
      },
      null,
      2,
    ),
  );
  console.log("PASS", JSON.stringify({ desktop, mobile }));
} finally {
  await browser?.close();
  server?.kill();
}
