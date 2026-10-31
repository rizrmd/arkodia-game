/** Try opening music immediately; retry on any gesture when autoplay is blocked. */
export class OpeningMusic {
  readonly audio = new Audio('/audio/bgm-opening.mp3');
  private readonly gestures = ["pointerdown", "pointerup", "touchend", "click", "keydown"];
  private disposed = false;
  private muted = false;
  private volume = 0.35;
  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem('arkodia.music') || 'null');
      if (saved && typeof saved.muted === 'boolean') this.muted = saved.muted;
      if (saved && typeof saved.volume === 'number' && Number.isFinite(saved.volume))
        this.volume = Math.max(0, Math.min(1, saved.volume));
    } catch { /* Storage is optional. */ }
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.apply();
    for (const event of this.gestures) window.addEventListener(event, this.unlock, true);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.hide);
    window.addEventListener('pageshow', this.visibility);
  }
  private unlock = () => { this.play(); };
  private hide = () => { this.audio.pause(); };
  private visibility = () => {
    if (document.hidden) this.audio.pause();
    else this.play();
  };
  private play() {
    if (this.disposed || this.muted || !this.volume || document.hidden) return;
    // Repeated gestures use the same element and never reset its playhead.
    if (this.audio.paused) void this.audio.play().catch(() => { /* Retry on the next gesture. */ });
  }
  private apply() {
    this.audio.volume = this.volume;
    this.audio.muted = this.muted;
    if (this.muted || !this.volume) this.audio.pause();
    else this.play();
  }
  private save() {
    try { localStorage.setItem('arkodia.music', JSON.stringify({ muted: this.muted, volume: this.volume })); } catch { /* Storage is optional. */ }
    this.apply();
  }
  toggle() { this.muted = !this.muted; this.save(); }
  adjust(delta: number) { this.volume = Math.round(Math.max(0, Math.min(1, this.volume + delta)) * 100) / 100; this.save(); }
  get status() {
    return { loaded: this.audio.readyState >= 2, playing: !this.audio.paused, voices: this.audio.paused ? 0 : 1,
      position: this.audio.currentTime, volume: this.volume, muted: this.muted, error: this.audio.error?.message || null, loop: this.audio.loop };
  }
  destroy() {
    this.disposed = true;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    for (const event of this.gestures) window.removeEventListener(event, this.unlock, true);
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.hide);
    window.removeEventListener('pageshow', this.visibility);
  }
}
