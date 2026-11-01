import { COURT, tileToCourt } from "./environment-map";

export type TerrainPoint = [number, number];
export type TerrainArea = {
  id: string;
  name: string;
  texture: "snow" | "paving";
  scale: number;
  visible: boolean;
  /** Null is the infinite base. Polygon vertices use isometric ground tile coordinates. */
  points: TerrainPoint[] | null;
};
export const TERRAIN_AREAS_KEY = "Terrain areas";
export type TerrainControls = Record<string, string | number | boolean>;
export function defaultTerrainAreas(
  controls: TerrainControls = {},
): TerrainArea[] {
  const scale = Number(controls["Ground texture scale"] ?? 1);
  return [
    {
      id: "outside",
      name: "Outside",
      texture:
        controls["Outside ground surface"] === "paving" ? "paving" : "snow",
      scale: Number.isFinite(scale) ? Math.max(0.25, Math.min(4, scale)) : 1,
      visible: true,
      points: null,
    },
    {
      id: "courtyard",
      name: "Courtyard",
      texture:
        controls["Courtyard ground surface"] === "snow" ? "snow" : "paving",
      scale: Number.isFinite(scale) ? Math.max(0.25, Math.min(4, scale)) : 1,
      visible: true,
      points: [
        [-0.5, -0.5],
        [COURT.size, -0.5],
        [COURT.size, COURT.size],
        [-0.5, COURT.size],
      ],
    },
  ];
}
export function validTerrainAreas(value: unknown): value is TerrainArea[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200)
    return false;
  const ids = new Set<string>();
  return value.every((area, index) => {
    if (
      !area ||
      typeof area.id !== "string" ||
      !area.id ||
      ids.has(area.id) ||
      typeof area.name !== "string" ||
      !["snow", "paving"].includes(area.texture) ||
      !Number.isFinite(area.scale) ||
      area.scale < 0.25 ||
      area.scale > 4 ||
      typeof area.visible !== "boolean"
    )
      return false;
    ids.add(area.id);
    return index === 0
      ? area.points === null
      : Array.isArray(area.points) &&
          area.points.length >= 3 &&
          area.points.length <= 128 &&
          area.points.every(
            (p: unknown) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every(
                (n) =>
                  typeof n === "number" &&
                  Number.isFinite(n) &&
                  Math.abs(n) <= 10000,
              ),
          ) &&
          Math.abs(polygonArea(area.points)) > 0.001;
  });
}
export function readTerrainAreas(controls: TerrainControls): TerrainArea[] {
  try {
    const value = JSON.parse(String(controls[TERRAIN_AREAS_KEY]));
    if (validTerrainAreas(value)) return value;
  } catch {
    /* Older scenes inherit the native court and infinite ground. */
  }
  return defaultTerrainAreas(controls);
}
export function polygonArea(points: TerrainPoint[]) {
  return (
    points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}
export function courtToTile(x: number, y: number): TerrainPoint {
  const dx = (x - COURT.x) / 64,
    dy = (y - COURT.y) / 32;
  return [(dx + dy) / 2, (dy - dx) / 2];
}
export function terrainPolygon(area: TerrainArea): number[] {
  return (area.points ?? []).flatMap(([u, v]) => {
    const p = tileToCourt(u, v);
    return [p.x, p.y];
  });
}
export function containsTerrainPoint(
  points: TerrainPoint[],
  [u, v]: TerrainPoint,
) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [x, y] = points[i],
      [a, b] = points[j];
    const cross = (u - x) * (b - y) - (v - y) * (a - x);
    if (
      Math.abs(cross) < 1e-7 &&
      u >= Math.min(x, a) &&
      u <= Math.max(x, a) &&
      v >= Math.min(y, b) &&
      v <= Math.max(y, b)
    )
      return true;
    if (y > v !== b > v && u < ((a - x) * (v - y)) / (b - y) + x)
      inside = !inside;
  }
  return inside;
}
export function pickTerrainArea(
  areas: TerrainArea[],
  point: TerrainPoint,
): TerrainArea | undefined {
  return [...areas]
    .reverse()
    .find(
      (a) => a.visible && (!a.points || containsTerrainPoint(a.points, point)),
    );
}
export function rectangleTerrainPoints(
  a: TerrainPoint,
  b: TerrainPoint,
): TerrainPoint[] {
  const u0 = Math.min(a[0], b[0]),
    u1 = Math.max(a[0], b[0]),
    v0 = Math.min(a[1], b[1]),
    v1 = Math.max(a[1], b[1]);
  return [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
}
