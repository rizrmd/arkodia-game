import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Text, Rectangle } from "pixi.js";
import { loadContent } from "./content";
import { RuntimeScene } from "./scene";
declare const __COMMIT__: string;
const app = new Application();
await app.init({
  resizeTo: window,
  background: 0x0c1620,
  antialias: true,
  resolution: Math.min(devicePixelRatio, 2),
  autoDensity: true,
});
document.body.appendChild(app.canvas);
const stage = new Container(),
  hud = new Container();
app.stage.addChild(stage, hud);
let scene: RuntimeScene | null = null,
  busy = false,
  state = "loading",
  message = "",
  generation = 0;
let sound = "Sound off";
const params = new URLSearchParams(location.search);
const channel = params.get("channel") || "runtime-demo";
const pinned = params.get("release") || undefined;
const uiText = (
  text: string,
  x: number,
  y: number,
  size = 16,
  color = 0xc4d5da,
) => {
  const t = new Text({
    text,
    style: {
      fontFamily: "Arial",
      fontSize: size,
      fill: color,
      wordWrap: true,
      wordWrapWidth: Math.max(200, app.screen.width - 64),
    },
  });
  t.position.set(x, y);
  hud.addChild(t);
  return t;
};
function button(
  label: string,
  x: number,
  y: number,
  action: () => void,
  width = 140,
) {
  const b = new Container();
  b.position.set(x, y);
  b.eventMode = "static";
  b.cursor = "pointer";
  b.addChild(
    new Graphics()
      .roundRect(0, 0, width, 40, 9)
      .fill(0x24464a)
      .stroke({ color: 0x527e7a, width: 1 }),
  );
  const t = new Text({
    text: label,
    style: { fontFamily: "Arial", fontSize: 14, fill: 0xe0f3e7 },
  });
  t.anchor.set(0.5);
  t.position.set(width / 2, 20);
  b.addChild(t);
  b.on("pointertap", (e) => {
    e.stopPropagation();
    action();
  });
  hud.addChild(b);
}
function draw() {
  hud.removeChildren().forEach((c) => c.destroy({ children: true }));
  const w = app.screen.width,
    h = app.screen.height;
  hud.addChild(
    new Graphics()
      .rect(0, 0, w, 100)
      .fill({ color: 0x0c1620, alpha: 0.96 })
      .rect(0, h - 66, w, 66)
      .fill({ color: 0x0c1620, alpha: 0.96 }),
  );
  uiText("ARKODIA", 24, 18, 25, 0xe0eadc);
  uiText("CONTENT RUNTIME  /  FIELD STUDY 01", 24, 54, 11, 0x8faeae);
  if (state !== "ready") {
    const y = Math.max(125, h * 0.35);
    uiText(
      state === "error"
        ? "Unable to enter the grove"
        : "Opening the published grove",
      28,
      y,
      Math.min(30, w / 15),
      0xe0eadc,
    );
    uiText(message, 28, y + 65, 16);
    uiText(
      "Content API → immutable release → verified assets → Pixi scene",
      28,
      y + 125,
      12,
      0x779c9c,
    );
    if (state === "error") button("Retry load", 28, y + 170, () => void load());
  } else {
    const compact = w < 650;
    uiText(
      scene!.bundle.name,
      compact ? 24 : 240,
      compact ? 79 : 23,
      compact ? 12 : 18,
      0xe0eadc,
    );
    if (!compact)
      uiText(
        `Release ${scene!.bundle.manifest.id.slice(0, 12)} · ${scene!.bundle.manifest.assets.length} verified assets`,
        240,
        55,
        12,
        0x8faeae,
      );
    button(sound, w - 156, 16, () => {
      void scene
        ?.toggleAudio()
        .then((on) => {
          sound = on ? "Sound on" : "Sound off";
          draw();
        })
        .catch(() => {
          sound = "Audio unavailable";
          draw();
        });
    });
    button("Reload release", w - 156, h - 55, () => void load());
  }
  uiText(
    w < 650
      ? "WASD / arrows · Tap ground to move"
      : "WASD / arrow keys to explore   ·   Click or tap ground to move   ·   Camera follows the knight",
    24,
    h - 50,
    w < 650 ? 11 : 13,
  );
  uiText(
    `Standalone runtime · ${__COMMIT__.slice(0, 8)}`,
    24,
    h - 27,
    10,
    0x668686,
  );
}
async function load() {
  if (busy) return;
  busy = true;
  const run = ++generation;
  state = "loading";
  message = "Contacting Content API";
  sound = "Sound off";
  scene?.destroy();
  scene = null;
  stage.removeChildren();
  draw();
  try {
    const bundle = await loadContent(
      "/content",
      channel,
      (s) => {
        message = s;
        draw();
      },
      pinned,
    );
    const next = new RuntimeScene(bundle);
    try {
      await next.init();
    } catch (e) {
      next.destroy();
      throw e;
    }
    if (run !== generation) {
      next.destroy();
      return;
    }
    scene = next;
    stage.addChild(scene.world);
    state = "ready";
    message = "Release verified";
  } catch (e) {
    state = "error";
    message =
      (e instanceof Error ? e.message : "Content could not be loaded") +
      ". Check the connection or published channel, then retry.";
  } finally {
    busy = false;
    draw();
  }
}
app.stage.eventMode = "static";
app.stage.hitArea = new Rectangle(0, 0, app.screen.width, app.screen.height);
app.stage.on("pointertap", (e) => {
  if (scene && e.global.y > 100 && e.global.y < app.screen.height - 66) {
    scene.input.target = scene.world.toLocal(e.global);
  }
});
window.addEventListener("resize", () => {
  app.stage.hitArea = new Rectangle(
    0,
    0,
    window.innerWidth,
    window.innerHeight,
  );
  requestAnimationFrame(draw);
});
app.ticker.add((t) => {
  scene?.tick(t.deltaMS / 1000, app.screen.width, app.screen.height);
});
// Read-only diagnostics for consumer evidence; no draft routes or credentials.
Object.defineProperty(window, "__ARKODIA_RUNTIME__", {
  get: () => ({
    state,
    message,
    commit: __COMMIT__,
    channel,
    release: scene?.bundle.manifest.id,
    schemaDigest: scene?.bundle.schemaDigest,
    entities: scene?.bundle.scene.layers
      .flatMap((l) => l.objects)
      .map((o) => o.id),
    player: scene ? { x: scene.player.x, y: scene.player.y } : null,
    camera: scene ? { x: scene.world.x, y: scene.world.y } : null,
    sound,
    assetCount: scene?.bundle.assets.size,
  }),
});
void load();
