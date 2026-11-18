import { ownerLabel } from "../exhume/owners.js";
// The noise funnel shown after a scan: N findings -> M exorcised as noise -> K monsters.
// Same counting rule as the share card (src/render/card.ts): a finding is a limb that is Rotting or Possessed
// (an unchecked package is Rotting, so unknown stays counted, never dropped). K = limbs that spawn per the SLA policy.
export interface FunnelLimb {
  state: string;
  spawned: boolean;
}

export interface NoiseFunnel {
  findings: number;
  noise: number;
  monsters: number;
}

export function noiseFunnel(limbs: readonly FunnelLimb[]): NoiseFunnel {
  let findings = 0;
  let monsters = 0;
  for (const l of limbs) {
    if (l.state !== "Rotting" && l.state !== "Possessed") continue;
    findings++;
    if (l.spawned) monsters++;
  }
  return { findings, noise: findings - monsters, monsters };
}

export function funnelText(f: NoiseFunnel): string {
  return `${f.findings} findings -> ${f.noise} exorcised as noise -> ${f.monsters} monsters`;
}

/** Owners of the monsters from CODEOWNERS only, deduplicated; "no owner yet" when a monster has none (or no monster spawns). */
export function funnelOwners(limbs: readonly (FunnelLimb & { owner?: string | null })[]): string[] {
  const set = new Set<string>();
  for (const l of limbs) if (l.spawned) set.add(ownerLabel(l.owner));
  return set.size === 0 ? [ownerLabel(null)] : [...set].sort();
}
