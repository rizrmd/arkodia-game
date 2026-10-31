/** One reusable music voice, unlocked by the first browser user gesture. */
export class OpeningMusic {
  readonly audio = new Audio('/audio/bgm-opening.mp3');
  private unlocked = false;
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
    window.addEventListener('pointerdown', this.unlock, true);
    window.addEventListener('keydown', this.unlock, true);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.hide);
    window.addEventListener('pageshow', this.visibility);
  }
  private unlock = () => { this.unlocked = true; this.play(); };
  private hide = () => { this.audio.pause(); };
  private visibility = () => {
    if (document.hidden) this.audio.pause();
    else this.play();
  };
  private play() {
    if (this.disposed || !this.unlocked || this.muted || !this.volume || document.hidden) return;
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
  toggle() { this.unlocked = true; this.muted = !this.muted; this.save(); }
  adjust(delta: number) { this.unlocked = true; this.volume = Math.round(Math.max(0, Math.min(1, this.volume + delta)) * 100) / 100; this.save(); }
  get status() {
    return { loaded: this.audio.readyState >= 2, playing: !this.audio.paused, voices: this.audio.paused ? 0 : 1,
      volume: this.volume, muted: this.muted, error: this.audio.error?.message || null, loop: this.audio.loop };
  }
  destroy() {
    this.disposed = true;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    window.removeEventListener('pointerdown', this.unlock, true);
    window.removeEventListener('keydown', this.unlock, true);
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.hide);
    window.removeEventListener('pageshow', this.visibility);
  }
}
