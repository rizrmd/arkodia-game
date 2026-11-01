import type { Texture } from "pixi.js";

/** Texture.from(ImageBitmap) has no asset URL; retain it for editor picking. */
export function identifyRuntimeTexture(texture: Texture, url: string): Texture {
  texture.label = url;
  texture.source.label = url;
  return texture;
}
