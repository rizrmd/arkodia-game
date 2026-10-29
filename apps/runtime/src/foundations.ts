export class Input {
  keys = new Set<string>();
  target: { x: number; y: number } | null = null;
  private down = (e: KeyboardEvent) => {
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
    )
      e.preventDefault();
    this.keys.add(e.key.toLowerCase());
  };
  private up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private blur = () => {
    this.keys.clear();
    this.target = null;
  };
  constructor() {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.blur);
  }
  axis() {
    let x =
      Number(this.keys.has("d") || this.keys.has("arrowright")) -
      Number(this.keys.has("a") || this.keys.has("arrowleft"));
    let y =
      Number(this.keys.has("s") || this.keys.has("arrowdown")) -
      Number(this.keys.has("w") || this.keys.has("arrowup"));
    const n = Math.hypot(x, y);
    return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
  }
  destroy() {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.blur);
  }
}
export function move(
  position: { x: number; y: number },
  axis: { x: number; y: number },
  speed: number,
  dt: number,
  width: number,
  height: number,
) {
  position.x = Math.max(
    0,
    Math.min(width, position.x + axis.x * speed * Math.min(dt, 0.05)),
  );
  position.y = Math.max(
    0,
    Math.min(height, position.y + axis.y * speed * Math.min(dt, 0.05)),
  );
}
export function frameAt(
  elapsed: number,
  fps: number,
  count: number,
  loop: boolean,
) {
  return loop
    ? Math.floor(elapsed * fps) % count
    : Math.min(count - 1, Math.floor(elapsed * fps));
}
export function cameraFor(
  x: number,
  y: number,
  w: number,
  h: number,
  worldW: number,
  worldH: number,
) {
  return {
    x:
      worldW <= w
        ? (w - worldW) / 2
        : -Math.max(0, Math.min(worldW - w, x - w / 2)),
    y:
      worldH <= h
        ? (h - worldH) / 2
        : -Math.max(0, Math.min(worldH - h, y - h / 2)),
  };
}
/** Audio is created/resumed only from a user gesture; the scene owns teardown. */
export class AudioBus {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  enabled = false;
  async toggle(bytes?: ArrayBuffer) {
    if (!bytes) return false;
    this.context ??= new AudioContext();
    await this.context.resume();
    if (!this.buffer)
      this.buffer = await this.context.decodeAudioData(bytes.slice(0));
    if (!this.source) {
      this.source = this.context.createBufferSource();
      this.source.buffer = this.buffer;
      this.source.loop = true;
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.source.connect(this.gain).connect(this.context.destination);
      this.source.start();
    }
    this.enabled = !this.enabled;
    this.gain!.gain.setTargetAtTime(
      this.enabled ? 0.18 : 0,
      this.context.currentTime,
      0.08,
    );
    return this.enabled;
  }
  destroy() {
    this.source?.stop();
    void this.context?.close();
    this.context = null;
    this.source = null;
    this.buffer = null;
    this.enabled = false;
  }
}
