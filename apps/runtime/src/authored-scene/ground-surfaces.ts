import { markWorldEmission } from "./world-lighting";
import type { Texture, TilingSprite } from "pixi.js";
import type { EnvironmentRuntime } from "./environment-runtime";

const originalScales = new WeakMap<TilingSprite, { x: number; y: number }>();
/** Update the existing ground layers without rebuilding scene objects or collision. */
export function syncGroundSurfaces(
  env: Pick<EnvironmentRuntime, "snow" | "courtSurface">,
  textures: Record<string, Texture>,
  options: {
    outsideSurface?: string;
    courtyardSurface?: string;
    groundScale?: number;
  },
) {
  const outside = options.outsideSurface === "paving" ? "paving" : "snow";
  const courtyard = options.courtyardSurface === "snow" ? "snow" : "paving";
  const scale = Number.isFinite(options.groundScale)
    ? Math.max(0.25, Math.min(4, options.groundScale!))
    : 1;
  for (const [sprite, surface] of [
    [env.snow.sprite, outside],
    [env.courtSurface.paving, courtyard],
  ] as const) {
    const texture =
      textures[
        surface === "snow"
          ? "/modular-stronghold/v2/snow-soft-texture.png"
          : "/modular-stronghold/v2/paving-warm-texture.png"
      ];
    if (!texture) continue;
    let original = originalScales.get(sprite);
    if (!original) {
      original = {
        x: sprite.tileScale.x * sprite.texture.width,
        y: sprite.tileScale.y * sprite.texture.width,
      };
      originalScales.set(sprite, original);
    }
    sprite.texture = texture;
    sprite.tileScale.set(
      (original.x * scale) / texture.width,
      (original.y * scale) / texture.width,
    );
  }
  env.courtSurface.snowApron.visible =
    outside === "snow" && courtyard === "paving";
}

import {
  Container,
  Graphics,
  Matrix,
  TilingSprite as AreaSprite,
} from "pixi.js";
import { tileToCourt, COURT, PAVING_DENSITY } from "./environment-map";
import {
  terrainPolygon,
  type TerrainArea,
  type TerrainPoint,
} from "./terrain-areas";

export type TerrainAreaRenderOptions = {
  terrainAreas?: TerrainArea[];
  selectedArea?: string;
  areaPreview?: TerrainPoint[] | null;
  areaCrosshair?: TerrainPoint | null;
};
const areaViews = new WeakMap<
  EnvironmentRuntime["courtSurface"],
  {
    layer: Container;
    overlay: Graphics;
    signature: string;
    textures: (Texture | undefined)[];
  }
>();
export function syncTerrainAreas(
  env: Pick<EnvironmentRuntime, "snow" | "courtSurface">,
  textures: Record<string, Texture>,
  options: TerrainAreaRenderOptions,
) {
  const areas = options.terrainAreas;
  if (!areas?.length) return;
  let view = areaViews.get(env.courtSurface);
  if (!view || view.layer.destroyed) {
    const layer = new Container();
    layer.zIndex = 2;
    const overlay = new Graphics();
    overlay.zIndex = 1000;
    markWorldEmission(overlay);
    env.courtSurface.container.addChild(layer);
    (
      env.courtSurface.container.parent?.parent ?? env.courtSurface.container
    ).addChild(overlay);
    view = { layer, overlay, signature: "", textures: [] };
    areaViews.set(env.courtSurface, view);
  }
  const textureFor = (area: TerrainArea) =>
    textures[
      area.texture === "snow"
        ? "/modular-stronghold/v2/snow-soft-texture.png"
        : "/modular-stronghold/v2/paving-warm-texture.png"
    ];
  const base = areas[0];
  syncGroundSurfaces(env, textures, {
    outsideSurface: base.texture,
    courtyardSurface: "paving",
    groundScale: base.scale,
  });
  env.snow.sprite.visible = base.visible;
  env.courtSurface.paving.visible = false;
  env.courtSurface.contactShadow.visible = false;
  env.courtSurface.snowApron.visible = false;
  const signature = JSON.stringify(areas);
  const currentTextures = areas.map(textureFor);
  if (
    signature !== view.signature ||
    currentTextures.some((t, i) => t !== view!.textures[i])
  ) {
    for (const child of view.layer.removeChildren())
      child.destroy({ children: true });
    areas.slice(1).forEach((area) => {
      if (!area.visible || !area.points) return;
      const texture = textureFor(area);
      if (!texture) return;
      const polygon = terrainPolygon(area);
      const xs = area.points.map(([u, v]) => tileToCourt(u, v).x),
        ys = area.points.map(([u, v]) => tileToCourt(u, v).y);
      const x = Math.min(...xs),
        y = Math.min(...ys);
      const sprite = new AreaSprite({
        texture,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y,
      });
      sprite.position.set(x, y);
      const scale =
        (PAVING_DENSITY * 1024 * area.scale) / Math.max(1, texture.width);
      sprite.tileTransform.setFromMatrix(
        new Matrix(
          scale,
          scale * 0.5,
          -scale,
          scale * 0.5,
          COURT.x - x,
          COURT.y - y,
        ),
      );
      const mask = new Graphics().poly(polygon, true).fill(0xffffff);
      const group = new Container();
      group.label = `terrain-area:${area.id}`;
      group.addChild(sprite, mask);
      sprite.mask = mask;
      view!.layer.addChild(group);
    });
    view.signature = signature;
    view.textures = currentTextures;
  }
  const overlay = view.overlay.clear();
  const screenScale = Math.max(
    0.01,
    Math.hypot(overlay.getGlobalTransform().a, overlay.getGlobalTransform().b),
  );
  const unit = 1 / screenScale;
  const selected = areas.find((a) => a.id === options.selectedArea);
  const points =
    options.areaPreview ?? (selected?.visible ? selected.points : null);
  if (points?.length) {
    overlay
      .poly(terrainPolygon({ points } as TerrainArea), true)
      .fill({ color: 0x65d5c4, alpha: 0.13 })
      .stroke({ color: 0x65d5c4, width: 2 * unit });
    for (const [u, v] of points) {
      const p = tileToCourt(u, v);
      overlay
        .circle(p.x, p.y, 6 * unit)
        .fill(0x153d3a)
        .stroke({ color: 0x92fff0, width: 2 * unit });
    }
  }
  if (options.areaCrosshair) {
    const [u, v] = options.areaCrosshair;
    const a = tileToCourt(u - 100, v),
      b = tileToCourt(u + 100, v),
      c = tileToCourt(u, v - 100),
      d = tileToCourt(u, v + 100),
      center = tileToCourt(u, v);
    overlay
      .moveTo(a.x, a.y)
      .lineTo(b.x, b.y)
      .moveTo(c.x, c.y)
      .lineTo(d.x, d.y)
      .stroke({ color: 0xfbd36b, alpha: 0.8, width: unit });
    overlay
      .circle(center.x, center.y, 4 * unit)
      .stroke({ color: 0xffffff, width: unit });
  }
}
