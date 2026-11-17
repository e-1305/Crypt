// End-of-raid card (Epic B2.5). Data only plus a pure sanitiser; drawing lives in web/theatre/card-draw.js.
// The card holds public scan data only: repo name, counts, risk number, time and an epitaph. No owners, no people.
import { clean } from "../render/plate.js";
import { RAID_MS, formatClock, rankFor, teamScore, type RaidLimb } from "./raid.js";
import { epitaphFor, gradeFor, trophies, type Grade } from "./gamify.js";

export interface CardData {
  title: string;
  repo: string;
  limbsHealed: number;
  riskRemoved: string;
  time: string;
  rank: string;
  epitaph: string;
  grade: Grade;
  /** Titles of the team trophies earned. */
  trophies: string[];
  /** Longest team combo chain. */
  chain: number;
}

/** Optional extras for the card. `all` is the whole limb list (for Boss Slain and Clean Sweep). */
export interface CardExtra {
  all?: readonly RaidLimb[];
  bestChain?: number;
  nights?: number;
}

/** `gained` holds the limbs that counted for the score during this raid. */
export function cardData(repo: unknown, gained: readonly RaidLimb[], elapsedMs: number, extra: CardExtra = {}): CardData {
  const safeRepo = clean(repo, 40) || "the creature";
  const healed = gained.length;
  const risk = teamScore(gained.map((l) => ({ ...l, healed: true })));
  const elapsed = Math.min(RAID_MS, Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0));
  const chain = typeof extra.bestChain === "number" && Number.isFinite(extra.bestChain) ? Math.max(0, Math.floor(extra.bestChain)) : 0;
  const stats = { healed, elapsedMs: elapsed, nights: extra.nights ?? 0, bestChain: chain };
  const grade = gradeFor(stats);
  const shelf = trophies(extra.all ?? gained, stats).filter((t) => t.earned).map((t) => t.title);
  return {
    title: "CRYPT RAID",
    repo: safeRepo,
    limbsHealed: healed,
    riskRemoved: risk.toFixed(2),
    time: formatClock(elapsed),
    rank: rankFor(healed),
    epitaph: epitaphFor(grade, `${safeRepo}|${healed}|${risk.toFixed(2)}`),
    grade,
    trophies: shelf,
    chain,
  };
}

export function cardLines(c: CardData): string[] {
  return [
    c.title,
    clean(c.repo, 40),
    `Limbs healed: ${c.limbsHealed}`,
    `Risk removed: ${c.riskRemoved}`,
    `Time: ${c.time}`,
    `Rank: ${c.rank}`,
    clean(c.epitaph, 80),
    `Grade: ${c.grade}`,
    `Best chain: ${c.chain}`,
    `Trophies: ${c.trophies.length > 0 ? c.trophies.map((t) => clean(t, 30)).join(", ") : "none yet"}`,
  ];
}
