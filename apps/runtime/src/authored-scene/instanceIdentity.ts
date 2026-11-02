import { sha256 } from "@noble/hashes/sha2.js";

export const INSTANCE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[48][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Compatibility only: deterministically map an old identity, never an asset URL alone.
 * New placements must use crypto.randomUUID(). Keep existing UUIDs unchanged.
 * Namespace and encoding are shared with Content API's migration.
 */
export function instanceId(legacy: string): string {
  if (INSTANCE_ID.test(legacy)) return legacy.toLowerCase();
  const bytes = sha256(
    new TextEncoder().encode(`arkodia.instance.v1\0${legacy}`),
  ).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x80;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
