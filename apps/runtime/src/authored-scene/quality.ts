/**
 * Device quality tiers shared by the game runtime and the editor preview.
 *
 * Low-end devices drop frames on full-screen filters, high pixel counts, dense additive
 * particles and per-frame texture uploads. A tier caps each of those costs. Frame selection
 * stays time-based everywhere, so a lower tier skips work, never slows animations down.
 *
 * Pure data and logic: no DOM or Pixi imports, so it runs in tests and workers.
 */
export type QualityTier = "low" | "medium" | "high";
/** What the player or author picked; "auto" resolves to the detected tier. */
export type QualitySetting = QualityTier | "auto";
/** How a VFX layer behaves below High: drop it on Low, scale its particle count, or keep it whole. */
export type LayerQuality = "keep" | "reduce" | "skip";

export const QUALITY_TIERS: readonly QualityTier[] = ["low", "medium", "high"];
export const QUALITY_SETTINGS: readonly QualitySetting[] = [
  "auto",
  "low",
  "medium",
  "high",
];
export const LAYER_QUALITY_MODES: readonly LayerQuality[] = [
  "reduce",
  "keep",
  "skip",
];

export type QualityProfile = {
  tier: QualityTier;
  /** Renderer resolution is min(devicePixelRatio, maxResolution). */
  maxResolution: number;
  /** MSAA on the main canvas (applies when the canvas is created). */
  antialias: boolean;
  /** Ticker cap; 0 = uncapped. A steady 30 reads smoother than a jittering 40–60. */
  maxFPS: number;
  /** Filters over the whole scene (world lighting, heat distortion). */
  sceneFilterResolution: number;
  /** Soft effect filters (blurs, bloom), where lost detail is invisible. */
  effectFilterResolution: number;
  /** Upper bound on BlurFilter passes. */
  blurQualityCap: number;
  /** VFX emissive bloom pass. */
  bloom: boolean;
  /** VFX heat-distortion pass. */
  distortion: boolean;
  /** Particle count multiplier for VFX layers in "reduce" mode. */
  particleDensity: number;
  /** Concurrent VFX instances; 0 = no limit. The oldest instance yields first. */
  maxEffects: number;
  /** Redraw/upload rate of 3D-rendered characters; 0 = every frame. */
  characterFPS: number;
  /**
   * Editor viewports render at this fraction of their resolution (fewer pixels for every
   * filter, shader and blend). Pointer and layout maths use CSS pixels, so only sharpness changes.
   */
  renderScale: number;
  /** Minimum time between moving-shadow field rebuilds (gate, actors). */
  shadowIntervalMs: number;
};

export const QUALITY_PROFILES: Readonly<
  Record<QualityTier, Readonly<QualityProfile>>
> = {
  low: {
    tier: "low",
    maxResolution: 1,
    antialias: false,
    maxFPS: 30,
    sceneFilterResolution: 0.75,
    effectFilterResolution: 0.5,
    blurQualityCap: 1,
    bloom: false,
    distortion: false,
    particleDensity: 0.35,
    maxEffects: 3,
    characterFPS: 15,
    renderScale: 0.75,
    shadowIntervalMs: 120,
  },
  medium: {
    tier: "medium",
    maxResolution: 1.5,
    antialias: false,
    maxFPS: 60,
    sceneFilterResolution: 1,
    effectFilterResolution: 0.75,
    blurQualityCap: 2,
    bloom: true,
    distortion: false,
    particleDensity: 0.7,
    maxEffects: 6,
    characterFPS: 30,
    renderScale: 1,
    shadowIntervalMs: 64,
  },
  high: {
    tier: "high",
    maxResolution: 2,
    antialias: true,
    maxFPS: 0,
    sceneFilterResolution: 1,
    effectFilterResolution: 1,
    blurQualityCap: 8,
    bloom: true,
    distortion: true,
    particleDensity: 1,
    maxEffects: 0,
    characterFPS: 0,
    renderScale: 1,
    shadowIntervalMs: 32,
  },
};

export const isQualitySetting = (v: unknown): v is QualitySetting =>
  QUALITY_SETTINGS.includes(v as QualitySetting);
export const isQualityTier = (v: unknown): v is QualityTier =>
  QUALITY_TIERS.includes(v as QualityTier);

export function resolveQuality(
  setting: QualitySetting,
  detected: QualityTier,
): Readonly<QualityProfile> {
  return QUALITY_PROFILES[setting === "auto" ? detected : setting];
}

/** One step down, or undefined at Low. */
export function lowerTier(tier: QualityTier): QualityTier | undefined {
  const i = QUALITY_TIERS.indexOf(tier);
  return i > 0 ? QUALITY_TIERS[i - 1] : undefined;
}

export const qualityLabel = (s: QualitySetting) =>
  s === "auto" ? "Auto" : s[0]!.toUpperCase() + s.slice(1);

// ------------------------------------------------------------------ active profile
// Shared scene modules (lighting, atmosphere, frontier shadows) read this when they build
// their filters. The default is High, so a host that never sets it renders exactly as before.
let active: Readonly<QualityProfile> = QUALITY_PROFILES.high;
export const activeQuality = () => active;
export function setActiveQuality(profile: Readonly<QualityProfile>) {
  active = profile;
}

/** BlurFilter options for an authored blur under the active (or given) profile. */
export function blurOptions(
  strength: number,
  quality: number,
  profile: Readonly<QualityProfile> = active,
) {
  return {
    strength,
    quality: Math.max(1, Math.min(quality, profile.blurQualityCap)),
    resolution: profile.effectFilterResolution,
  };
}

// ------------------------------------------------------------------ VFX layer budgets
/** Particle count for a layer at this tier. Never zero unless the authored count is, or the layer is skipped. */
export function layerCount(
  count: number,
  profile: Readonly<QualityProfile>,
  mode: LayerQuality = "reduce",
) {
  if (count <= 0) return 0;
  if (!layerVisible(mode, profile)) return 0;
  if (mode === "keep" || profile.particleDensity >= 1) return count;
  return Math.max(1, Math.round(count * profile.particleDensity));
}

/** "skip" layers are dropped only at Low; at Medium they reduce like any other layer. */
export const layerVisible = (
  mode: LayerQuality | undefined,
  profile: Readonly<QualityProfile>,
) => !(mode === "skip" && profile.tier === "low");

// ------------------------------------------------------------------ detection
export type DeviceHints = {
  /** navigator.hardwareConcurrency */
  cores?: number;
  /** navigator.deviceMemory (GiB, Chromium only) */
  memoryGB?: number;
  devicePixelRatio?: number;
  /** gl.MAX_TEXTURE_SIZE */
  maxTextureSize?: number;
  /** Unmasked GPU renderer string, when the browser exposes it. */
  gpu?: string;
  /** Touch-first device (phones/tablets). */
  mobile?: boolean;
};

// Software rasterisers and GPU families that cannot sustain full-screen filters at 60 fps.
const LOW_END_GPU =
  /swiftshader|llvmpipe|softpipe|software|basic render|mali-[24]\d\d|mali-t[678]\d\d|adreno[^0-9]*[1-4]\d\d\b|powervr sgx|powervr rogue g[e6]\d|videocore|intel.*hd graphics (2|3|4|5)\d{3}|intel.*hd graphics$|gma/i;

export function detectQualityTier(h: DeviceHints): QualityTier {
  if (h.gpu && LOW_END_GPU.test(h.gpu)) return "low";
  let score = 0;
  if (h.cores !== undefined)
    score += h.cores <= 2 ? -2 : h.cores <= 4 ? -1 : h.cores >= 8 ? 1 : 0;
  if (h.memoryGB !== undefined)
    score +=
      h.memoryGB <= 2 ? -2 : h.memoryGB <= 4 ? -1 : h.memoryGB >= 8 ? 1 : 0;
  if (h.maxTextureSize !== undefined)
    score += h.maxTextureSize < 4096 ? -2 : h.maxTextureSize >= 16384 ? 1 : 0;
  // Phones with dense screens pay for many pixels on a small GPU.
  if (h.mobile && (h.devicePixelRatio ?? 1) >= 2.5) score -= 1;
  if (h.mobile && score > 0) score = 0;
  return score <= -2 ? "low" : score >= 2 ? "high" : "medium";
}

// ------------------------------------------------------------------ adaptive downgrade
/** Frame-time budget for a profile: its FPS cap (or 60) with headroom for jitter. */
export function frameBudgetMs(profile: Readonly<QualityProfile>) {
  return (1000 / (profile.maxFPS || 60)) * 1.35;
}

/**
 * Watches real frame times. After a warm-up (shader compiles and texture uploads are
 * one-off), each window's average is compared with the budget; a window over budget asks
 * the host to step down. Hidden-tab gaps are ignored.
 */
export class FrameBudgetMonitor {
  private warm = 0;
  private sum = 0;
  private frames = 0;
  private span = 0;
  constructor(
    public budgetMs: number,
    private windowMs = 3000,
    private warmupMs = 2500,
  ) {}
  /** Feed one frame; true when the window just closed over budget. */
  sample(deltaMS: number): boolean {
    if (!(deltaMS > 0) || deltaMS > 250) return false;
    if (this.warm < this.warmupMs) {
      this.warm += deltaMS;
      return false;
    }
    this.sum += deltaMS;
    this.frames++;
    this.span += deltaMS;
    if (this.span < this.windowMs) return false;
    const average = this.sum / this.frames;
    this.sum = this.frames = this.span = 0;
    return average > this.budgetMs;
  }
  /** Restart, including the warm-up, after the host changes tier. */
  reset(budgetMs = this.budgetMs) {
    this.budgetMs = budgetMs;
    this.warm = this.sum = this.frames = this.span = 0;
  }
}
