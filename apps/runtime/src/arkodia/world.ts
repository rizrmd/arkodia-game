import {
  Container,
  Graphics,
  Sprite,
  Texture,
  Rectangle,
  Matrix,
  TilingSprite,
} from "pixi.js";
import type { Resources, Prop } from "./resources";
import type { HeroId } from "./heroes";
import { strongholdCollision, walkStep } from "./collision";
import { applyNativeProp } from "../authored-scene/renderer";
import { createAutoWalk } from "../navigation";
export class StrongholdWorld {
  world = new Container();
  objects = new Container();
  player = new Sprite();
  shadow = new Graphics();
  gateFrame = 0;
  clip = "idle-SE";
  private elapsed = 0;
  private gait = 0;
  private facing = 1;
  private back = false;
  private vertical = false;
  private horizontal = false;
  private frames: Texture[] = [];
  private gateFrames: Texture[] = [];
  private gate = new Sprite();
  private gateClock = 0;
  collision: ReturnType<typeof strongholdCollision>;
  walker: ReturnType<typeof createAutoWalk>;
  cx = 590;
  cy = 380;
  zoom = 1;
  pan = { x: 0, y: 0 };
  private savedAt = 0;
  constructor(
    public resources: Resources,
    public hero: HeroId,
  ) {
    const p = resources.data.prefab;
    this.collision = strongholdCollision(
      p,
      resources.data.nav.columns,
      resources.data.ui["/world/map.json"] as any,
    );
    const texture = (path: string) => resources.texture(path);
    // Same 2:1 material projection and density as original world-view.ts/snow-material.ts.
    const material = (path: string, density: number) => {
      const t = texture(path),
        s = (density * 1024) / t.width;
      const tile = new TilingSprite({ texture: t, width: 5000, height: 5000 });
      tile.position.set(-1800, -1600);
      tile.tileTransform.setFromMatrix(
        new Matrix(
          s,
          s * 0.5,
          -s,
          s * 0.5,
          p.court.origin.x + 1800,
          p.court.origin.y + 1600,
        ),
      );
      return tile;
    };
    this.world.addChild(
      material("/modular-stronghold/v2/snow-soft-texture.png", 0.7),
    );
    const paving = material(
        "/modular-stronghold/v2/paving-warm-texture.png",
        0.22,
      ),
      C = p.court,
      o = C.origin,
      n = C.size;
    const mask = new Graphics()
      .poly([
        o.x,
        o.y,
        o.x + n * 64,
        o.y + n * 32,
        o.x,
        o.y + n * 64,
        o.x - n * 64,
        o.y + n * 32,
      ])
      .fill(0xffffff);
    paving.mask = mask;
    this.world.addChild(paving, mask);
    this.objects.sortableChildren = true;
    this.world.addChild(this.objects);
    for (const prop of resources.data.props) this.prop(prop);
    // Fresh level-one core is the original campfire, not a restored castle/building layout.
    this.prop({
      id: "campfire",
      file: "/buildings/starting-campfire/campfire-v1.png",
      x: 577,
      y: 320,
      width: 320,
      foot: 545 / 887,
      vertical: 1,
      shear: 0,
      depth: 320,
      layer: "world",
    });
    for (const light of p.lights) {
      const x = p.court.origin.x + (light.u - light.v) * 64,
        y = p.court.origin.y + (light.u + light.v) * 32;
      if (!light.wall) {
        const post = new Graphics()
          .moveTo(x, y - light.lift + 13.5)
          .lineTo(x, y)
          .stroke({ color: 0x3b2a20, width: 3.75 });
        post.zIndex = y;
        this.objects.addChild(post);
      }
      const torch = new Sprite(texture("/realistic-torch/frame-3.webp"));
      torch.position.set(x - 12, y - light.lift - 15.75);
      torch.width = 24;
      torch.height = 39;
      torch.zIndex = y;
      this.objects.addChild(torch);
    }
    const sheet = texture("/buildings/starter-boundary/gate-sheet.png");
    for (let i = 0; i < 16; i++)
      this.gateFrames.push(
        new Texture({
          source: sheet.source,
          frame: new Rectangle(
            (i % 4) * 512,
            Math.floor(i / 4) * 256,
            512,
            256,
          ),
        }),
      );
    this.gate.texture = this.gateFrames[0];
    this.gate.anchor.set(0.5, 0.97);
    this.gate.position.set(p.gate.x, p.buildings.gate.y);
    this.gate.width = 270;
    this.gate.height = 135;
    this.gate.zIndex = 778;
    this.objects.addChild(this.gate);
    const a = resources.data.characters[hero],
      sheetHero = texture("/assets/characters/" + a.image);
    this.frames = a.frames.map(
      (f) =>
        new Texture({
          source: sheetHero.source,
          frame: new Rectangle(f.x, f.y, f.w, f.h),
        }),
    );
    this.player.texture = this.frames[0];
    this.player.anchor.set(
      a.cell.pivot.x / a.cell.w,
      a.cell.pivot.y / a.cell.h,
    );
    this.player.scale.set(0.66);
    this.player.position.set(p.heroSpawn.x, p.heroSpawn.y);
    try {
      const saved = JSON.parse(
        localStorage.getItem("arkodia.runtime.position.v1." + hero) || "null",
      );
      if (
        saved &&
        saved.release === resources.published.manifest.id &&
        [saved.x, saved.y].every(Number.isFinite) &&
        !this.collision.blocked(saved.x, saved.y, true)
      )
        this.player.position.set(saved.x, saved.y);
    } catch {}
    this.shadow.ellipse(0, 0, 12, 5).fill({ color: 0x182126, alpha: 0.22 });
    this.objects.addChild(this.shadow, this.player);
    this.cx = this.player.x;
    this.cy = this.player.y - 40;
    this.walker = createAutoWalk({
      position: () => this.player.position,
      blocked: (x, y) => this.collision.blocked(x, y, this.gateFrame >= 12),
      onMap: this.collision.onMap,
      passage: this.collision.passage,
    });
  }
  private prop(p: Prop) {
    const s = new Sprite(this.resources.texture(p.file));
    applyNativeProp(s,p);
    s.zIndex = p.layer === "ground" ? -10000 : p.depth;
    this.objects.addChild(s);
  }
  tick(dt: number, w: number, h: number, input: { x: number; y: number }) {
    dt = Math.min(dt, 0.05);
    const p = this.player,
      G = this.resources.data.prefab.gate;
    const manual = Boolean(input.x || input.y),
      d = this.walker.input(input),
      r = G.trigger[this.gateFrame > 0 ? "open" : "closed"];
    const near = Math.abs(p.x - G.x) < r.x && Math.abs(p.y - G.trigger.y) < r.y;
    this.gateClock += dt;
    while (this.gateClock >= 1 / 24) {
      this.gateClock -= 1 / 24;
      this.gateFrame = Math.max(
        0,
        Math.min(15, this.gateFrame + (near ? 1 : -1)),
      );
    }
    this.gate.texture = this.gateFrames[this.gateFrame];
    const ox = p.x,
      oy = p.y;
    const next = walkStep(p.x, p.y, d, dt, (x, y) =>
      this.collision.blocked(x, y, this.gateFrame / 15 >= G.passableAt),
    );
    p.position.set(next.x, next.y);
    const moving = next.progress > dt * 2;
    if (moving) {
      const l = Math.hypot(d.x, d.y);
      this.vertical =
        Math.abs(d.x) / l <
        Math.sin(((this.vertical ? 15 : 10) * Math.PI) / 180);
      this.horizontal =
        Math.abs(d.y) / l <
        Math.sin(((this.horizontal ? 15 : 10) * Math.PI) / 180);
      this.back = Math.abs(d.y) / l > 0.15 ? d.y < 0 : false;
      if (Math.abs(d.x) / l > 0.15) this.facing = d.x > 0 ? 1 : -1;
    }
    const view = this.vertical
      ? this.back
        ? "N"
        : "S"
      : this.horizontal
        ? "E"
        : this.back
          ? "NE"
          : "SE";
    const clip = (moving ? "move" : "idle") + "-" + view;
    if (clip !== this.clip) {
      this.clip = clip;
      this.elapsed = 0;
    }
    this.elapsed += dt;
    const a = this.resources.data.characters[this.hero],
      c = a.clips[this.clip];
    if (moving) {
      const dx = p.x - ox,
        dy = p.y - oy,
        fullSpeed = Math.hypot(dx, dy) / Math.hypot(dx / 120, dy / 90);
      this.gait += next.progress / fullSpeed;
    }
    const t = moving ? this.gait : this.elapsed;
    const i = c.frames[Math.floor(t * c.fps) % c.frames.length];
    this.player.texture = this.frames[i];
    this.player.scale.x = 0.66 * (this.vertical ? 1 : this.facing);
    this.player.zIndex = p.y;
    this.shadow.position.set(p.x, p.y);
    this.shadow.zIndex = p.y - 0.01;
    const scale =
      Math.max(
        0.45,
        Math.min(
          1.35,
          Math.max(1, Math.min(1.35, h / 630)),
          (w - 24) / 180,
          Math.max(180, h - 240) / 110,
        ),
      ) * this.zoom;
    // Original follow dead-zone and lag, with manual pan retained until walking resumes.
    if (moving || manual) {
      this.cx += this.pan.x;
      this.cy += this.pan.y;
      this.pan = { x: 0, y: 0 };
      const zx = (w / scale) * 0.16,
        zy = (h / scale) * 0.14,
        tx = p.x - Math.max(-zx, Math.min(zx, p.x - this.cx)),
        ty = p.y - 40 - Math.max(-zy, Math.min(zy, p.y - 40 - this.cy)),
        k = 1 - Math.exp(-dt / 0.11);
      this.cx += (tx - this.cx) * k;
      this.cy += (ty - this.cy) * k;
    }
    this.world.scale.set(scale);
    this.world.position.set(
      w / 2 - (this.cx + this.pan.x) * scale,
      h / 2 - (this.cy + this.pan.y) * scale,
    );
    this.savedAt += dt;
    if (this.savedAt > 1) {
      this.save();
      this.savedAt = 0;
    }
  }
  save() {
    try {
      localStorage.setItem(
        "arkodia.runtime.position.v1." + this.hero,
        JSON.stringify({
          release: this.resources.published.manifest.id,
          x: this.player.x,
          y: this.player.y,
        }),
      );
    } catch {}
  }
  goTo(x: number, y: number) {
    return this.walker.goTo(x, y);
  }
  destroy() {
    this.save();
    this.world.destroy({ children: true });
    for (const t of [...this.frames, ...this.gateFrames]) t.destroy();
  }
}
