import { OpeningMusic } from "./opening-music";
import { createHeroRenderer } from "./hero-renderer";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  Rectangle,
} from "pixi.js";
import { loadPublished } from "./published";
import { Resources } from "./arkodia/resources";
import { ChooseHero } from "./arkodia/choose-hero";
import { installMsdfFx } from "./arkodia/typography/msdf";
import { preference, saveHero, type HeroId } from "./arkodia/heroes";
import { StrongholdWorld } from "./arkodia/world";
import { Input } from "./foundations";
declare const __COMMIT__: string;
const app = new Application();
await app.init({
  resizeTo: window,
  background: 0x14171b,
  antialias: true,
  resolution: Math.min(devicePixelRatio, 2),
  autoDensity: true,
  preference: "webgl",
});
document.body.appendChild(app.canvas);
app.canvas.setAttribute(
  "aria-label",
  "Stronghold exploration. WASD or arrows to walk. Drag the lower half on touch to walk; drag the upper half to pan.",
);
app.canvas.tabIndex = 0;
installMsdfFx(app.renderer);
const stage = new Container(),
  ui = new Container();
app.stage.addChild(stage, ui);
const music = new OpeningMusic();
const musicUI = new Container();
app.stage.addChild(musicUI);
function drawMusic() {
  musicUI.position.set(Math.max(8, app.screen.width - 244), 8);
  const label = music.status.muted ? "Music: Off" : `Music: ${Math.round(music.status.volume * 100)}%`;
  if (musicUI.children.length) {
    ((musicUI.children[0] as Container).children[1] as Text).text = label;
    return;
  }
  const button = (label: string, x: number, width: number, action: () => void) => {
    const c = new Container();
    c.position.set(x, 0);
    c.addChild(new Graphics().roundRect(0, 0, width, 44, 6).fill({ color: 0x14171b, alpha: 0.9 }).stroke({color: 0xd0b37b, width: 1}));
    const t = new Text({text: label, style: {fontFamily: "Arial", fontSize: 13, fill: 0xf3e6c6}});
    t.anchor.set(0.5); t.position.set(width / 2, 22); c.addChild(t);
    c.eventMode = "static"; c.cursor = "pointer";
    c.on("pointerdown", e => e.stopPropagation());
    c.on("pointertap", e => { e.stopPropagation(); action(); drawMusic(); });
    musicUI.addChild(c);
  };
  button(label, 0, 140, () => music.toggle());
  button("−", 144, 44, () => music.adjust(-0.1));
  button("+", 192, 44, () => music.adjust(0.1));
}
drawMusic();
window.addEventListener("resize", drawMusic);
Object.defineProperty(window, "__arkodiaMusic", { configurable: true, get: () => music.status });

let resources: Resources | undefined,
  world: StrongholdWorld | undefined,
  picker: ChooseHero | undefined;
let state = "loading",
  message = "Loading the game",
  progress = 0,
  busy = false;
let selected: HeroId = preference() || "rift-runner";
const remembered = preference();
const params = new URLSearchParams(location.search),
  channel = params.get("channel") || "stronghold-original",
  pin = params.get("release") || undefined;
const loadingTextures = new Map<string, Texture>();
const loadingBitmaps: ImageBitmap[] = [];
const input = new Input();
let eased = { x: 0, y: 0 };
let stick = { x: 0, y: 0 },
  stickOrigin = { x: 0, y: 0 },
  stickID = -1;
const held = new Map<
  number,
  { x: number; y: number; startX: number; startY: number; dragged: boolean }
>();
function text(
  parent: Container,
  value: string,
  x: number,
  y: number,
  size: number,
  color = 0xf3e6c6,
  center = false,
) {
  const t = new Text({
    text: value,
    style: {
      fontFamily: "Georgia",
      fontSize: size,
      fill: color,
      align: "center",
      wordWrap: true,
      wordWrapWidth: Math.max(180, app.screen.width - 48),
    },
  });
  if (center) t.anchor.set(0.5);
  t.position.set(x, y);
  parent.addChild(t);
  return t;
}
function image(
  parent: Container,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const t = loadingTextures.get(name);
  if (!t) return;
  const s = new Sprite(t);
  s.position.set(x, y);
  s.width = w;
  s.height = h;
  parent.addChild(s);
  return s;
}
function draw() {
  ui.removeChildren().forEach((c) => c.destroy({ children: true }));
  const w = app.screen.width,
    h = app.screen.height;
  app.stage.hitArea = new Rectangle(0, 0, w, h);
  if (state === "selecting") return;
  if (state === "ready") {
    // Movement help only; combat/economy HUD is not represented as working in this increment.
    text(
      ui,
      w < 650
        ? "Drag below to walk · Drag above to pan"
        : "WASD / arrows to walk · Click ground to move · Drag to pan",
      w / 2,
      h - 24,
      w < 650 ? 11 : 13,
      0xf3e6c6,
      true,
    );
    if (stickID >= 0 && resources) {
      const ring = new Sprite(
          resources.texture("/typography/v2/hud/@1x/thumbstick-ring.png"),
        ),
        knob = new Sprite(
          resources.texture("/typography/v2/hud/@1x/thumbstick-cap.png"),
        );
      ring.anchor.set(0.5);
      ring.position.set(stickOrigin.x, stickOrigin.y);
      ring.width = 112;
      ring.height = 112;
      knob.anchor.set(0.5);
      knob.position.set(
        stickOrigin.x + stick.x * 34,
        stickOrigin.y + stick.y * 34,
      );
      knob.width = 54;
      knob.height = 54;
      ui.addChild(ring, knob);
    }
    return;
  }
  const background = loadingTextures.get(
    h > w ? "bg-mobile.webp" : "bg-desktop.webp",
  );
  if (background) {
    const s = new Sprite(background),
      k = Math.max(w / background.width, h / background.height);
    s.scale.set(k);
    s.position.set((w - s.width) / 2, (h - s.height) / 2);
    ui.addChild(s);
  }
  const scale = Math.min(1, w / 520),
    lw = 390 * scale,
    lh = 120 * scale,
    y = h * 0.46;
  image(ui, "logo@1x.png", (w - lw) / 2, y - lh, lw, lh);
  if (!loadingTextures.has("logo@1x.png"))
    text(ui, "ARKODIA", w / 2, y - 35, 36, 0xe2bd72, true);
  const bw = 460 * scale,
    bx = (w - bw) / 2,
    by = y + 28;
  image(ui, "bar-track@1x.png", bx, by, bw, 28 * scale);
  const fill = image(
    ui,
    "bar-fill@1x.png",
    bx + 26 * scale,
    by + 9 * scale,
    408 * scale,
    10 * scale,
  );
  const fillMask = new Graphics()
    .rect(
      bx + 26 * scale,
      by + 9 * scale,
      408 * scale * Math.max(0.01, progress),
      10 * scale,
    )
    .fill(0xffffff);
  if (fill) {
    ui.addChild(fillMask);
    fill.mask = fillMask;
  } else
    ui.addChild(
      new Graphics()
        .roundRect(
          bx + 26 * scale,
          by + 9 * scale,
          408 * scale * Math.max(0.01, progress),
          10 * scale,
          2,
        )
        .fill(0xd5a638),
    );
  text(
    ui,
    state === "error" ? "The Stronghold could not load" : message,
    w / 2,
    by + 65,
    14,
    0xf3e6c6,
    true,
  );
  if (state === "error") {
    text(ui, message, w / 2, by + 107, 12, 0xe4d8c2, true);
    const button = new Container();
    button.position.set(w / 2 - 80, Math.min(h - 60, by + 155));
    button.addChild(
      new Graphics()
        .roundRect(0, 0, 160, 42, 5)
        .fill(0x28211c)
        .stroke({ color: 0xd0b37b, width: 2 }),
    );
    text(button, "Try Again", 80, 21, 17, 0xf3e6c6, true);
    button.eventMode = "static";
    button.cursor = "pointer";
    button.on("pointertap", (e) => {
      e.stopPropagation();
      void load();
    });
    ui.addChild(button);
  }
}
async function enter(hero: HeroId) {
  const heroRenderer = await createHeroRenderer(hero, new URL("/models/", location.origin).href);
  selected = hero;
  picker?.stopFx();
  picker?.removeFromParent();
  picker?.destroy({ children: true });
  picker = undefined;
  input.target = null;
  input.keys.clear();
  world?.destroy();
  world = new StrongholdWorld(resources!, hero, heroRenderer);
  stage.addChild(world.world, world.environment.biomeParallax.container);
  state = "ready";
  draw();
}
async function load() {
  if (busy) return;
  busy = true;
  state = "loading";
  message = "Loading the game";
  progress = 0.01;
  draw();
  world?.destroy();
  world = undefined;
  picker?.destroy({ children: true });
  picker = undefined;
  resources?.destroy();
  resources = undefined;
  try {
    const published = await loadPublished(
      "/content",
      channel,
      (s) => {
        message = s;
        const m = s.match(/(\d+)\/(\d+)/);
        progress = m ? 0.1 + (0.78 * Number(m[1])) / Number(m[2]) : 0.06;
        draw();
      },
      pin,
      async (path, bytes, mediaType) => {
        if (!path.startsWith("/typography/v2/loading/")) return;
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: mediaType }),
        );
        loadingBitmaps.push(bitmap);
        const name = path.split("/").pop()!;
        loadingTextures.get(name)?.destroy(true);
        loadingTextures.set(name, Texture.from(bitmap));
        draw();
      },
    );
    message = "Preparing the Stronghold";
    progress = 0.92;
    draw();
    resources = new Resources(published);
    await resources.init();
    if (remembered && !params.has("pick")) await enter(selected);
    else {
      picker = await ChooseHero.load(selected);
      picker.onConfirm = (hero) => {
        saveHero(hero);
        void enter(hero).catch((e) => { state = "error"; message = String(e); console.error(e); draw(); });
      };
      await picker.layout(app.screen.width, app.screen.height);
      state = "selecting";
      stage.addChild(picker);
      draw();
    }
  } catch (e) {
    state = "error";
    message =
      e instanceof Error ? e.message : "Unable to load published content";
    console.error(e);
    draw();
  } finally {
    busy = false;
  }
}
window.addEventListener(
  "keydown",
  (e) => {
    if (state === "selecting" && picker) {
      e.stopImmediatePropagation();
      if (picker.key(e)) e.preventDefault();
    }
  },
  { capture: true },
);
window.addEventListener(
  "keyup",
  (e) => {
    if (state === "selecting" && picker) {
      e.stopImmediatePropagation();
      if (picker.key(e)) e.preventDefault();
    }
  },
  { capture: true },
);
const reset = () => {
  held.clear();
  stickID = -1;
  stick = { x: 0, y: 0 };
  input.keys.clear();
  eased = { x: 0, y: 0 };
  world?.walker.cancel();
  draw();
};
window.addEventListener("blur", reset);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    world?.save();
    reset();
  }
});
window.addEventListener("pagehide", () => world?.save());
app.canvas.addEventListener("pointerdown", (e) => {
  if (state !== "ready" || !world) return;
  app.canvas.setPointerCapture(e.pointerId);
  if (
    e.pointerType === "touch" &&
    e.clientY >= innerHeight / 2 &&
    stickID < 0
  ) {
    stickID = e.pointerId;
    stickOrigin = { x: e.clientX, y: e.clientY };
    world.walker.cancel();
    draw();
    return;
  }
  held.set(e.pointerId, {
    x: e.clientX,
    y: e.clientY,
    startX: e.clientX,
    startY: e.clientY,
    dragged: false,
  });
});
app.canvas.addEventListener("pointermove", (e) => {
  if (state !== "ready" || !world) return;
  if (e.pointerId === stickID) {
    const x = e.clientX - stickOrigin.x,
      y = e.clientY - stickOrigin.y,
      d = Math.hypot(x, y),
      m = Math.min(1, Math.max(0, (d / 34 - 0.18) / (0.6 - 0.18)));
    stick = { x: (x / (d || 1)) * m, y: (y / (d || 1)) * m };
    draw();
    return;
  }
  const p = held.get(e.pointerId);
  if (!p) return;
  if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 5)
    p.dragged = true;
  if (p.dragged) {
    world.pan.x -= (e.clientX - p.x) / world.world.scale.x;
    world.pan.y -= (e.clientY - p.y) / world.world.scale.y;
    world.walker.cancel();
  }
  p.x = e.clientX;
  p.y = e.clientY;
});
function lift(e: PointerEvent) {
  if (e.pointerId === stickID) {
    stickID = -1;
    stick = { x: 0, y: 0 };
    draw();
    return;
  }
  const p = held.get(e.pointerId);
  held.delete(e.pointerId);
  if (
    p &&
    !p.dragged &&
    world &&
    state === "ready" &&
    e.type !== "pointercancel"
  ) {
    const point = world.world.toLocal({ x: e.clientX, y: e.clientY });
    world.goTo(point.x, point.y);
  }
}
app.canvas.addEventListener("pointerup", lift);
app.canvas.addEventListener("pointercancel", lift);
window.addEventListener("resize", () => {
  requestAnimationFrame(() => {
    if (picker) void picker.layout(app.screen.width, app.screen.height);
    draw();
  });
});
app.ticker.add((t) => {
  if (state === "ready" && world) {
    const axis = stickID >= 0 ? stick : input.axis();
    const dt = Math.min(0.25, t.deltaMS / 1000),
      on = !!(axis.x || axis.y),
      k = 1 - Math.exp(-dt / (on ? 0.055 : 0.045));
    eased = {
      x: eased.x + (axis.x - eased.x) * k,
      y: eased.y + (axis.y - eased.y) * k,
    };
    if (!on && Math.hypot(eased.x, eased.y) < 0.03) eased = { x: 0, y: 0 };
    world.tick(dt, app.screen.width, app.screen.height, eased);
  }
});
Object.defineProperty(window, "__ARKODIA_RUNTIME__", {
  get: () => ({
    state,
    message,
    commit: __COMMIT__,
    channel,
    release: resources?.published.manifest.id,
    schemaDigest: resources?.published.schemaDigest,
    assetCount: resources?.published.assets.size,
    hero: selected,
    player: world ? { x: world.player.x, y: world.player.y } : null,
    camera: world
      ? { x: world.world.x, y: world.world.y, scale: world.world.scale.x }
      : null,
    clip: world?.clip,
    hero3d: world?.diagnostics(),
    gateFrame: world?.gateFrame,
    route: world?.walker.route(),
    environment: world?.environment.metrics(),
    picker: picker?.targets(),
    highlights: picker?.highlights,
    sourceCommit: resources?.data.sourceCommit,
  }),
});
void load();
