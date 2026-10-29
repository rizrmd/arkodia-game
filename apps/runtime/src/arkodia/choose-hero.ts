import {
  BlurFilter,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  type Texture,
} from "pixi.js";
import { FrameSet, pickFrameScale, type FrameScale } from "./typography/frames";
import { MsdfText } from "./typography/text";
import {
  CHOOSE_HERO_TEXT,
  type ChooseLayout,
  type ChooseSlot,
} from "./typography/tokens";
import { publishedTexture, publishedJSON } from "./resources";
const BUILDING_BRANCHES = { "ember-warden": { hero: "Amber Warden" } };
import type { HeroId } from "./heroes";
import {
  ChooseHeroFx,
  inertSlot,
  type FxLoop,
  type FxSlot,
} from "./picker-effects";

// Choose Your Hero, the production screen: Pixi only, every word live MSDF text in the CHOOSE_HERO_TEXT roles, art and
// split 9-slice frames from public/assets/choose-hero (scripts/choose-hero/build-ui.mjs, built from the Choosing Hero
// kit). Desktop and portrait follow the kit's 1672 × 941 and 864 × 1824 references; short landscape phones get a
// 1240 × 600 composition so text stays readable. The stage scales uniformly and centres; the castle covers the viewport.
// Frames load at @1x/@2x/@3x from devicePixelRatio × stage scale and reload when that changes.
// Highlights are NixieFX (choose-hero-fx.ts): a burst and a looping aura on the selected card, a glint trace on a
// hovered card, a glow on Begin Journey while hovered or focused and a flash when it is pressed.
// Input: tap/click a card to select, Begin Journey to confirm, Back to keep the current hero. Keys (key()): arrows or Tab
// switch hero, Enter or Space begin (pressed while held, confirmed on release), Escape goes back. Back is drawn only
// when onBack is set before the first layout; the game's one-time pick (hero-picker.ts) leaves it unset.
const BASE = "/assets/choose-hero/",
  LOGO = "/typography/v2/hero/";
export const HEROES: HeroId[] = ["ember-warden", "rift-runner"];
const SKILL_ICON: Record<HeroId, string> = {
  "ember-warden": "skill-flame-fan",
  "rift-runner": "skill-rift-bolt",
};
// The kit fitted Rift's wider 1145 × 1374 master into the 1024 × 1536 canvas, so his figure draws smaller than Ember's
// (hair top to belt: 640 vs 750 px). The references show both at one size, so his art scales up about its top centre.
const ART_SCALE: Record<HeroId, number> = {
  "ember-warden": 0.88,
  "rift-runner": 1.25,
};
interface Labels {
  title: string;
  subtitle: string;
  back: string;
  loadout: string;
  journey: string;
  selected: string;
  empty: string;
  level: string;
  automatic: string;
  blessings: string;
  heroes: Record<HeroId, { name: string; description: string; skill: string }>;
}
// Cinzel's lower case is small caps: title case gives the reference's tall initials (EMBER WARDEN, BEGIN JOURNEY).
const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const DESIGN: Record<ChooseLayout, [number, number]> = {
  desktop: [1672, 941],
  portrait: [864, 1824],
  landscape: [1240, 600],
};
// Portrait below a 0.85 aspect (phones, upright tablets); landscape phones under 560 CSS px tall; desktop otherwise.
export const chooseLayout = (w: number, h: number): ChooseLayout =>
  w < h * 0.85 ? "portrait" : h < 560 ? "landscape" : "desktop";
type Box = [number, number, number, number];
// Boxes include the frame's outer ornaments and glow (its rails sit about 7 % inside), so a card's rails land on the
// reference's. Text baselines are fractions of the card height: selected name, Selected, unselected name.
interface CardSpec {
  boxes: Box[];
  names: [number, number, number];
}
const CARDS: Record<ChooseLayout, CardSpec> = {
  desktop: {
    boxes: [
      [50, 134, 297, 390],
      [50, 489, 297, 390],
    ],
    names: [0.775, 0.845, 0.81],
  },
  portrait: {
    boxes: [
      [84, 837, 355, 411],
      [424, 837, 355, 411],
    ],
    names: [0.768, 0.836, 0.797],
  },
  landscape: {
    boxes: [
      [34, 92, 204, 262],
      [34, 342, 204, 262],
    ],
    names: [0.775, 0.85, 0.81],
  },
};
type ButtonState = "default" | "hover" | "pressed";

// Pointer behaviour shared by cards, Back and Begin Journey: hover only for mouse and pen (touch goes default →
// pressed → default), tap fires on release over the target.
function pressable(
  target: Container,
  hit: Rectangle,
  tap: () => void,
  state: (s: ButtonState) => void = () => {},
) {
  target.eventMode = "static";
  target.cursor = "pointer";
  target.hitArea = hit;
  let over = false,
    down = false;
  const set = () => state(down ? "pressed" : over ? "hover" : "default");
  target.on("pointerover", (e) => {
    over = e.pointerType !== "touch";
    set();
  });
  target.on("pointerout", () => {
    over = false;
    down = false;
    set();
  });
  target.on("pointerdown", () => {
    down = true;
    set();
  });
  target.on("pointerup", () => {
    const was = down;
    down = false;
    set();
    if (was) tap();
  });
  target.on("pointerupoutside", () => {
    down = false;
    set();
  });
}

interface Card {
  root: Container;
  inner: Container;
  plain: Container;
  selected: Container;
  hover: Container;
  badge: Container;
  name: MsdfText;
  state: MsdfText;
  id: HeroId;
  box: Box;
  fx: FxSlot;
  aura?: FxLoop;
  hoverFx?: FxLoop;
}
// The "ui/…" effects of vfx/recipes/ui.mjs, authored in a 3 × 4 unit card frame and a 4.8 × 1.2 unit button frame.
const FX = {
  select: (id: HeroId) => `ui/card.select.${id}`,
  aura: (id: HeroId) => `ui/card.aura.${id}`,
  hover: "ui/card.hover",
  glow: "ui/button.glow",
  press: "ui/button.press",
};
// Begin Journey closes the screen once its press flash has shown.
const CONFIRM_MS = 260;
export class ChooseHero extends Container {
  onConfirm?: (hero: HeroId) => void;
  onBack?: () => void;
  hero: HeroId;
  layoutName: ChooseLayout = "desktop";
  frameScale: FrameScale = 1;
  private bg = new Sprite();
  private stage = new Container();
  private frames?: FrameSet;
  private logo?: Texture;
  private texts: MsdfText[] = [];
  private cards: Card[] = [];
  private panel = new Container();
  private art = new Sprite();
  private artBox: Box = [0, 0, 0, 0];
  private button?: {
    root: Container;
    states: Record<ButtonState, Container>;
    set(s: ButtonState): void;
    fx: FxSlot;
  };
  private glow?: FxLoop;
  private shown?: HeroId;
  private confirming = false;
  private keyMode = false;
  private enterDown = false;
  private loading = 0;
  private cache = new Map<string, Promise<[FrameSet, Texture]>>();
  private constructor(
    private labels: Labels,
    private artTex: Record<string, Texture>,
    private artFiles: Record<string, { file: string }>,
    private fx: ChooseHeroFx | null,
    hero: HeroId,
  ) {
    super();
    this.hero = hero;
    // The whole viewport takes pointer input, so nothing behind the screen reacts while it is open.
    this.eventMode = "static";
    this.addChild(this.bg, this.stage);
  }
  static async load(hero: HeroId) {
    const v = "?v=6";
    const [labels, manifest] = await Promise.all([
      publishedJSON<Labels>(BASE + "labels.en.json" + v),
      publishedJSON<{ art: Record<string, { file: string }> }>(
        BASE + "manifest.json" + v,
      ),
    ]);
    const w =
        typeof innerWidth !== "undefined" && innerWidth ? innerWidth : 1440,
      h = typeof innerHeight !== "undefined" && innerHeight ? innerHeight : 900;
    const initBg =
      chooseLayout(w, h) === "portrait" ? "castle-mobile" : "castle-desktop";
    const names = Object.keys(manifest.art).filter(
        (n) => !n.startsWith("castle-") || n === initBg,
      ),
      [art, fx] = await Promise.all([
        Promise.all(
          names.map((n) =>
            publishedTexture({
              src: BASE + manifest.art[n].file + v,
              data: { autoGenerateMipmaps: true },
            }),
          ),
        ),
        ChooseHeroFx.load(),
      ]);
    labels.heroes["ember-warden"].name = BUILDING_BRANCHES["ember-warden"].hero;
    labels.heroes["ember-warden"].description =
      "Runeseekers · Runetower defense";
    labels.heroes["rift-runner"].description =
      "Stormshade · Watchtower defense";
    return new ChooseHero(
      labels,
      Object.fromEntries(names.map((n, i) => [n, art[i]])),
      manifest.art,
      fx,
      hero,
    );
  }
  // Frames for one layout and scale: only the panel that layout draws (the textured panels are the heaviest files).
  private assets(layout: ChooseLayout, scale: FrameScale) {
    const panel = layout === "portrait" ? "panel-mobile" : "panel-desktop",
      key = `${panel}@${scale}`;
    let p = this.cache.get(key);
    if (!p) {
      p = Promise.all([
        FrameSet.load(
          BASE,
          scale,
          (n) =>
            (!n.startsWith("panel-") && n !== "button-disabled") || n === panel,
        ),
        publishedTexture({
          src: `${LOGO}logo@${scale}x.png`,
          data: { resolution: scale, autoGenerateMipmaps: true },
        }),
      ]);
      this.cache.set(key, p);
    }
    return p;
  }
  // Resolves once the screen is drawn for this viewport (CSS px).
  async layout(width: number, height: number) {
    const layout = chooseLayout(width, height),
      [W, H] = DESIGN[layout],
      s = Math.min(width / W, height / H),
      scale = pickFrameScale(devicePixelRatio || 1, s);
    this.hitArea = new Rectangle(0, 0, width, height);
    const bgKey = layout === "portrait" ? "castle-mobile" : "castle-desktop";
    if (!this.artTex[bgKey] && this.artFiles[bgKey]) {
      this.artTex[bgKey] = await publishedTexture({
        src: BASE + this.artFiles[bgKey].file + "?v=6",
        data: { autoGenerateMipmaps: true },
      });
    }
    if (
      layout !== this.layoutName ||
      scale !== this.frameScale ||
      !this.frames
    ) {
      const token = ++this.loading,
        [frames, logo] = await this.assets(layout, scale);
      if (token !== this.loading) return;
      this.frames = frames;
      this.logo = logo;
      this.layoutName = layout;
      this.frameScale = scale;
      this.build();
    }
    this.stage.scale.set(s);
    this.stage.position.set((width - W * s) / 2, (height - H * s) / 2);
    const bg = this.bg;
    bg.texture = this.artTex[bgKey];
    bg.scale.set(
      Math.max(width / bg.texture.width, height / bg.texture.height),
    );
    bg.position.set((width - bg.width) / 2, (height - bg.height) / 2);
    // Effect and edge widths follow the world scale, which Pixi reads only when a text changes.
    for (const t of this.texts) t.refresh();
  }
  warmGpu(renderer?: { texture?: { initSource?: (s: any) => void } }) {
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    const bgKey =
      this.layoutName === "portrait" ? "castle-mobile" : "castle-desktop";
    for (const k of [bgKey, "ember-warden", "rift-runner"]) {
      const tex = this.artTex[k];
      if (tex?.source) {
        tex.source.autoGarbageCollect = false;
        renderer?.texture?.initSource?.(tex.source);
      }
    }
    if (this.logo?.source) {
      this.logo.source.autoGarbageCollect = false;
      renderer?.texture?.initSource?.(this.logo.source);
    }
    this.frames?.warmGpu(renderer);
  }
  get stageScale() {
    return this.stage.scale.x;
  }
  select(hero: HeroId) {
    if (hero === this.hero) return;
    this.hero = hero;
    if (this.frames) this.update();
  }
  confirm() {
    if (this.confirming) return;
    this.confirming = true;
    this.button?.fx.play(FX.press);
    setTimeout(
      () => {
        this.confirming = false;
        this.onConfirm?.(this.hero);
      },
      this.fx ? CONFIRM_MS : 0,
    );
  }
  override destroy(options?: Parameters<Container["destroy"]>[0]) {
    this.fx?.destroy();
    super.destroy(options);
  }
  get highlights() {
    return this.fx?.keys() ?? [];
  }
  stopFx() {
    this.fx?.stopAll();
    this.glow = undefined;
    for (const c of this.cards) {
      c.aura = undefined;
      c.hoverFx = undefined;
    }
  }
  // Capture hook: freeze the highlight clock (true) and step it by seconds.
  fxClock(manual: boolean, stepSeconds = 0) {
    if (!this.fx) return;
    this.fx.manual = manual;
    if (stepSeconds) this.fx.step(stepSeconds);
  }
  back() {
    this.onBack?.();
  }
  // Keyboard while open. Returns true when the key belongs to the screen.
  key(e: KeyboardEvent) {
    const down = e.type === "keydown";
    if (e.key === "Escape") {
      if (down) this.back();
      return true;
    }
    if (e.key === "Enter" || e.key === " ") {
      if (down) {
        if (!e.repeat) {
          this.enterDown = true;
          this.button?.set("pressed");
        }
      } else if (this.enterDown) {
        this.enterDown = false;
        this.button?.set(this.keyMode ? "hover" : "default");
        this.confirm();
      }
      return true;
    }
    const step =
      e.key === "ArrowRight" ||
      e.key === "ArrowDown" ||
      (e.key === "Tab" && !e.shiftKey)
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "Tab"
          ? -1
          : 0;
    if (step || e.key === "1" || e.key === "2") {
      if (down) {
        const i = HEROES.indexOf(this.hero),
          next = step
            ? HEROES[(i + step + HEROES.length) % HEROES.length]
            : HEROES[+e.key - 1];
        // Keyboard focus shows on Begin Journey, the control Enter activates.
        if (!this.keyMode) {
          this.keyMode = true;
          if (!this.enterDown) this.button?.set("hover");
        }
        this.select(next);
      }
      return true;
    }
    return false;
  }
  // CSS-pixel centres of the controls (input checks in scripts/choose-hero/capture.mjs).
  targets() {
    const c = (o: Container) => {
      const b = o.getBounds();
      return [b.x + b.width / 2, b.y + b.height / 2];
    };
    return {
      cards: Object.fromEntries(this.cards.map((k) => [k.id, c(k.root)])),
      journey: this.button ? c(this.button.root) : null,
      back: this.backTarget ? c(this.backTarget) : null,
    };
  }
  private backTarget?: Container;
  // Visible texts with CSS-pixel bounds (crispness crops in scripts/choose-hero/capture.mjs).
  textBounds() {
    return this.texts
      .filter((t) => !t.destroyed && t.parent && t.visible && t.parent.visible)
      .map((t) => {
        const b = t.getBounds();
        return {
          text: t.text,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
        };
      });
  }

  private text(
    parent: Container,
    slot: ChooseSlot,
    value: string,
    options: { wrapWidth?: number; align?: "left" | "center" | "right" } = {},
  ) {
    const t = parent.addChild(
      new MsdfText(CHOOSE_HERO_TEXT[this.layoutName][slot], value, options),
    );
    this.texts.push(t);
    return t;
  }
  private frame(parent: Container, name: string, [x, y, w, h]: Box) {
    const f = parent.addChild(this.frames!.frame(name, w, h));
    // Ornate frames keep their ornament proportions: centre the reassembled frame in its box.
    const b = f.getLocalBounds(),
      fw = b.width * f.scale.x,
      fh = b.height * f.scale.y;
    f.position.set(x + (w - fw) / 2, y + (h - fh) / 2);
    return f;
  }
  private build() {
    this.fx?.clear();
    this.glow = undefined;
    for (const c of this.stage.removeChildren()) c.destroy({ children: true });
    this.texts = [];
    this.cards = [];
    this.panel = new Container();
    this.art = new Sprite();
    this.button = undefined;
    const L = this.labels,
      layout = this.layoutName,
      [W] = DESIGN[layout],
      st = this.stage;
    // The logo's thin gold strokes thin out further when it is scaled down over the bright castle: a soft dark halo
    // under it keeps it readable, like the shadowed wordmark in the references.
    const logoShadow = st.addChild(new Sprite(this.logo)),
      logo = st.addChild(new Sprite(this.logo));
    logoShadow.tint = 0x000000;
    logoShadow.alpha = 0.75;
    logoShadow.filters = [new BlurFilter({ strength: 4, quality: 3 })];
    let title: number,
      backBox: Box,
      backHit: Rectangle,
      artBox: Box,
      artCrop: number;
    if (layout === "desktop") {
      backBox = [42, 90, 56, 56];
      backHit = new Rectangle(32, 82, 140, 76);
      artBox = [346, 141, 800, 1200];
      artCrop = 800;
      logo.width = 290;
      logo.height = (290 * 70) / 270;
      logo.position.set(30, 12);
      this.frame(st, "divider", [560, 8, 552, 26]);
      this.frame(st, "divider", [420, 71, 820, 30]);
      title = 71;
    } else if (layout === "portrait") {
      backBox = [20, 20, 80, 80];
      backHit = new Rectangle(5, 5, 110, 110);
      artBox = [0, 174, 864, 1296];
      artCrop = 1080;
      logo.width = 290;
      logo.height = (290 * 70) / 270;
      logo.position.set(W / 2 - 145, 18);
      this.frame(st, "divider", [150, 146, 564, 28]);
      this.frame(st, "divider", [40, 121, 140, 24]);
      this.frame(st, "divider", [684, 121, 140, 24]);
      title = 144;
    } else {
      backBox = [22, 18, 56, 56];
      backHit = new Rectangle(8, 4, 84, 84);
      artBox = [380, 92, 480, 720];
      artCrop = 508;
      logo.width = 230;
      logo.height = (230 * 70) / 270;
      logo.position.set(90, 20);
      this.frame(st, "divider", [380, 72, 480, 34]);
      title = 62;
    }
    logoShadow.width = logo.width;
    logoShadow.height = logo.height;
    logoShadow.position.set(logo.x, logo.y + 2);
    // The hero figure, top-aligned and cropped (the references cut the lower legs), under the cards and panel.
    // The mask crops only the height, so a wider figure (scaled Rift) keeps his cape; cards and panel draw over it.
    const ay = artBox[1],
      mask = new Graphics().rect(0, ay, W, artCrop).fill(0xffffff);
    this.artBox = artBox;
    this.art.mask = mask;
    st.addChildAt(this.art, 0);
    st.addChildAt(mask, 1);
    this.text(st, "title", L.title).place(W / 2, title, 0.5);
    if (layout === "desktop")
      this.text(st, "subtitle", L.subtitle).place(W / 2, 117, 0.5);
    // Back: arrow medallion, plus its label on desktop. Hover brightens it, press sinks it.
    this.backTarget = undefined;
    if (this.onBack) {
      const back = st.addChild(new Container()),
        backInner = back.addChild(new Container());
      const [bx, by, bw] = backBox;
      backInner.pivot.set(bx + bw / 2, by + bw / 2);
      backInner.position.set(bx + bw / 2, by + bw / 2);
      this.frame(backInner, "back", backBox);
      if (layout === "desktop") this.text(back, "back", L.back).place(106, 123);
      this.backTarget = backInner;
      pressable(
        back,
        backHit,
        () => this.back(),
        (s) => {
          backInner.scale.set(
            s === "pressed" ? 0.92 : s === "hover" ? 1.08 : 1,
          );
          back.alpha = s === "hover" ? 1 : 0.96;
        },
      );
    }
    st.addChild(this.panel);
    CARDS[layout].boxes.forEach((box, i) =>
      this.cards.push(this.card(HEROES[i], box)),
    );
    this.button = this.journey();
    if (this.keyMode) this.button.set("hover");
    this.update();
  }
  private card(id: HeroId, box: Box): Card {
    const [x, y, w, h] = box,
      root = this.stage.addChild(new Container()),
      inner = root.addChild(new Container());
    inner.pivot.set(x + w / 2, y + h / 2);
    inner.position.set(x + w / 2, y + h / 2);
    const portrait = inner.addChild(
      new Sprite(this.frames!.texture(`portrait-${id}`)),
    );
    portrait.position.set(x, y);
    portrait.width = w;
    portrait.height = h;
    const plain = this.frame(inner, "card-frame", box),
      selected = this.frame(inner, "card-frame-selected", box),
      hover = this.frame(inner, "card-frame-selected", box);
    hover.alpha = 0.45;
    // Check badge on the portrait's lower left, where the references put it.
    const badge = this.frame(inner, "selected-badge", [
      x + 0.13 * w,
      y + 0.575 * h,
      0.17 * w,
      0.17 * w,
    ]);
    // Highlights draw over the frame and badge, under the card's text.
    const fx = this.fx
      ? this.fx.slot(inner, inner.children.length, [3, 4], box)
      : inertSlot();
    const name = this.text(inner, "card-name", this.labels.heroes[id].name),
      state = this.text(inner, "card-state", this.labels.selected);
    const card: Card = {
      root,
      inner,
      plain,
      selected,
      hover,
      badge,
      name,
      state,
      id,
      box,
      fx,
    };
    // Selection always shows the glowing frame, the check badge and the Selected label together; hover previews the glow.
    pressable(
      root,
      new Rectangle(x + 0.07 * w, y + 0.07 * h, 0.86 * w, 0.86 * h),
      () => {
        this.keyMode = false;
        this.button?.set("default");
        this.select(id);
      },
      (s) => {
        const on = id === this.hero,
          hovering = !on && s !== "default";
        hover.visible = hovering;
        inner.scale.set(s === "pressed" ? 0.97 : 1);
        if (hovering) card.hoverFx ??= fx.play(FX.hover, { loop: true });
        else {
          card.hoverFx?.release();
          card.hoverFx = undefined;
        }
      },
    );
    return card;
  }
  private journey() {
    const L = this.labels,
      layout = this.layoutName,
      root = this.stage.addChild(new Container());
    // Boxes include the top and bottom centre finials; portrait moves the whole button per hero (update()).
    const box: Box =
      layout === "desktop"
        ? [1157, 728, 480, 117]
        : layout === "portrait"
          ? [24, 0, 816, 160]
          : [850, 488, 370, 96];
    const baseline =
      layout === "desktop" ? 791 : layout === "portrait" ? 91 : 543;
    const states = {} as Record<ButtonState, Container>;
    for (const s of ["default", "hover", "pressed"] as const) {
      states[s] = this.frame(root, `button-${s}`, box);
      states[s].visible = s === "default";
    }
    const fx = this.fx
      ? this.fx.slot(root, root.children.length, [4.8, 1.2], box)
      : inertSlot();
    const label = this.text(root, "action", titleCase(L.journey));
    label.place(box[0] + box[2] / 2, baseline, 0.5);
    // Generated states differ in small ornament details, so they swap instantly instead of fading. The glow runs while
    // the button is hovered, focused or held.
    const apply = (s: ButtonState) => {
      for (const k of Object.keys(states) as ButtonState[])
        states[k].visible = k === s;
      label.alpha = s === "pressed" ? 0.9 : 1;
      if (s === "default") {
        this.glow?.release();
        this.glow = undefined;
      } else this.glow ??= fx.play(FX.glow, { loop: true });
    };
    pressable(
      root,
      new Rectangle(...box),
      () => this.confirm(),
      (s) => apply(s === "default" && this.keyMode ? "hover" : s),
    );
    return { root, states, set: apply, fx };
  }
  // Hero-dependent parts: figure, card states, the information panel and (portrait) the action's position.
  private update() {
    const L = this.labels,
      h = L.heroes[this.hero],
      layout = this.layoutName,
      spec = CARDS[layout],
      p = this.panel;
    const [ax, ay, aw, ah] = this.artBox,
      k = ART_SCALE[this.hero];
    this.art.texture = this.artTex[this.hero];
    this.art.width = aw * k;
    this.art.height = ah * k;
    this.art.position.set(ax + (aw * (1 - k)) / 2, ay);
    for (const c of this.cards) {
      const on = c.id === this.hero,
        [x, y, w, ch] = c.box;
      c.plain.visible = !on;
      c.selected.visible = on;
      c.badge.visible = on;
      c.state.visible = on;
      c.hover.visible = false;
      c.name.place(
        x + w / 2,
        y + ch * (on ? spec.names[0] : spec.names[2]),
        0.5,
      );
      c.state.place(x + w / 2, y + ch * spec.names[1], 0.5);
      // A newly chosen card bursts once; the selected card keeps a slow aura (also restarted after a layout rebuild).
      if (on) {
        c.hoverFx?.release();
        c.hoverFx = undefined;
        if (this.shown && this.shown !== c.id) c.fx.play(FX.select(c.id));
        c.aura ??= c.fx.play(FX.aura(c.id), { loop: true });
      } else {
        c.aura?.release();
        c.aura = undefined;
      }
    }
    this.shown = this.hero;
    for (const c of p.removeChildren()) c.destroy({ children: true });
    this.texts = this.texts.filter((t) => !t.destroyed);
    const icons = (
      xs: number[],
      y: number,
      size: number,
      nameY: number,
      levelGap: number,
    ) => {
      xs.forEach((cx, i) => {
        this.frame(p, i ? "skill-empty" : SKILL_ICON[this.hero], [
          cx - size / 2,
          y,
          size,
          size,
        ]);
        this.text(p, "skill", i ? L.empty : h.skill).place(cx, nameY, 0.5);
      });
      this.text(p, "level", L.level).place(xs[0], nameY + levelGap, 0.5);
    };
    if (layout === "desktop") {
      this.frame(p, "panel-desktop", [1135, 80, 527, 700]);
      this.text(p, "hero-name", titleCase(h.name)).place(1398, 230, 0.5);
      this.frame(p, "divider", [1200, 252, 395, 24]);
      this.text(p, "hero-desc", h.description).place(1398, 304, 0.5);
      this.text(p, "loadout", L.loadout).place(1200, 391);
      this.frame(p, "divider", [1330, 372, 262, 24]);
      icons([1259, 1398, 1537], 418, 130, 561, 27);
      // The paragraph wraps to the panel's dark interior: panel width less 40 px on each side.
      this.text(p, "help", `${L.automatic} ${L.blessings}`, {
        wrapWidth: 485 - 80,
      }).place(1398, 640, 0.5);
    } else if (layout === "portrait") {
      // Both heroes show the full panel: hero name, description, Loadout, skills and the help line.
      // The box reaches past the rails by the corner stars, so the rails sit on the reference's (30–835 px).
      this.frame(p, "panel-mobile", [-4, 1175, 872, 543]);
      this.text(p, "hero-name", titleCase(h.name)).place(432, 1284, 0.5);
      this.frame(p, "divider", [170, 1293, 524, 26]);
      this.text(p, "hero-desc", h.description).place(432, 1342, 0.5);
      this.text(p, "loadout", L.loadout, { align: "center" }).place(
        432,
        1393,
        0.5,
      );
      this.frame(p, "divider", [118, 1378, 224, 24]);
      this.frame(p, "divider", [522, 1378, 224, 24]);
      icons([228, 430, 632], 1410, 140, 1572, 24);
      this.frame(p, "divider", [140, 1600, 584, 24]);
      this.text(p, "help", L.automatic, { wrapWidth: 816 - 2 * 70 }).place(
        432,
        1642,
        0.5,
      );
      this.button!.root.y = 1655;
    } else {
      this.frame(p, "panel-desktop", [850, 88, 370, 416]);
      this.text(p, "hero-name", titleCase(h.name)).place(1035, 166, 0.5);
      this.frame(p, "divider", [880, 180, 310, 24]);
      this.text(p, "hero-desc", h.description, {
        wrapWidth: 310,
        align: "center",
      }).place(1035, 218, 0.5);
      this.text(p, "loadout", L.loadout).place(884, 258);
      this.frame(p, "divider", [1012, 246, 180, 22]);
      icons([926, 1032, 1138], 272, 80, 378, 21);
      this.text(p, "help", L.automatic, { wrapWidth: 310 }).place(
        1035,
        428,
        0.5,
      );
    }
    for (const t of this.texts) t.refresh();
  }
}
