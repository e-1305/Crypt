// Raid history kept by the report commands. serializeState drops unknown keys, so state.json cannot hold it.
// crypt autopsy and crypt gazette append one snapshot per UTC day to out/autopsy-history.json.
const DAY_MS = 86_400_000;
export const HISTORY_FILE = "autopsy-history.json";
export const MAX_KEPT = 200;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const cnt = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** One history entry for the creature as it is now. Returns null when there is no usable limb list. */
export function snapshotOf(creature: unknown, now: number): Record<string, unknown> | null {
  if (!isRec(creature) || !Array.isArray(creature.limbs) || !Number.isFinite(now)) return null;
  const limbs = creature.limbs.filter(isRec);
  const possessedIds = limbs.filter((l) => l.state === "Possessed" && typeof l.id === "string").map((l) => (l.id as string).slice(0, 32));
  const c = isRec(creature.counts) ? creature.counts : {};
  return {
    at: new Date(now).toISOString(),
    possessed: possessedIds.length,
    rotting: limbs.filter((l) => l.state === "Rotting").length,
    healthy: limbs.filter((l) => l.state === "Healthy").length,
    spawned: cnt(c.spawned),
    healed: limbs.filter((l) => l.healed === true).length,
    possessedIds,
  };
}

/** Appends the snapshot. An entry from the same UTC day is replaced. Junk entries are dropped. */
export function appendSnapshot(existing: unknown, snap: Record<string, unknown>): unknown[] {
  const day = (e: unknown): number => (isRec(e) ? Math.floor(Date.parse(String(e.at)) / DAY_MS) : NaN);
  const today = day(snap);
  const kept = (Array.isArray(existing) ? existing : []).filter((e) => Number.isFinite(day(e)) && day(e) !== today);
  return [...kept, snap].slice(-MAX_KEPT);
}

/** state.history first, then the file history, so an entry the file holds for the same time wins by order. */
export function joinHistory(fromState: unknown, fromFile: unknown): unknown[] {
  return [...(Array.isArray(fromState) ? fromState : []), ...(Array.isArray(fromFile) ? fromFile : [])];
}
