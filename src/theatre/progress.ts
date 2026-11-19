// Team progress: XP from heals and grim level titles. Pure and deterministic: no fs, no clock, no random, no network.
// Blameless: XP belongs to the team only. No input carries a person and nothing is counted per person.

export const KEV_DEADLINE_HOURS = 48;
export const XP_HEAL = 10;
export const XP_KEV_HEAL = 50;
/** Extra XP for a KEV heal landing at hour 0 of the 48 h window. It shrinks to 0 at the deadline. */
export const XP_KEV_EARLY_MAX = 50;

/** A healed limb. `kev` is CISA KEV membership. `hoursBeforeDeadline` only matters for KEV (48 h SLA). */
export interface HealRecord {
  kev: boolean;
  hoursBeforeDeadline?: number;
}

export interface Level {
  level: number;
  title: string;
  /** Team XP needed to reach this level. */
  xp: number;
}

export const LEVELS: readonly Level[] = [
  { level: 1, title: "Grave Sweeper", xp: 0 },
  { level: 2, title: "Bone Collector", xp: 50 },
  { level: 3, title: "Tomb Warden", xp: 150 },
  { level: 4, title: "Night Surgeon", xp: 350 },
  { level: 5, title: "Ghoul Banisher", xp: 700 },
  { level: 6, title: "Crypt Keeper", xp: 1200 },
  { level: 7, title: "Reaper's Equal", xp: 2000 },
];

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** XP for one heal. A KEV heal is worth the most, scaled by how long before the 48 h deadline it landed. */
export function xpForHeal(heal: HealRecord): number {
  if (heal?.kev !== true) return XP_HEAL;
  const left = finite(heal.hoursBeforeDeadline) ? Math.min(KEV_DEADLINE_HOURS, Math.max(0, heal.hoursBeforeDeadline)) : 0;
  return XP_KEV_HEAL + Math.floor((XP_KEV_EARLY_MAX * left) / KEV_DEADLINE_HOURS);
}

/** Total team XP. Never negative; adding a heal never lowers it. */
export function teamXp(heals: readonly HealRecord[]): number {
  return heals.reduce((sum, h) => sum + xpForHeal(h), 0);
}

/** The highest level whose threshold the XP meets. Bad input counts as 0 XP. */
export function levelFor(xp: number): Level {
  const x = finite(xp) ? Math.max(0, xp) : 0;
  let cur = LEVELS[0];
  for (const l of LEVELS) if (x >= l.xp) cur = l;
  return cur;
}

export interface TeamProgress {
  xp: number;
  level: Level;
  /** XP still needed for the next level, or null at the top level. */
  toNext: number | null;
}

export function teamProgress(heals: readonly HealRecord[]): TeamProgress {
  const xp = teamXp(heals);
  const level = levelFor(xp);
  const next = LEVELS.find((l) => l.level === level.level + 1);
  return { xp, level, toNext: next ? next.xp - xp : null };
}
