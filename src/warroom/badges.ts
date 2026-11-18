// Season badges (Epic D4). Pure functions of the scene. Team only: a badge belongs to the team, never to a person.
import { nightsWithoutPossession, type RaidLimb } from "../theatre/raid.js";
import { limbKeyOf, type Scene, type WarLimb } from "./state.js";

export const NIGHT_SHIFT_HEALS = 3;
export const NIGHTS_TARGET = 7;

export interface Badge {
  id: "first-blood" | "night-shift" | "nights-without-possession";
  title: string;
  earned: boolean;
}

/** `limbs` are the scene input limbs (with detectedAt for the SLA clock). `scanStart` is epoch ms. */
export function badgesFor(scene: Scene, limbs: readonly WarLimb[], now: number, scanStart: number): Badge[] {
  const healedKeys = new Set(scene.limbs.filter((l) => l.phase === "healed").map((l) => l.key));
  const firstBlood = scene.limbs.some((l) => l.kev && l.phase === "healed");
  // A healed limb counts as resolved at the moment it healed; an open KEV limb keeps its SLA clock running.
  const asRaid: RaidLimb[] = limbs.map((l) => (healedKeys.has(limbKeyOf(l)) ? { ...l, healed: true, resolvedAt: now } : l));
  const nights = nightsWithoutPossession(asRaid, now, scanStart);
  return [
    { id: "first-blood", title: "First Blood", earned: firstBlood },
    { id: "night-shift", title: "Night Shift", earned: scene.healedCount >= NIGHT_SHIFT_HEALS },
    { id: "nights-without-possession", title: `Nights Without Possession: ${NIGHTS_TARGET}`, earned: nights >= NIGHTS_TARGET },
  ];
}
