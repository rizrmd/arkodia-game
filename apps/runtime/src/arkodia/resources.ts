import { BitmapFont, Cache, Texture, type BitmapFontData } from "pixi.js";
import type { Published } from "../published";
import { requireContent as check } from "../published";
import type {
  StrongholdPrefab,
  CharacterAtlas,
  CollisionColumn,
} from "../../../../packages/content-contracts/legacy-types";
export type Prop = {
  id: string;
  file: string;
  x: number;
  y: number;
  width: number;
  foot: number;
  vertical: number;
  shear: number;
  depth: number;
  layer: string;
};
export type StrongholdData = {
  prefab: StrongholdPrefab;
  characters: Record<string, CharacterAtlas>;
  ui: Record<string, unknown>;
  fonts: { data: BitmapFontData; image: string }[];
  props: Prop[];
  nav: { version: number; columns: CollisionColumn[] };
  entries: { path: string; sha256: string; size: number; mediaType: string }[];
  sourceCommit: string;
};
let current: Resources | undefined;
const clean = (path: string) => path.split("?")[0].replace(/@(?:2|3)x/g, "@1x");
export async function publishedTexture(
  options: string | { src: string; data?: unknown },
) {
  return current!.texture(typeof options === "string" ? options : options.src);
}
export async function publishedJSON<T>(path: string): Promise<T> {
  const v = current!.data.ui[clean(path)];
  check(v, "Unpublished UI metadata");
  return structuredClone(v) as T;
}
export class Resources {
  data!: StrongholdData;
  textures = new Map<string, Texture>();
  private bitmaps: ImageBitmap[] = [];
  private fonts: BitmapFont[] = [];
  constructor(public published: Published) {}
  async init() {
    const docs = [...this.published.documents.values()];
    const prefab = docs.filter(
      (d) => d.data.format === "arkadia.stronghold-prefab.v1",
    );

    const manifests = docs.filter(
      (d) => d.data.format === "arkadia.asset-manifest.v1",
    );
    check(
      prefab.length === 1 && manifests.length === 1,
      "Stronghold requires prefab and presentation manifest",
    );
    const d = manifests[0],
      payload = d.data.payload as unknown as Omit<StrongholdData, "prefab"> & {
        runtimeProfile: string;
      };
    check(
      payload.runtimeProfile === "arkodia.stronghold-presentation.v1" &&
        Array.isArray(payload.entries) &&
        payload.entries.length <= 96 &&
        payload.props?.length <= 256 &&
        Array.isArray(payload.fonts) &&
        payload.fonts.length === 3,
      "Invalid Stronghold presentation",
    );
    const characters = payload.characters;
    this.data = {
      ...payload,
      prefab: prefab[0].data.payload as StrongholdPrefab,
      characters,
    };
    const p = this.data.prefab;
    check(
      p.id === "stronghold" &&
        p.version === 1 &&
        p.court.size === 15 &&
        Number.isFinite(p.heroSpawn.x) &&
        Number.isFinite(p.heroSpawn.y),
      "Unsupported Stronghold prefab",
    );
    const paths = new Set<string>();
    for (const entry of payload.entries) {
      const asset = this.published.manifest.assets.find(
        (a) => a.sha256 === entry.sha256,
      );
      check(
        entry.path.startsWith("/") &&
          !entry.path.includes("..") &&
          !paths.has(entry.path) &&
          d.data.bindings[entry.path] === entry.sha256 &&
          asset &&
          asset.size === entry.size &&
          asset.mediaType === entry.mediaType,
        "Invalid presentation asset binding",
      );
      paths.add(entry.path);
    }
    // Check character identity, image binding, frames and all clips before any active scene is installed.
    for (const id of ["rift-runner", "ember-warden"]) {
      const a = characters[id];
      check(
        a &&
          a.cell &&
          a.frames.length > 0 &&
          a.frames.length <= 1024 &&
          Number.isFinite(a.cell.pivot.x) &&
          Number.isFinite(a.cell.pivot.y),
        "Invalid hero atlas",
      );
      check(paths.has("/assets/characters/" + a.image), "Hero binding missing");
      for (const f of a.frames)
        check(
          [f.x, f.y, f.w, f.h].every(Number.isInteger) &&
            f.x >= 0 &&
            f.y >= 0 &&
            f.w > 0 &&
            f.h > 0 &&
            f.x + f.w <= a.atlasSize[0] &&
            f.y + f.h <= a.atlasSize[1],
          "Invalid hero frame",
        );
      for (const view of ["N", "S", "E", "NE", "SE"])
        for (const state of ["idle", "move"])
          check(a.clips[state + "-" + view], "Missing directional hero clip");
      for (const c of Object.values(a.clips))
        check(
          Number.isFinite(c.fps) &&
            c.fps > 0 &&
            c.fps <= 60 &&
            typeof c.loop === "boolean" &&
            c.frames.length > 0 &&
            c.frames.every(
              (i) => Number.isInteger(i) && i >= 0 && i < a.frames.length,
            ),
          "Invalid hero clip",
        );
    }
    check(
      Array.isArray(payload.nav?.columns) &&
        payload.nav.columns.length <= 30000 &&
        payload.nav.columns.every(
          (c) =>
            [c.x, c.w, c.back, c.front].every(Number.isFinite) &&
            c.w > 0 &&
            c.back <= c.front,
        ),
      "Invalid navigation columns",
    );
    for (const prop of payload.props)
      check(
        paths.has(prop.file) &&
          [
            prop.x,
            prop.y,
            prop.width,
            prop.foot,
            prop.vertical,
            prop.shear,
            prop.depth,
          ].every(Number.isFinite) &&
          prop.width > 0,
        "Invalid scenery binding",
      );
    let decodedPixels = 0;
    for (const entry of payload.entries) {
      const a = this.published.assets.get(entry.sha256)!;
      const bitmap = await createImageBitmap(
        new Blob([a.bytes], { type: a.mediaType }),
      );
      decodedPixels += bitmap.width * bitmap.height;
      check(
        bitmap.width <= 16384 &&
          bitmap.height <= 16384 &&
          decodedPixels <= 160 * 1024 * 1024,
        "Decoded image budget exceeded",
      );
      this.bitmaps.push(bitmap);
      this.textures.set(entry.path, Texture.from(bitmap));
    }
    for (const a of Object.values(characters)) {
      const t = this.texture("/assets/characters/" + a.image);
      check(
        t.width === a.atlasSize[0] && t.height === a.atlasSize[1],
        "Decoded hero dimensions mismatch",
      );
    }
    for (const f of payload.fonts) {
      const font = new BitmapFont({
        data: f.data,
        textures: [this.texture(f.image)],
      });
      Cache.set(f.data.fontFamily + "-bitmap", font);
      this.fonts.push(font);
    }
    current = this;
  }
  texture(path: string) {
    const t = this.textures.get(clean(path));
    check(t, `Unpublished texture: ${clean(path)}`);
    return t;
  }
  destroy() {
    if (current === this) current = undefined;
    for (const font of this.fonts) {
      Cache.remove(font.fontFamily + "-bitmap");
      font.destroy();
    }
    for (const t of this.textures.values()) t.destroy(true);
    for (const b of this.bitmaps) b.close();
    this.textures.clear();
  }
}
