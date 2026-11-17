// Healed memory for the plate. reraise turns a healed limb into a plain Healthy one,
// so the page remembers which limbs it saw Possessed or Rotting.
import { limbKey } from "../render/plate.js";

export interface MemoryStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

interface LimbLike {
  ecosystem?: unknown;
  name?: unknown;
  state?: unknown;
  spawned?: unknown;
  healed?: boolean;
}

/** Marks Healthy limbs seen sick before as healed. Returns the keys that healed since the last visit. */
export function markHealed(limbs: LimbLike[], store: MemoryStore): string[] {
  const seen = (store.get("crypt.seen") as Record<string, boolean> | null) || {};
  const healed = (store.get("crypt.healed") as Record<string, boolean> | null) || {};
  const fresh: string[] = [];
  for (const l of limbs) {
    const key = limbKey(l.ecosystem, l.name);
    if (l.state === "Possessed" || l.state === "Rotting") {
      if (l.spawned === true) seen[key] = true;
      delete healed[key];
    } else if (l.state === "Healthy" && seen[key]) {
      if (!healed[key]) fresh.push(key);
      healed[key] = true;
      l.healed = true;
    }
  }
  store.set("crypt.seen", seen);
  store.set("crypt.healed", healed);
  return fresh;
}
