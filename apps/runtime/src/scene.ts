import { Container, Graphics, Sprite, Text, Texture, Rectangle } from "pixi.js";
import type { Bundle } from "./content";
import { AudioBus, Input, cameraFor, frameAt, move } from "./foundations";
export class RuntimeScene {
  world = new Container();
  input = new Input();
  audio = new AudioBus();
  private entities: {
    id: string;
    sprite: Sprite;
    frames: Texture[];
    fps: number;
    loop: boolean;
    elapsed: number;
    player: boolean;
  }[] = [];
  player!: Sprite;
  private textures: Texture[] = [];
  private sources: Texture[] = [];
  private bitmaps: ImageBitmap[] = [];
  private destroyed = false;
  constructor(public bundle: Bundle) {}
  async init() {
    const source = new Map<string, Texture>();
    for (const [id, a] of this.bundle.assets) {
      if (!a.mediaType.startsWith("image/")) continue;
      const bitmap = await createImageBitmap(
        new Blob([a.bytes], { type: a.mediaType }),
      );
      if (this.destroyed) {
        bitmap.close();
        return;
      }
      const t = Texture.from(bitmap);
      source.set(id, t);
      this.sources.push(t);
      this.bitmaps.push(bitmap);
    }
    const scene = this.bundle.scene;
    const g = new Graphics()
      .rect(0, 0, scene.width, scene.height)
      .fill(0x1a3535);
    for (let x = 0; x < scene.width; x += 80)
      for (let y = 0; y < scene.height; y += 80) {
        g.rect(x + 1, y + 1, 78, 78).fill(
          (x / 80 + y / 80) % 2 ? 0x1c3938 : 0x1e3c3b,
        );
        g.circle(x + 23, y + 39, 2).fill(0x416358);
      }
    g.roundRect(50, scene.height / 2 - 85, scene.width - 100, 170, 70).fill(
      0x3c4840,
    );
    g.roundRect(scene.width / 2 - 95, 50, 190, scene.height - 100, 60).fill(
      0x3c4840,
    );
    g.circle(scene.spawn.x, scene.spawn.y, 75).stroke({
      color: 0xaedab4,
      width: 2,
      alpha: 0.4,
    });
    this.world.addChild(g);
    const landmark = new Text({
      text: "THE PUBLISHED GROVE",
      style: {
        fontFamily: "Arial",
        fontSize: 23,
        fill: 0x99bca9,
        letterSpacing: 5,
      },
    });
    landmark.anchor.set(0.5);
    landmark.position.set(scene.width / 2, 130);
    this.world.addChild(landmark);
    const objects = new Container();
    objects.sortableChildren = true;
    this.world.addChild(objects);
    for (const layer of scene.layers)
      for (const o of layer.objects) {
        const c = this.bundle.clips.get(o.animation)!;
        const frames = c.frames.map((f) => {
          const atlas = source.get(f.asset);
          if (
            !atlas ||
            f.x + f.width > atlas.width ||
            f.y + f.height > atlas.height
          )
            throw new Error("Animation frame exceeds decoded asset dimensions");
          const t = new Texture({
            source: atlas.source,
            frame: new Rectangle(f.x, f.y, f.width, f.height),
          });
          this.textures.push(t);
          return t;
        });
        const s = new Sprite(frames[0]);
        s.anchor.set(0.5, 0.87);
        s.scale.set(o.scale);
        s.position.set(
          o.player ? scene.spawn.x : o.x,
          o.player ? scene.spawn.y : o.y,
        );
        s.zIndex = s.y;
        objects.addChild(s);
        this.entities.push({
          id: o.id,
          sprite: s,
          frames,
          fps: c.fps,
          loop: c.loop,
          elapsed: 0,
          player: !!o.player,
        });
        if (o.player) this.player = s;
      }
  }
  tick(dt: number, w: number, h: number) {
    const axis = this.input.axis();
    const p = this.player;
    let vector = axis;
    if (axis.x || axis.y) this.input.target = null;
    else if (this.input.target) {
      const x = this.input.target.x - p.x,
        y = this.input.target.y - p.y,
        n = Math.hypot(x, y);
      if (n < 6) this.input.target = null;
      else vector = { x: x / n, y: y / n };
    }
    move(
      p,
      vector,
      this.bundle.scene.speed,
      dt,
      this.bundle.scene.width,
      this.bundle.scene.height,
    );
    for (const e of this.entities) {
      if (!e.player || vector.x || vector.y) e.elapsed += Math.min(dt, 0.05);
      else e.elapsed = 0;
      e.sprite.texture =
        e.frames[frameAt(e.elapsed, e.fps, e.frames.length, e.loop)];
      e.sprite.zIndex = e.sprite.y;
    }
    const camera = cameraFor(
      p.x,
      p.y,
      w,
      h,
      this.bundle.scene.width,
      this.bundle.scene.height,
    );
    this.world.position.set(camera.x, camera.y);
  }
  toggleAudio() {
    return this.audio.toggle(
      this.bundle.scene.audio
        ? this.bundle.assets.get(this.bundle.scene.audio)?.bytes
        : undefined,
    );
  }
  destroy() {
    this.destroyed = true;
    this.input.destroy();
    this.audio.destroy();
    this.world.destroy({ children: true });
    for (const t of this.textures) t.destroy();
    this.textures = [];
    for (const t of this.sources) t.destroy(true);
    this.sources = [];
    for (const b of this.bitmaps) b.close();
    this.bitmaps = [];
  }
}
