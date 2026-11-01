/** Shared deterministic day clock. Phase 0 is midnight; .5 is noon. */
export const DAY_MS = 600_000;
export const MIN_AMBIENT_LUMA = 0.22;
export const MAX_SHADOW = 1.7;
export const SUNRISE = 0.1,
  SUNSET = 0.9;
export const wrapDay = (t: number) => t - Math.floor(t);
export type DaylightState = {
  phase: number;
  label: string;
  ambient: [number, number, number];
  tintHex: number;
  lightScale: number;
  sunStrength: number;
};
export type SunVector = {
  dx: number;
  dy: number;
  strength: number;
  maxShadow: number;
};
export const DAYLIGHT_KEYFRAMES = [
  { t: 0, ambient: [136 / 255, 112 / 255, 154 / 255], lightScale: 1 },
  { t: 0.1, ambient: [136 / 255, 112 / 255, 154 / 255], lightScale: 1 },
  { t: 0.22, ambient: [143 / 255, 115 / 255, 147 / 255], lightScale: 0.7 },
  { t: 0.28, ambient: [1, 233 / 255, 210 / 255], lightScale: 0.1 },
  { t: 0.36, ambient: [1, 1, 1], lightScale: 0 },
  { t: 0.64, ambient: [1, 1, 1], lightScale: 0 },
  { t: 0.72, ambient: [1, 214 / 255, 173 / 255], lightScale: 0.3 },
  { t: 0.78, ambient: [143 / 255, 117 / 255, 158 / 255], lightScale: 0.75 },
  { t: 19 / 24, ambient: [136 / 255, 112 / 255, 154 / 255], lightScale: 0.78 },
  { t: 0.9, ambient: [136 / 255, 112 / 255, 154 / 255], lightScale: 1 },
  { t: 1, ambient: [136 / 255, 112 / 255, 154 / 255], lightScale: 1 },
] as const;
export function srgbToLinear(v: number) {
  v = Math.max(0, Math.min(1, v));
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
export function linearToSrgb(v: number) {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}
export function rgbToHex(rgb: readonly number[]) {
  const [r, g, b] = rgb.map((v) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255),
  );
  return (r << 16) | (g << 8) | b;
}
export function enforceLumaFloor(
  rgb: [number, number, number],
  floor = MIN_AMBIENT_LUMA,
): [number, number, number] {
  const l = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return l < floor
    ? (rgb.map((v) => Math.min(1, l ? (v * floor) / l : floor)) as [
        number,
        number,
        number,
      ])
    : rgb;
}
export function sunAt(nowMs: number): SunVector {
  const t = wrapDay(nowMs / DAY_MS),
    s = (t - SUNRISE) / (SUNSET - SUNRISE);
  if (s <= 0 || s >= 1)
    return { dx: 0, dy: 0, strength: 0, maxShadow: MAX_SHADOW };
  const arc = Math.sin(Math.PI * s),
    elevation = (arc * Math.PI) / 3;
  const length = Math.min(
    MAX_SHADOW,
    1 / Math.cos(Math.PI / 6) / Math.tan(Math.max(0.01, elevation)),
  );
  const heading = ((60 + 180 * (s - 0.5)) * Math.PI) / 180,
    fade = Math.min(1, arc / 0.35);
  return {
    dx: Math.cos(heading) * length,
    dy: Math.sin(heading) * length * 0.5,
    strength: fade * fade * (3 - 2 * fade),
    maxShadow: MAX_SHADOW,
  };
}
export function daylightAt(nowMs: number): DaylightState {
  const t = wrapDay(nowMs / DAY_MS);
  const i = Math.max(
    1,
    DAYLIGHT_KEYFRAMES.findIndex((k, n) => n > 0 && t <= k.t),
  );
  const a = DAYLIGHT_KEYFRAMES[i - 1],
    b = DAYLIGHT_KEYFRAMES[i];
  const x = (t - a.t) / (b.t - a.t),
    s = x * x * (3 - 2 * x);
  const ambient = enforceLumaFloor(
    a.ambient.map((v, n) =>
      linearToSrgb(srgbToLinear(v) * (1 - s) + srgbToLinear(b.ambient[n]) * s),
    ) as [number, number, number],
  );
  const label =
    t < 0.1 || t >= 0.9
      ? "night"
      : t < 0.3
        ? "dawn"
        : t < 0.45
          ? "morning"
          : t < 0.55
            ? "noon"
            : t < 0.7
              ? "afternoon"
              : t < 0.8
                ? "dusk"
                : "twilight";
  return {
    phase: t,
    label,
    ambient,
    tintHex: rgbToHex(ambient),
    lightScale: a.lightScale * (1 - s) + b.lightScale * s,
    sunStrength: sunAt(nowMs).strength,
  };
}
export const PHASES: Record<string, number> = {
  dawn: 0.22,
  morning: 0.32,
  noon: 0.5,
  afternoon: 0.65,
  dusk: 19 / 24,
  twilight: 0.85,
  night: 0,
};
/** Explicit phase wins; live derives from the injected wall clock, never animation playback. */
export function resolveDaylightMs(phase?: string, nowMs = Date.now()): number {
  const fixed = PHASES[(phase ?? "").toLowerCase()];
  return fixed === undefined ? nowMs : fixed * DAY_MS;
}
export function clockLabel(t: number) {
  const m = Math.floor(wrapDay(t) * 1440);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
