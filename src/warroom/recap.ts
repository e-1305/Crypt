// End-of-raid recap (Epic D4): maps the scene to the existing raid card (reuse of cardData from src/theatre/card.ts).
import { RAID_MS } from "../theatre/raid.js";
import { cardData, type CardData } from "../theatre/card.js";
import { limbKeyOf, type Scene, type WarLimb } from "./state.js";

/** `limbs` are the scene input limbs. The card holds public scan data only: counts, risk, time, epitaph. */
export function recapFor(scene: Scene, limbs: readonly WarLimb[], repo: unknown): CardData {
  const healed = new Set(scene.limbs.filter((l) => l.phase === "healed").map((l) => l.key));
  const gained = limbs.filter((l) => healed.has(limbKeyOf(l)));
  return cardData(repo, gained, RAID_MS - scene.remainingMs, { all: limbs, bestChain: scene.combo.best });
}
