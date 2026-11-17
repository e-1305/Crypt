// Game feel for the raid (Milestone G1): team combo chain, bosses, team trophies, grade, vitals and graded epitaphs.
// Pure: no fs, no real clock (times are passed in), no random, no network. Display only: teamScore() and riskOf() in
// raid.ts are untouched, so the deterministic score never changes. Blameless: everything here is about limbs and the
// team. No function takes or returns a person, and nothing is counted per person.
import { clean } from "../render/plate.js";
import {
  RAID_MS, RANK_RESURRECTIONIST, RANK_SURGEON, countsForScore, fnv1a, isHealed, riskOf, teamScore, type RaidLimb, type Rank,
} from "./raid.js";

export const COMBO_WINDOW_MS = 90 * 1000;
export const MULTIPLIER_CAP = 3;
export const BOSS_EPSS = 0.5;
export const UNDER_TEN_MS = 10 * 60 * 1000;
export const NIGHTS_TROPHY = 3;

export interface ComboState {
  /** Heals in the current chain. 0 when the chain has lapsed. */
  chain: number;
  /** Longest chain seen in the whole list. */
  best: number;
  /** Team multiplier, 1..3. Each heal after the first adds 0.5. */
  multiplier: number;
}

function finite(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function multiplierFor(chain: number): number {
  const c = finite(chain) ? Math.max(0, Math.floor(chain)) : 0;
  return Math.min(MULTIPLIER_CAP, 1 + 0.5 * Math.max(0, c - 1));
}

/**
 * Heals chain together when each lands within `windowMs` of the one before. With `now`, a chain whose last heal is older
 * than the window has lapsed (chain 0, multiplier 1). Team-wide: the times carry no person.
 */
export function comboState(healTimes: readonly number[], windowMs: number = COMBO_WINDOW_MS, now?: number): ComboState {
  const win = finite(windowMs) && windowMs >= 0 ? windowMs : COMBO_WINDOW_MS;
  const times = healTimes.filter(finite).sort((a, b) => a - b);
  let run = 0, best = 0;
  for (let i = 0; i < times.length; i++) {
    run = i > 0 && times[i] - times[i - 1] <= win ? run + 1 : 1;
    best = Math.max(best, run);
  }
  if (times.length > 0 && finite(now) && now - times[times.length - 1] > win) run = 0;
  return { chain: run, best, multiplier: multiplierFor(run) };
}

/** The bonus shown next to the team score: score times (multiplier - 1). Display only. */
export function styleBonus(score: number, multiplier: number): number {
  const s = finite(score) ? Math.max(0, score) : 0;
  const m = finite(multiplier) ? Math.min(MULTIPLIER_CAP, Math.max(1, multiplier)) : 1;
  return s * (m - 1);
}

const limbKey = (l: RaidLimb) => `${clean(l.ecosystem, 20)}:${clean(l.name, 40)}`;

/** KEV limbs with EPSS >= 0.5. When none qualify, the top-ranked KEV limb (highest risk, ties by name). Sorted by name. */
export function bossLimbs(limbs: readonly RaidLimb[]): RaidLimb[] {
  const kev = limbs.filter((l) => l.kev === true);
  const strong = kev.filter((l) => riskOf(l) / 3 >= BOSS_EPSS);
  if (strong.length > 0) return strong.sort((a, b) => cmp(limbKey(a), limbKey(b)));
  if (kev.length === 0) return [];
  return [[...kev].sort((a, b) => riskOf(b) - riskOf(a) || cmp(limbKey(a), limbKey(b)))[0]];
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface RaidStats {
  /** Limbs healed during this raid. */
  healed: number;
  elapsedMs: number;
  /** Nights Without Possession. */
  nights: number;
  /** Longest team chain. */
  bestChain: number;
}

export interface Trophy {
  id: string;
  title: string;
  description: string;
  earned: boolean;
}

const isOpen = (l: RaidLimb) => (l.state === "Possessed" || l.state === "Rotting") && !countsForScore(l);

/** A fixed shelf of team plates, always in the same order. No plate belongs to a person. */
export function trophies(limbs: readonly RaidLimb[], stats: RaidStats): Trophy[] {
  const healed = finite(stats.healed) ? stats.healed : 0;
  const elapsed = finite(stats.elapsedMs) ? Math.max(0, stats.elapsedMs) : 0;
  const sweep = healed >= 1 && !limbs.some(isOpen);
  const boss = bossLimbs(limbs).some(countsForScore);
  return [
    { id: "first-blood", title: "First Blood", description: "The team healed its first limb.", earned: healed >= 1 },
    { id: "chain-3", title: "Chain of 3", description: "Three heals landed within 90 seconds of each other.", earned: finite(stats.bestChain) && stats.bestChain >= 3 },
    { id: "boss-slain", title: "Boss Slain", description: "A known-exploited limb with high exploit odds was healed.", earned: boss },
    { id: "clean-sweep", title: "Clean Sweep", description: "Every sick limb was healed.", earned: sweep },
    { id: "nights-3", title: "Nights Without Possession", description: "Three or more nights without a known-exploited limb left open.", earned: finite(stats.nights) && stats.nights >= NIGHTS_TROPHY },
    { id: "under-ten", title: "Under Ten Minutes", description: "A clean sweep in under ten minutes.", earned: sweep && elapsed > 0 && elapsed < UNDER_TEN_MS },
  ];
}

export type Grade = "S" | "A" | "B" | "C" | "D";
export const GRADES: readonly Grade[] = ["D", "C", "B", "A", "S"];

/** Healed limbs weigh more the earlier they land: points = healed * (1 - 0.5 * elapsed / 15 minutes). */
export function gradeFor(stats: Pick<RaidStats, "healed" | "elapsedMs">): Grade {
  const healed = finite(stats.healed) ? Math.max(0, Math.floor(stats.healed)) : 0;
  const elapsed = finite(stats.elapsedMs) ? Math.min(RAID_MS, Math.max(0, stats.elapsedMs)) : 0;
  const points = healed * (1 - (0.5 * elapsed) / RAID_MS);
  if (points >= 6) return "S";
  if (points >= 4) return "A";
  if (points >= 2.5) return "B";
  if (points >= 1) return "C";
  return "D";
}

export interface Vitals {
  /** Heartbeat in beats per minute: 50 for a calm creature up to 160 when every limb is sick. */
  bpm: number;
  /** 0..100. */
  health: number;
}

export function vitals(limbs: readonly RaidLimb[]): Vitals {
  if (limbs.length === 0) return { bpm: 50, health: 100 };
  const open = limbs.filter(isOpen).length;
  const health = Math.round(100 * (1 - open / limbs.length));
  return { bpm: 50 + Math.round(110 * (1 - health / 100)), health };
}

/** The next rank and the heals still needed for it. `next` is null at the top rank. */
export function rankProgress(healed: number): { next: Rank | null; need: number } {
  const h = finite(healed) ? Math.max(0, Math.floor(healed)) : 0;
  if (h >= RANK_RESURRECTIONIST) return { next: null, need: 0 };
  if (h >= RANK_SURGEON) return { next: "Resurrectionist", need: RANK_RESURRECTIONIST - h };
  return { next: "Surgeon", need: RANK_SURGEON - h };
}

export const GRADE_EPITAPHS: Readonly<Record<Grade, readonly string[]>> = {
  S: [
    "Flawless. The creature rose and the lamps burned brighter.",
    "Not one stitch dropped. The crypt will tell this one for years.",
    "The slab is spotless and the night is ours.",
    "A perfect raid. The dead have nothing left to say.",
  ],
  A: [
    "A clean raid. The creature walks steady.",
    "Most of the rot is gone, and the rest is on notice.",
    "Well stitched. The morning will find it healthy.",
    "The team worked as one body and the body is mending.",
  ],
  B: [
    "A solid raid. The creature breathes easier.",
    "Half the dark is lit. The other half waits for the next raid.",
    "Good stitches, a few still to sew.",
    "The slab is warmer than it was. Keep going.",
  ],
  C: [
    "A first foothold. The creature stirs.",
    "Some rot is cut away and the way back is open.",
    "The first stitches hold. Plan the next raid.",
    "A start is a start. The lamp is lit.",
  ],
  D: [
    "The crypt is still dark. The next raid begins with one limb.",
    "The creature waits. Pick the loudest limb first.",
    "Nothing healed yet, and nothing lost. Try again.",
    "The slab is cold. One graft changes that.",
  ],
};

/** Same grade and seed, same epitaph. Four or more variants per grade. */
export function epitaphFor(grade: Grade, seed: string): string {
  const list = GRADE_EPITAPHS[grade] ?? GRADE_EPITAPHS.D;
  return list[fnv1a(clean(`${grade}|${seed}`, 200)) % list.length];
}

/** Re-exported so callers import the whole team readout from one place. */
export { teamScore, isHealed };
