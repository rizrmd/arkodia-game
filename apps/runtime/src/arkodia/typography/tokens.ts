// Named text roles shared by every screen (HUD, Choose Your Hero, …). Sizes, spacing and effect widths are design
// pixels of the screen's reference canvas (1672 × 941 desktop, 864 × 1824 portrait); the scene scale maps them to CSS px.
// Fonts are MSDF atlases (public/typography/v2/fonts): EB Garamond Medium for body text, Cinzel SemiBold for display caps.

export type FontKey = "body" | "display" | "console";
export const FONTS: Record<
  FontKey,
  {
    family: string;
    file: string;
    weight: number;
    licence: string;
    capHeight: number;
  }
> = {
  console: {
    family: "EBGaramond-Bold",
    file: "garamond-bold.fnt",
    weight: 700,
    licence: "EBGaramond-OFL.txt",
    capHeight: 0.65,
  },
  body: {
    family: "EBGaramond-Medium",
    file: "garamond-medium.fnt",
    weight: 500,
    licence: "EBGaramond-OFL.txt",
    capHeight: 0.65,
  },
  display: {
    family: "Cinzel-SemiBold",
    file: "cinzel-semibold.fnt",
    weight: 600,
    licence: "Cinzel-OFL.txt",
    capHeight: 0.7,
  },
};

export type Rgb = number;
export interface Stroke {
  color: Rgb;
  alpha: number;
  width: number;
}
export interface Shadow {
  color: Rgb;
  alpha: number;
  dx: number;
  dy: number;
  softness: number;
}
export interface TextRole {
  font: FontKey;
  size: number;
  letterSpacing: number;
  // One colour is a solid fill; three are a vertical gradient (cap top → middle → baseline), evaluated in the shader.
  fill: Rgb | [Rgb, Rgb, Rgb];
  outline?: Stroke;
  shadow?: Shadow;
  // Optional halo, switched on per scene (setGlow) rather than always drawn.
  glow?: Stroke;
  lineHeight?: number;
  align?: "left" | "center" | "right";
  uppercase?: boolean;
}

export const IVORY = 0xf3e6c6,
  IVORY_DIM = 0xe4d8c2,
  GOLD = 0xf6d04c,
  GOLD_LABEL = 0xe2bd72;
export const GOLD_GRADIENT: [Rgb, Rgb, Rgb] = [0xfff4cc, 0xf0c464, 0xa86e26];
// Light HUD shadow: a 1.5 px drop that stays soft instead of a heavy contour.
const softShadow: Shadow = {
  color: 0x000000,
  alpha: 0.72,
  dx: 0,
  dy: 1.5,
  softness: 1.6,
};
const snowShadow: Shadow = {
  color: 0x000000,
  alpha: 0.95,
  dx: 0,
  dy: 1.5,
  softness: 3.2,
};
const displayShadow: Shadow = {
  color: 0x000000,
  alpha: 0.8,
  dx: 0,
  dy: 3,
  softness: 4,
};
const darkOutline: Stroke = { color: 0x2a1606, alpha: 0.95, width: 1.4 };
const warmGlow: Stroke = { color: 0xffb347, alpha: 0.45, width: 5 };

export const ROLES = {
  // Display caps: Cinzel's lower case is small caps, so "Ember Warden" sets as EMBER WARDEN with tall initials.
  "display-title": {
    font: "display",
    size: 49,
    letterSpacing: 0.6,
    fill: GOLD_GRADIENT,
    outline: darkOutline,
    shadow: displayShadow,
    glow: warmGlow,
  },
  "display-name": {
    font: "display",
    size: 42.5,
    letterSpacing: 0.5,
    fill: GOLD_GRADIENT,
    outline: darkOutline,
    shadow: displayShadow,
    glow: warmGlow,
  },
  "display-button": {
    font: "display",
    size: 33,
    letterSpacing: 0.6,
    fill: GOLD_GRADIENT,
    outline: darkOutline,
    shadow: displayShadow,
    glow: warmGlow,
  },
  // Wide-tracked label: small gold caps.
  "label-wide": {
    font: "display",
    size: 19,
    letterSpacing: 3.2,
    fill: GOLD_LABEL,
    shadow: softShadow,
    uppercase: true,
  },
  // Body serif, solid ivory.
  "body-lg": {
    font: "body",
    size: 25,
    letterSpacing: 0,
    fill: IVORY,
    shadow: softShadow,
  },
  body: {
    font: "body",
    size: 22,
    letterSpacing: 0,
    fill: IVORY,
    shadow: softShadow,
  },
  // Gold accent: body font, gold tint only.
  accent: {
    font: "body",
    size: 21,
    letterSpacing: 0,
    fill: GOLD,
    shadow: softShadow,
  },
  // Paragraph: wrapped and centred in its panel; the wrap width comes from the panel at layout time.
  paragraph: {
    font: "body",
    size: 19.5,
    letterSpacing: 0,
    fill: IVORY_DIM,
    shadow: softShadow,
    lineHeight: 26,
    align: "center",
  },
  // HUD.
  "hud-name": {
    font: "body",
    size: 27,
    letterSpacing: 0.2,
    fill: IVORY,
    shadow: softShadow,
    outline: { color: 0x000000, alpha: 0.5, width: 0.6 },
  },
  "hud-value": {
    font: "body",
    size: 21,
    letterSpacing: 0.2,
    fill: IVORY,
    shadow: softShadow,
  },
  "hud-stat": {
    font: "body",
    size: 26,
    letterSpacing: 0.2,
    fill: IVORY,
    shadow: softShadow,
  },
  "hud-level": {
    font: "body",
    size: 28,
    letterSpacing: 0,
    fill: IVORY,
    shadow: softShadow,
  },
  "hud-skill": {
    font: "body",
    size: 22.5,
    letterSpacing: 0.1,
    fill: IVORY,
    shadow: snowShadow,
    outline: { color: 0x0a0604, alpha: 0.7, width: 1 },
    glow: { color: 0x000000, alpha: 0.45, width: 5 },
  },
  "hud-badge": {
    font: "body",
    size: 17.5,
    letterSpacing: 0.2,
    fill: IVORY,
    shadow: softShadow,
  },
  "hud-state": {
    font: "body",
    size: 17,
    letterSpacing: 0.8,
    fill: 0xf7e2ae,
    shadow: softShadow,
    uppercase: true,
  },
  "hud-xp": {
    font: "body",
    size: 22.5,
    letterSpacing: 0.2,
    fill: IVORY,
    shadow: softShadow,
  },
  "hud-xp-accent": {
    font: "body",
    size: 22.5,
    letterSpacing: 0.2,
    fill: GOLD,
    shadow: softShadow,
  },
  "hud-key": {
    font: "body",
    size: 19,
    letterSpacing: 0,
    fill: IVORY,
    shadow: softShadow,
  },
  "hud-hint": {
    font: "body",
    size: 21.5,
    letterSpacing: 0.2,
    fill: IVORY,
    shadow: softShadow,
  },
  // World overhead labels (allies, enemies, gates).
  "tag-ally": {
    font: "body",
    size: 15,
    letterSpacing: 0.3,
    fill: IVORY,
    shadow: snowShadow,
    outline: { color: 0x0a0604, alpha: 0.85, width: 0.9 },
  },
  "tag-foe": {
    font: "body",
    size: 13,
    letterSpacing: 0.3,
    fill: 0xf2e4c4,
    shadow: snowShadow,
    outline: { color: 0x0a0604, alpha: 0.85, width: 0.8 },
  },
  // Floating combat text & banners (frameless / bubble-free: crisp MSDF glyphs with subtle drop shadow, no dark glyph box).
  "combat-hit": {
    font: "display",
    size: 23,
    letterSpacing: 0.4,
    fill: 0xffe69c,
    outline: { color: 0x1a0c04, alpha: 0.95, width: 1.4 },
    shadow: { color: 0x000000, alpha: 0.85, dx: 0, dy: 2, softness: 1.4 },
  },
  "combat-crit": {
    font: "display",
    size: 32,
    letterSpacing: 0.5,
    fill: GOLD_GRADIENT,
    outline: { color: 0x220c02, alpha: 0.96, width: 1.5 },
    shadow: { color: 0x000000, alpha: 0.88, dx: 0, dy: 2.2, softness: 1.5 },
    glow: warmGlow,
  },
  "combat-crit-label": {
    font: "display",
    size: 12,
    letterSpacing: 1.6,
    fill: 0xffdf7a,
    outline: { color: 0x220c02, alpha: 0.95, width: 1.2 },
    shadow: { color: 0x000000, alpha: 0.85, dx: 0, dy: 1.5, softness: 1.2 },
    uppercase: true,
  },
  "combat-incoming": {
    font: "display",
    size: 21,
    letterSpacing: 0.3,
    fill: 0xff6452,
    outline: { color: 0x1a0404, alpha: 0.95, width: 1.4 },
    shadow: { color: 0x000000, alpha: 0.85, dx: 0, dy: 2, softness: 1.4 },
  },
  "combat-heal": {
    font: "display",
    size: 20,
    letterSpacing: 0.3,
    fill: 0x8effa8,
    outline: { color: 0x061a0a, alpha: 0.95, width: 1.3 },
    shadow: { color: 0x000000, alpha: 0.85, dx: 0, dy: 2, softness: 1.4 },
  },
  "combat-xp": {
    font: "display",
    size: 20,
    letterSpacing: 0.3,
    fill: GOLD,
    outline: { color: 0x261603, alpha: 0.95, width: 1.3 },
    shadow: { color: 0x000000, alpha: 0.85, dx: 0, dy: 2, softness: 1.4 },
  },
  "combat-banner": {
    font: "display",
    size: 28,
    letterSpacing: 2.4,
    fill: GOLD_GRADIENT,
    outline: { color: 0x1e0e03, alpha: 0.96, width: 1.5 },
    shadow: { color: 0x000000, alpha: 0.88, dx: 0, dy: 2.2, softness: 1.5 },
    glow: warmGlow,
    uppercase: true,
  },
  "combat-banner-sub": {
    font: "body",
    size: 16,
    letterSpacing: 0.6,
    fill: IVORY,
    outline: { color: 0x0e0703, alpha: 0.92, width: 1.1 },
    shadow: { color: 0x000000, alpha: 0.82, dx: 0, dy: 1.5, softness: 1.2 },
  },
  // Popover panels, modals, blessings & loading screen.
  "panel-title": {
    font: "display",
    size: 16,
    letterSpacing: 1.4,
    fill: GOLD_GRADIENT,
    outline: { color: 0x221104, alpha: 0.9, width: 1 },
    shadow: softShadow,
    uppercase: true,
  },
  "panel-label": {
    font: "display",
    size: 12,
    letterSpacing: 1.6,
    fill: GOLD_LABEL,
    shadow: softShadow,
    uppercase: true,
  },
  "panel-body": {
    font: "body",
    size: 16,
    letterSpacing: 0.1,
    fill: IVORY,
    shadow: softShadow,
  },
  "panel-muted": {
    font: "body",
    size: 14,
    letterSpacing: 0.1,
    fill: 0xbfa982,
    shadow: softShadow,
  },
  "panel-error": {
    font: "body",
    size: 14,
    letterSpacing: 0.1,
    fill: 0xf08c7a,
    shadow: softShadow,
  },
  "blessing-title": {
    font: "display",
    size: 18,
    letterSpacing: 0.5,
    fill: GOLD_GRADIENT,
    outline: { color: 0x221104, alpha: 0.9, width: 1 },
    shadow: softShadow,
  },
  "blessing-desc": {
    font: "body",
    size: 15,
    letterSpacing: 0,
    fill: IVORY_DIM,
    shadow: softShadow,
    lineHeight: 20,
    align: "center",
  },
} satisfies Record<string, TextRole>;
export type RoleName = keyof typeof ROLES;

// Choose Your Hero (src/stronghold/choose-hero.ts): one role per text slot and layout, derived from the shared roles above.
// Sizes are design pixels of each layout's canvas: desktop 1672 × 941 and portrait 864 × 1824 (the Choosing Hero
// references), and phone landscape 1240 × 600, sized so body text stays at about 14 CSS px on an 844 × 390 phone.
export type ChooseLayout = "desktop" | "portrait" | "landscape";
export type ChooseSlot =
  | "title"
  | "subtitle"
  | "back"
  | "card-name"
  | "card-state"
  | "hero-name"
  | "loadout-title"
  | "hero-desc"
  | "loadout"
  | "skill"
  | "level"
  | "help"
  | "action";
const sized = (
  role: TextRole,
  size: number,
  extra: Partial<TextRole> = {},
): TextRole => ({
  ...role,
  size,
  ...(role.lineHeight
    ? { lineHeight: (role.lineHeight * size) / role.size }
    : {}),
  ...extra,
});
const chooseRoles = (
  s: Record<ChooseSlot, number>,
): Record<ChooseSlot, TextRole> => ({
  title: sized(ROLES["display-title"], s.title),
  subtitle: sized(ROLES["body-lg"], s.subtitle),
  back: sized(ROLES["body"], s.back),
  "card-name": sized(ROLES["body-lg"], s["card-name"]),
  "card-state": sized(ROLES["accent"], s["card-state"]),
  "hero-name": sized(ROLES["display-name"], s["hero-name"]),
  "loadout-title": sized(ROLES["display-name"], s["loadout-title"]),
  "hero-desc": sized(ROLES["body"], s["hero-desc"]),
  loadout: sized(ROLES["label-wide"], s.loadout),
  skill: sized(ROLES["body"], s.skill),
  level: sized(ROLES["accent"], s.level),
  help: sized(ROLES["paragraph"], s.help),
  action: sized(ROLES["display-button"], s.action),
});
export const CHOOSE_HERO_TEXT: Record<
  ChooseLayout,
  Record<ChooseSlot, TextRole>
> = {
  desktop: chooseRoles({
    title: 49,
    subtitle: 27,
    back: 22,
    "card-name": 27,
    "card-state": 23,
    "hero-name": 41.5,
    "loadout-title": 41.5,
    "hero-desc": 23,
    loadout: 19,
    skill: 22.5,
    level: 21,
    help: 19.5,
    action: 33,
  }),
  portrait: chooseRoles({
    title: 46.5,
    subtitle: 27,
    back: 25,
    "card-name": 29,
    "card-state": 25,
    "hero-name": 46,
    "loadout-title": 46,
    "hero-desc": 29,
    loadout: 24,
    skill: 25,
    level: 23,
    help: 26,
    action: 50,
  }),
  landscape: chooseRoles({
    title: 40,
    subtitle: 23,
    back: 22,
    "card-name": 24,
    "card-state": 21,
    "hero-name": 34,
    "loadout-title": 34,
    "hero-desc": 22,
    loadout: 18,
    skill: 21,
    level: 20,
    help: 20,
    action: 32,
  }),
};
