import { BitmapText, Cache, Container, type BitmapFont } from "pixi.js";
import { FONTS, ROLES, type RoleName, type TextRole } from "./tokens";
import { fxOf, type Fx } from "./msdf";

// One piece of live text in a named role: an optional soft-shadow pass under the fill pass, both MSDF BitmapText.
// place() positions by first baseline, which is how the reference layouts are measured.
const live = new Set<MsdfText>();
let glowOn = false;
export function setGlow(on: boolean) {
  glowOn = on;
  for (const t of live) t.refresh();
}
export const glowEnabled = () => glowOn;
export const liveTexts = () => [...live];
// Effect widths and the edge width follow the world scale, which Pixi only reads when a text changes: call after rescaling a scene.
export function refreshAllText() {
  for (const t of live) t.refresh();
}

export interface TextOptions {
  size?: number;
  wrapWidth?: number;
  align?: "left" | "center" | "right";
  fill?: TextRole["fill"];
  lineHeight?: number;
  letterSpacing?: number;
}
export class MsdfText extends Container {
  readonly role: TextRole;
  private readonly fillPass: BitmapText;
  private readonly shadowPass?: BitmapText;
  private value: string;
  constructor(
    role: RoleName | TextRole,
    text: string,
    private options: TextOptions = {},
  ) {
    super();
    this.role = typeof role === "string" ? ROLES[role] : role;
    this.value = text;
    const style = this.style();
    if (this.role.shadow) {
      this.shadowPass = new BitmapText({ text: this.shown(), style });
      this.shadowPass.position.set(this.role.shadow.dx, this.role.shadow.dy);
      this.addChild(this.shadowPass);
    }
    this.fillPass = new BitmapText({ text: this.shown(), style });
    this.addChild(this.fillPass);
    this.refresh();
    this.on("added", () => live.add(this));
    this.on("removed", () => live.delete(this));
    this.on("destroyed", () => live.delete(this));
    live.add(this);
  }
  get text() {
    return this.value;
  }
  set text(v: string) {
    if (v === this.value) return;
    this.value = v;
    for (const p of this.passes()) p.text = this.shown();
    this.refresh();
  }
  get size() {
    return this.options.size ?? this.role.size;
  }
  setWrapWidth(width: number) {
    this.options.wrapWidth = width;
    for (const p of this.passes()) {
      p.style.wordWrap = true;
      p.style.wordWrapWidth = width;
    }
    this.refresh();
  }
  // Advance width of the widest line (not ink bounds), in local units.
  get advance() {
    return this.fillPass.width;
  }
  // BitmapText bounds describe the line box, including leading; use glyph quads for optical centering.
  inkCenterY() {
    const font = Cache.get(
      `${FONTS[this.role.font].family}-bitmap`,
    ) as BitmapFont;
    const scale = this.size / font.fontMetrics.fontSize;
    let shift = (font.lineHeight - font.fontMetrics.fontSize) / 2;
    if (shift - font.baseLineOffset < 0) shift = 0;
    const glyphs = [...this.shown()]
      .filter((c) => c.trim())
      .map((c) => font.chars[c])
      .filter((c) => c?.texture);
    if (!glyphs.length) return this.metrics().baseline / 2;
    const top = Math.min(
      ...glyphs.map((c) => Math.round(font.baseLineOffset + c.yOffset + shift)),
    );
    const bottom = Math.max(
      ...glyphs.map(
        (c) =>
          Math.round(font.baseLineOffset + c.yOffset + shift) +
          c.texture!.orig.height,
      ),
    );
    return ((top + bottom) * scale) / 2;
  }
  // x is the left, centre or right edge (ax 0, .5, 1); y is the first line's baseline.
  place(x: number, baseline: number, ax = 0) {
    this.position.set(
      x - this.advance * ax,
      baseline - this.metrics().baseline,
    );
    return this;
  }
  private shown() {
    return this.role.uppercase ? this.value.toUpperCase() : this.value;
  }
  private passes() {
    return this.shadowPass ? [this.shadowPass, this.fillPass] : [this.fillPass];
  }
  private style() {
    const r = this.role,
      o = this.options,
      lh =
        o.lineHeight ??
        (r.lineHeight ? (r.lineHeight * this.size) / r.size : undefined);
    return {
      fontFamily: FONTS[r.font].family,
      fontSize: this.size,
      letterSpacing: o.letterSpacing ?? r.letterSpacing,
      fill: 0xffffff,
      align: o.align ?? r.align ?? "left",
      ...(lh ? { lineHeight: lh } : {}),
      ...(o.wrapWidth ? { wordWrap: true, wordWrapWidth: o.wrapWidth } : {}),
    };
  }
  // Baseline and line advance in local units, replicating Pixi's BitmapText line placement.
  metrics() {
    const font = Cache.get(
        `${FONTS[this.role.font].family}-bitmap`,
      ) as BitmapFont,
      base = font.fontMetrics.fontSize,
      scale = this.size / base;
    const styleLine = this.fillPass.style.lineHeight;
    let advance = font.lineHeight,
      shift = 0;
    if (styleLine) {
      advance = styleLine / scale;
      shift = (advance - base) / 2;
      if (shift - font.baseLineOffset < 0) shift = 0;
    }
    return {
      baseline: scale * (font.lineHeight + shift),
      advance: scale * advance,
    };
  }
  refresh() {
    const r = this.role,
      m = this.metrics(),
      fill = this.options.fill ?? r.fill,
      f: [number, number, number] = Array.isArray(fill)
        ? fill
        : [fill, fill, fill];
    const lines = {
      baseline: m.baseline,
      lineHeight: m.advance,
      cap: FONTS[r.font].capHeight * this.size,
      ascent: 0.85 * this.size,
    };
    const glow = glowOn && r.glow ? r.glow : undefined;
    const fx: Fx = {
      mode: "fill",
      fill: f,
      alpha: 1,
      outline: r.outline
        ? [r.outline.color, 0, 0, r.outline.alpha]
        : [0, 0, 0, 0],
      outlineWidth: r.outline?.width ?? 0,
      glow: glow ? [glow.color, 0, 0, glow.alpha] : [0, 0, 0, 0],
      glowWidth: glow?.width ?? 0,
      softness: 0,
      ...lines,
    };
    fxOf.set(this.fillPass, fx);
    this.fillPass.onViewUpdate();
    if (this.shadowPass && r.shadow) {
      const s = r.shadow;
      fxOf.set(this.shadowPass, {
        ...fx,
        mode: "shadow",
        fill: [s.color, s.color, s.color],
        alpha: s.alpha,
        softness: s.softness,
        glowWidth: 0,
      });
      this.shadowPass.onViewUpdate();
    }
  }
}
