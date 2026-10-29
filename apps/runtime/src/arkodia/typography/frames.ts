import { publishedJSON as loadJsonAsset, publishedTexture } from "../resources";
const __HUD_REVISION__ = "published";
import {
  Assets,
  Container,
  NineSliceSprite,
  Sprite,
  type Texture,
} from "pixi.js";

// HUD frames and art are exported at @1x, @2x and @3x from @3x masters (scripts/typography/build-frames.mjs).
// The set is chosen from the device pixels each design pixel covers: devicePixelRatio × scene scale, rounded up.
// A 1672-wide layout at DPR 2.625 needs @3x; the same layout on a 390 px phone (scale .23) needs only @1x.
export type FrameScale = 1 | 2 | 3;
export const pickFrameScale = (dpr: number, sceneScale = 1): FrameScale => {
  const d = dpr * sceneScale;
  return d <= 1.05 ? 1 : d <= 2.05 ? 2 : 3;
};

// An ornate frame is stored as parts named `<name>.tl|tr|bl|br` (quad) or `<name>.l|r` (halves), each a 9-slice. Its
// corners and the half-ornaments at the middle of its edges stay fixed; only the rails between them stretch
// (scripts/choose-hero/build-ui.mjs).
interface Ornate {
  width: number;
  height: number;
  split: "quad" | "halves";
}
interface Manifest {
  frames: Record<
    string,
    { width: number; height: number; slice?: [number, number, number, number] }
  >;
  ornate?: Record<string, Ornate>;
}
export class FrameSet {
  private constructor(
    readonly scale: FrameScale,
    private manifest: Manifest,
    private textures: Record<string, Texture>,
  ) {}
  // only: load just the frames these names select (an ornate frame's name selects its parts).
  static async load(
    base: string,
    scale: FrameScale,
    only?: (name: string) => boolean,
    onProgress?: (done: number, total: number) => void,
  ) {
    const v = `?v=${__HUD_REVISION__}`;
    const [manifest, mobile] = await Promise.all([
      loadJsonAsset<Manifest>(base + "manifest.json" + v),
      base.includes("/hud/")
        ? loadJsonAsset<{
            frames: Record<
              string,
              { width: number; height: number; file: string }
            >;
          }>("/mobile-hud/v1/manifest.json")
        : null,
    ]);
    const names = Object.keys(manifest.frames).filter(
      (n) => !only || only(n.replace(/\.(tl|tr|bl|br|l|r)$/, "")),
    );
    const used = new Set(
      [
        "map-frame",
        "skill-ring",
        "coin",
        "clock",
        "pin",
        "arrow",
        "hp-material",
        "gate-material",
        "xp-material",
      ].map((n) => "mobile-" + n),
    );
    const mobileFrames = mobile
      ? (
          Object.entries(mobile.frames) as [
            string,
            { width: number; height: number; file: string },
          ][]
        ).filter(([name]) => used.has(name))
      : [];
    let done = 0;
    const total = names.length + mobileFrames.length;
    const completed = () => onProgress?.(++done, total);
    onProgress?.(0, total);
    const loaded: Record<string, Texture> = {};
    // Start both sets together, including mobile art; do not wait for desktop frames before downloading it.
    // Resolution keeps texture sizes in @1x units, so layouts and slice borders are scale-independent.
    await Promise.all([
      ...names.map(async (n) => {
        loaded[n] = await publishedTexture({
          src: `${base}@${scale}x/${n}.png${v}`,
          data: { resolution: scale, autoGenerateMipmaps: true },
        });
        completed();
      }),
      ...mobileFrames.map(async ([name, m]) => {
        manifest.frames[name] = { width: m.width, height: m.height };
        loaded[name] = await publishedTexture({
          src: "/mobile-hud/v1/" + m.file,
          data: { autoGenerateMipmaps: true },
        });
        completed();
      }),
    ]);
    return new FrameSet(scale, manifest, loaded);
  }
  texture(name: string) {
    const t = this.textures[name];
    if (!t) throw Error(`Unknown frame ${name}`);
    return t;
  }
  warmGpu(renderer?: { texture?: { initSource?: (s: any) => void } }) {
    for (const tex of Object.values(this.textures)) {
      if (tex?.source) {
        tex.source.autoGarbageCollect = false;
        renderer?.texture?.initSource?.(tex.source);
      }
    }
  }
  size(name: string) {
    return this.manifest.ornate?.[name] ?? this.manifest.frames[name];
  }
  // Stretchable frames become NineSliceSprites: corners keep their pixels, edges stretch along one axis only.
  frame(name: string, width?: number, height?: number): Container {
    if (this.manifest.ornate?.[name]) return this.ornate(name, width, height);
    const m = this.size(name),
      texture = this.texture(name);
    if (!("slice" in m) || !m.slice) {
      const s = new Sprite(texture);
      if (width) s.width = width;
      if (height) s.height = height;
      return s;
    }
    return this.slice(name, width ?? m.width, height ?? m.height);
  }
  private slice(name: string, width: number, height: number) {
    const [leftWidth, topHeight, rightWidth, bottomHeight] =
      this.manifest.frames[name].slice!;
    return new NineSliceSprite({
      texture: this.texture(name),
      leftWidth,
      topHeight,
      rightWidth,
      bottomHeight,
      width,
      height,
    });
  }
  // Ornaments scale uniformly by k (never above their @1x size along the tighter axis); the parts stretch to the rest.
  // Halves keep their own height and centre vertically when the box is taller.
  private ornate(name: string, width?: number, height?: number) {
    const o = this.manifest.ornate![name],
      w = width ?? o.width,
      h = height ?? o.height,
      k = Math.min(w / o.width, h / o.height),
      lw = w / k,
      lh = h / k;
    const c = new Container();
    c.scale.set(k);
    if (o.split === "quad") {
      for (const [p, x, y] of [
        ["tl", 0, 0],
        ["tr", 1, 0],
        ["bl", 0, 1],
        ["br", 1, 1],
      ] as const) {
        const s = c.addChild(this.slice(`${name}.${p}`, lw / 2, lh / 2));
        s.position.set((x * lw) / 2, (y * lh) / 2);
      }
    } else {
      const y = (lh - o.height) / 2;
      for (const [p, x] of [
        ["l", 0],
        ["r", 1],
      ] as const) {
        const s = c.addChild(this.slice(`${name}.${p}`, lw / 2, o.height));
        s.position.set((x * lw) / 2, y);
      }
    }
    return c;
  }
}
