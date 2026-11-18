// Gazette digest: a pure weekly summary built from the creature, the state and the raid history.
// Failures name limbs (packages) only. A person appears only as the "healed by" praise.
import { safeLogin } from "../common/creature-status.js";
import { buildAutopsy, readHistory, type LimbRef } from "../report/model.js";

export const DAY_MS = 86_400_000;

export interface HealedLimb {
  limb: string;
  by?: string;
}

export interface Digest {
  repo: string;
  healed: HealedLimb[];
  newPossessed: string[];
  slaAtRisk: LimbRef[];
  nightsWithoutPossession: number;
  warRoomUrl: string;
}

export interface DigestInput {
  creature: unknown;
  state: unknown;
  /** Creature of the previous raid, when known. Limbs healed there are not praised again. */
  previousCreature?: unknown;
  /** Raw history array. When absent, state.history is used. */
  history?: unknown;
  now: number;
  /** Link for the War Room button. The CLI supplies the default. */
  warRoomUrl?: string;
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max = 60): string => (typeof v === "string" ? v.replace(/[^\x20-\x7e]/g, "").slice(0, max) : "");

function limbsOf(creature: unknown): Record<string, unknown>[] {
  return arr(rec(creature).limbs).map(rec).filter((l) => text(l.id, 32) !== "");
}

export function buildDigest(input: DigestInput): Digest {
  const now = typeof input.now === "number" && Number.isFinite(input.now) ? input.now : 0;
  const rawHistory = input.history !== undefined ? input.history : rec(input.state).history;
  const limbs = limbsOf(input.creature);
  const prevHealed = new Set(limbsOf(input.previousCreature).filter((l) => l.healed === true).map((l) => text(l.id, 32)));

  const healed: HealedLimb[] = limbs
    .filter((l) => l.healed === true && !prevHealed.has(text(l.id, 32)))
    .map((l) => {
      const by = safeLogin(rec(rec(rec(input.state).limbs)[text(l.id, 32)]).healedBy) || safeLogin(l.healedBy);
      const limb = text(l.name) || text(l.id, 32);
      return by !== "" ? { limb, by } : { limb };
    })
    .sort((a, b) => a.limb.localeCompare(b.limb));

  const possessed = limbs.filter((l) => l.state === "Possessed");
  // The previous raid is the last history entry that lists its possessed limb ids. Without it, nothing is called new.
  const lastIds = [...arr(rawHistory)].map(rec).filter((e) => Array.isArray(e.possessedIds)).pop();
  const known = new Set(arr(lastIds?.possessedIds).map((x) => text(x, 32)));
  const newPossessed = lastIds === undefined ? [] : possessed.filter((l) => !known.has(text(l.id, 32))).map((l) => text(l.name) || text(l.id, 32)).sort();

  const slaAtRisk = buildAutopsy({ creature: input.creature, state: input.state, history: [], now }).sla.atRisk;

  let nights = 0;
  if (possessed.length === 0) {
    const points = readHistory(rawHistory, 52);
    const lastBad = [...points].reverse().find((p) => p.possessed > 0);
    const since = lastBad ? lastBad.at : points[0]?.at;
    if (since !== undefined) nights = Math.max(0, Math.floor((now - since) / DAY_MS));
  }

  return { repo: text(rec(input.creature).repo, 80), healed, newPossessed, slaAtRisk, nightsWithoutPossession: nights, warRoomUrl: input.warRoomUrl ?? "" };
}
