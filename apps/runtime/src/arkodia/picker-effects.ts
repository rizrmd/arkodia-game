import { Assets, Container, Rectangle, Ticker, type Texture } from "pixi.js";
import type {
  PixiVfxEffectInstance,
  PixiVfxProjection,
  PixiVfxProjectionPoint,
  PixiVfxRenderer,
  PixiVfxTextureProvider,
} from "nixie-fx/pixi";
import type { VfxExportedEffect } from "nixie-fx/export";
import type { VfxTextureAssetRef } from "nixie-fx";
import { publishedJSON, publishedTexture } from "./resources";
const fetchBundle = () => publishedJSON<any>("/vfx/skills.json");

// NixieFX highlights for Choose Your Hero: the "ui/…" effects of vfx/recipes/ui.mjs, from the game's one effect bundle
// (/vfx/skills.bin). Each control gets a slot: a container inside the screen, placed between its frame and its text,
// with its own renderer and a projection that stretches the effect's authored frame (card 3 × 4 units, button 4.8 × 1.2)
// onto the control's box in design pixels (+Y up becomes screen up). The screen works unchanged without them: if the
// runtime or bundle fails to load, slots are inert.
export type FxSlot = {
  play(key: string, o?: { loop?: boolean }): FxLoop;
  stop(): void;
};
export type FxLoop = { release(): void };
type Live = { inst: PixiVfxEffectInstance; loop: boolean; released: boolean };
const NONE: FxLoop = { release() {} };
const INERT: FxSlot = { play: () => NONE, stop() {} };

const shown = (c: Container | null) => {
  for (; c; c = c.parent) if (!c.visible) return false;
  return true;
};
export class ChooseHeroFx {
  private clock = 0;
  private slots = new Set<{
    root: Container;
    vfx: PixiVfxRenderer;
    live: Live[];
  }>();
  private constructor(
    private Renderer: typeof PixiVfxRenderer,
    private effects: Map<string, VfxExportedEffect>,
    private textures: PixiVfxTextureProvider,
  ) {
    Ticker.shared.add(this.tick, this);
  }
  static async load() {
    try {
      const [{ PixiVfxRenderer }, { loadVfxExportBundle }, packed] =
        await Promise.all([
          import("nixie-fx/pixi"),
          import("nixie-fx/export"),
          fetchBundle(),
        ]);
      const bundle = loadVfxExportBundle(
        { manifest: packed.manifest, effectsByPath: packed.effects },
        { requiredBackend: "pixi2d" },
      );
      const effects = new Map<string, VfxExportedEffect>();
      for (const fx of bundle.effectsById.values()) {
        const key = (fx.sourceEffectFile ?? fx.id).replace(/\.json$/, "");
        if (key.startsWith("ui/")) effects.set(key, fx);
      }
      const textures = new Map<string, Texture>(),
        refs = bundle.manifest.assets.filter(
          (a): a is VfxTextureAssetRef => a.type === "texture",
        );
      await Promise.all(
        refs.map(async (r) => {
          const tex = await publishedTexture({
            src: "/vfx/" + r.path,
            data: { scaleMode: "nearest" },
          });
          if (tex?.source) tex.source.scaleMode = "nearest";
          textures.set(r.path, tex);
        }),
      );
      return new ChooseHeroFx(PixiVfxRenderer, effects, {
        staticAssets: true,
        getTexture: (r) => textures.get(r.path),
        resolveUrl: (r) => "/vfx/" + r.path,
      });
    } catch (e) {
      console.warn(
        "Choose Your Hero highlights unavailable; the screen runs without them.",
        e,
      );
      return null;
    }
  }
  destroy() {
    Ticker.shared.remove(this.tick, this);
    this.stopAll();
    this.clear();
  }
  keys() {
    return [...this.effects.keys()];
  }
  // Before the screen rebuilds its layout: drop every slot (their containers go with the old layout).
  clear() {
    for (const s of this.slots) s.vfx.destroy();
    this.slots.clear();
  }
  // A slot for one control: frame = the effect's authored size in units, box = the control in its parent's pixels.
  slot(
    parent: Container,
    index: number,
    frame: [number, number],
    [x, y, w, h]: [number, number, number, number],
  ): FxSlot {
    const root = parent.addChildAt(new Container(), index),
      sx = w / frame[0],
      sy = h / frame[1],
      cx = x + w / 2,
      cy = y + h / 2;
    const projection: PixiVfxProjection = {
      project(p, out?: PixiVfxProjectionPoint) {
        const o = out ?? { x: 0, y: 0 };
        o.x = cx + p[0] * sx;
        o.y = cy - p[1] * sy;
        o.visible = true;
        return o;
      },
      pixelsPerWorldUnit: () => (sx + sy) / 2,
      depth: (p) => p[2],
    };
    const vfx = new this.Renderer({
      parent: root,
      textureProvider: this.textures,
      projection,
    });
    vfx.setBoundsArea(new Rectangle(x - w, y - h, w * 3, h * 3));
    const slot = { root, vfx, live: [] as Live[] };
    this.slots.add(slot);
    return {
      play: (key, o = {}) => {
        const fx = this.effects.get(key);
        if (!fx || root.destroyed) return NONE;
        const l: Live = {
          inst: vfx.createEffect(fx, {
            projection,
            position: [0, 0, 0],
            seed: (Math.random() * 0x7fffffff) | 0,
            timeSeconds: this.clock,
          }),
          loop: !!o.loop,
          released: false,
        };
        slot.live.push(l);
        return {
          release: () => {
            if (l.released) return;
            l.released = true;
            l.loop = false;
            const runner = (
              l.inst as unknown as { runner?: { allowCompletion?(): void } }
            ).runner;
            if (runner?.allowCompletion) runner.allowCompletion();
            else l.inst.stop();
          },
        };
      },
      stop: () => {
        for (const l of slot.live) {
          l.loop = false;
          vfx.removeEffect(l.inst, true);
        }
        slot.live.length = 0;
      },
    };
  }
  // Evidence captures freeze the effect clock and step it exactly (screenshots in software WebGL take longer than a frame).
  manual = false;
  step(seconds: number) {
    for (let t = 0; t < seconds - 1e-6; t += 1 / 60)
      this.advance(Math.min(1 / 60, seconds - t));
  }
  private tick(ticker: Ticker) {
    if (!this.manual) this.advance(Math.min(0.05, ticker.deltaMS / 1000));
  }
  private advance(dt: number) {
    let anyShown = false;
    for (const s of this.slots) {
      if (s.root.destroyed) {
        this.slots.delete(s);
        continue;
      }
      if (shown(s.root)) {
        anyShown = true;
        break;
      }
    }
    if (!anyShown) return;
    this.clock += dt;
    for (const s of this.slots) {
      // Hidden screens keep their particles frozen.
      if (s.root.destroyed) {
        this.slots.delete(s);
        continue;
      }
      if (!shown(s.root)) continue;
      s.vfx.update(dt, { timeSeconds: this.clock });
      for (let i = s.live.length - 1; i >= 0; i--) {
        const l = s.live[i];
        if (l.inst.isActive) continue;
        // Looping highlights replay when their run ends; finished one-shots are removed.
        if (l.loop)
          l.inst.spawn({
            position: [0, 0, 0],
            seed: (Math.random() * 0x7fffffff) | 0,
            timeSeconds: this.clock,
          });
        else {
          s.vfx.removeEffect(l.inst, true);
          s.live.splice(i, 1);
        }
      }
    }
  }
  stopAll() {
    for (const s of this.slots) {
      for (const l of s.live) {
        l.loop = false;
        s.vfx.removeEffect(l.inst, true);
      }
      s.live.length = 0;
    }
  }
}
export const inertSlot = () => INERT;
