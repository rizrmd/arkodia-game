import type { Application, Ticker } from "pixi.js";
import {
  FrameBudgetMonitor,
  QUALITY_SETTINGS,
  detectQualityTier,
  frameBudgetMs,
  isQualitySetting,
  isQualityTier,
  lowerTier,
  qualityLabel,
  resolveQuality,
  setActiveQuality,
  type DeviceHints,
  type QualityProfile,
  type QualitySetting,
  type QualityTier,
} from "./authored-scene/quality";

// Device-local: a player's choice and what this device measured. Never part of a save or scene.
const SETTING_KEY = "arkodia.quality";
const MEASURED_KEY = "arkodia.quality.measured";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

/** Probes the GPU with a throwaway context so the tier is known before the real canvas exists. */
export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const hints: DeviceHints = {
    cores: nav.hardwareConcurrency || undefined,
    memoryGB: nav.deviceMemory,
    devicePixelRatio: devicePixelRatio,
    mobile: matchMedia?.("(pointer: coarse)").matches ?? false,
  };
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ??
      canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (gl) {
      hints.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      hints.gpu = String(
        gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "",
      );
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {}
  return hints;
}

/**
 * The game's quality state: the player's setting, the device tier (detected once, lowered when
 * real frames run over budget, and remembered), and the profile in force.
 */
export class GameQuality {
  setting: QualitySetting;
  detected: QualityTier;
  profile: Readonly<QualityProfile>;
  readonly gpu: string;
  private monitor: FrameBudgetMonitor;
  private app?: Application;
  private listeners = new Set<() => void>();

  /** True when the setting came from the URL: kept for this page only, never saved. */
  readonly pinned: boolean;

  constructor(hints: DeviceHints = readDeviceHints()) {
    // ?quality=low|medium|high|auto pins a tier for evidence captures and device checks.
    const param = new URLSearchParams(location.search).get("quality");
    const saved = read(SETTING_KEY);
    this.pinned = isQualitySetting(param);
    // Automated browsers (software WebGL) keep High so existing pixel evidence stays comparable.
    const automated = navigator.webdriver === true;
    this.setting = isQualitySetting(param)
      ? param
      : automated
        ? "high"
        : isQualitySetting(saved)
          ? saved
          : "auto";
    const measured = read(MEASURED_KEY);
    const detected = detectQualityTier(hints);
    // A device that already proved slower than its hints keeps the lower tier.
    this.detected =
      isQualityTier(measured) &&
      QUALITY_TIER_ORDER[measured] < QUALITY_TIER_ORDER[detected]
        ? measured
        : detected;
    this.gpu = hints.gpu ?? "";
    this.profile = resolveQuality(this.setting, this.detected);
    setActiveQuality(this.profile);
    this.monitor = new FrameBudgetMonitor(frameBudgetMs(this.profile));
  }

  get resolution() {
    return Math.min(devicePixelRatio || 1, this.profile.maxResolution);
  }
  get label() {
    return this.setting === "auto"
      ? `Quality: Auto (${qualityLabel(this.profile.tier)})`
      : `Quality: ${qualityLabel(this.setting)}`;
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Applies the profile to a running app and watches its frames (Auto only steps down). */
  attach(app: Application) {
    this.app = app;
    this.applyLive();
    app.ticker.add(this.tick, this);
  }
  detach() {
    this.app?.ticker?.remove(this.tick, this);
    this.app = undefined;
  }

  /** Auto → Low → Medium → High → Auto. */
  cycle() {
    const i = QUALITY_SETTINGS.indexOf(this.setting);
    this.set(QUALITY_SETTINGS[(i + 1) % QUALITY_SETTINGS.length]!);
  }
  set(setting: QualitySetting) {
    this.setting = setting;
    if (!this.pinned) write(SETTING_KEY, setting);
    this.refresh();
  }

  private tick(ticker: Ticker) {
    if (this.setting !== "auto") return;
    if (!this.monitor.sample(ticker.deltaMS)) return;
    const next = lowerTier(this.detected);
    if (!next) return;
    console.info(
      `Quality: frames over ${this.monitor.budgetMs.toFixed(1)} ms on ${this.detected}; stepping down to ${next}.`,
    );
    this.detected = next;
    write(MEASURED_KEY, next);
    this.refresh();
  }

  private refresh() {
    this.profile = resolveQuality(this.setting, this.detected);
    setActiveQuality(this.profile);
    this.monitor.reset(frameBudgetMs(this.profile));
    this.applyLive();
    for (const fn of this.listeners) fn();
  }

  // Resolution and frame cap change live; MSAA belongs to the canvas and follows on next launch.
  private applyLive() {
    const app = this.app;
    if (!app?.renderer) return;
    app.ticker.maxFPS = this.profile.maxFPS;
    if (app.renderer.resolution !== this.resolution)
      app.renderer.resize(
        app.renderer.screen.width,
        app.renderer.screen.height,
        this.resolution,
      );
  }
}

const QUALITY_TIER_ORDER: Record<QualityTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
};
