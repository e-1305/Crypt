// End-of-raid card (Epic B2.5). Data only plus a pure sanitiser; drawing lives in web/theatre/card-draw.js.
// The card holds public scan data only: repo name, counts, risk number, time and an epitaph. No owners, no people.
import { clean } from "../render/plate.js";
import { RAID_MS, epitaph, formatClock, rankFor, teamScore, type RaidLimb } from "./raid.js";

export interface CardData {
  title: string;
  repo: string;
  limbsHealed: number;
  riskRemoved: string;
  time: string;
  rank: string;
  epitaph: string;
}

/** `gained` holds the limbs that counted for the score during this raid. */
export function cardData(repo: unknown, gained: readonly RaidLimb[], elapsedMs: number): CardData {
  const safeRepo = clean(repo, 40) || "the creature";
  const healed = gained.length;
  const risk = teamScore(gained.map((l) => ({ ...l, healed: true })));
  const elapsed = Math.min(RAID_MS, Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0));
  return {
    title: "CRYPT RAID",
    repo: safeRepo,
    limbsHealed: healed,
    riskRemoved: risk.toFixed(2),
    time: formatClock(elapsed),
    rank: rankFor(healed),
    epitaph: epitaph(`${safeRepo}|${healed}|${risk.toFixed(2)}`),
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
  ];
}
