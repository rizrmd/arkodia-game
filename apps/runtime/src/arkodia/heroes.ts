export const HEROES = ["rift-runner", "ember-warden"] as const;
export type HeroId = (typeof HEROES)[number];
export const isHero = (v: unknown): v is HeroId => HEROES.includes(v as HeroId);
export const heroName = (id: HeroId) =>
  id === "rift-runner" ? "Rift Runner" : "Amber Warden";
// This origin's preference is deliberately separate from original production game saves.
const KEY = "arkodia.runtime.hero.v1";
export function preference() {
  const q = new URLSearchParams(location.search),
    requested = q.get("hero");
  if (requested === "reset") {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    q.delete("hero");
    history.replaceState(
      null,
      "",
      location.pathname + (q.size ? "?" + q : "") + location.hash,
    );
    return null;
  }
  if (isHero(requested)) return requested;
  try {
    const saved = localStorage.getItem(KEY);
    return isHero(saved) ? saved : null;
  } catch {
    return null;
  }
}
export function saveHero(id: HeroId) {
  try {
    localStorage.setItem(KEY, id);
    return true;
  } catch {
    return false;
  }
}
