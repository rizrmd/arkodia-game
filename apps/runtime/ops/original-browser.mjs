import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  env: {
    ...process.env,
    LD_LIBRARY_PATH: `${process.env.HOME}/.local/browser-libs/usr/lib/x86_64-linux-gnu`,
  },
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const record = { origin: "https://arkodia.online", errors: [], checks: [] };
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (e) => record.errors.push(e.message));
  await page.goto("https://arkodia.online/?offline=1&hero=reset&pick=1");
  try {
    await page.waitForFunction(
      () => window.__PIXI_UI__?.picker?.isOpen(),
      null,
      { timeout: 150000 },
    );
    record.checks.push("original fresh hero picker opened");
    await page.screenshot({
      path: "../../docs/runtime/stronghold/evidence/original-picker-desktop.png",
    });
    const target = await page.evaluate(() =>
      window.__PIXI_UI__.picker.view().then((v) => v.targets()),
    );
    await page.mouse.click(...target.cards["ember-warden"]);
    await page.mouse.click(...target.journey);
    await page.waitForFunction(
      () => !window.__PIXI_UI__?.picker?.isOpen(),
      null,
      { timeout: 20000 },
    );
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "../../docs/runtime/stronghold/evidence/original-world-desktop.png",
    });
    record.checks.push("original Amber Warden picked and world entered");
    record.canvas = await page
      .locator("#world-canvas")
      .evaluate((c) => ({ ...c.dataset }));
    record.hero = await page.evaluate(() =>
      localStorage.getItem("arkodia.hero"),
    );
  } catch (e) {
    record.failure = e.message;
    await page.screenshot({
      path: "../../docs/runtime/stronghold/evidence/original-observed.png",
    });
  }
  await writeFile(
    "../../docs/runtime/stronghold/evidence/original-browser.json",
    JSON.stringify(record, null, 2),
  );
  console.log(JSON.stringify(record));
} finally {
  await browser.close();
}
