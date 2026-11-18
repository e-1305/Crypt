// SIMULATED mode (Epic D4): a scripted, deterministic timeline for the hosted demo. Every event says source "simulated".
// One red CI rejection and one human-merged heal, so the page shows both effects. No random, no clock: t0 is passed in.
import { clean } from "../render/plate.js";
import { parseWarEvent, type WarEvent } from "./events.js";
import { limbKeyOf, type WarLimb } from "./state.js";

/** Steps are offsets in ms after t0 so the page can replay them against its own clock. */
export function simulatedTimeline(limbs: readonly WarLimb[], t0: number): WarEvent[] {
  const sick = limbs.filter((l) => (l.state === "Possessed" || l.state === "Rotting") && clean(l.name, 40) !== "");
  // KEV first, then highest EPSS, then key: the same order the scene uses for bosses.
  const rank = (l: WarLimb) => (typeof l.epss === "number" && Number.isFinite(l.epss) ? l.epss : 0);
  const sorted = [...sick].sort((a, b) => (b.kev === true ? 1 : 0) - (a.kev === true ? 1 : 0) || rank(b) - rank(a) || (limbKeyOf(a) < limbKeyOf(b) ? -1 : 1));
  if (!Number.isFinite(t0) || t0 < 0) return [];
  const raw: unknown[] = [];
  const boss = sorted[0];
  const second = sorted[1];
  if (boss) {
    const k = limbKeyOf(boss);
    raw.push(
      { type: "pr-opened", limb: k, pr: 101, at: t0 + 5_000 },
      { type: "ci-running", limb: k, pr: 101, at: t0 + 12_000 },
      { type: "ci-green", limb: k, pr: 101, at: t0 + 30_000 },
      { type: "human-merged", limb: k, pr: 101, at: t0 + 45_000, healedBy: "Maya" },
    );
  }
  if (second) {
    const k = limbKeyOf(second);
    raw.push(
      { type: "pr-opened", limb: k, pr: 102, at: t0 + 20_000 },
      { type: "ci-running", limb: k, pr: 102, at: t0 + 26_000 },
      { type: "ci-red", limb: k, pr: 102, at: t0 + 38_000 },
    );
  }
  return raw
    .map((r) => parseWarEvent({ ...(r as object), source: "simulated" }))
    .filter((e): e is WarEvent => e !== null);
}
