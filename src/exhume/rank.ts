import type { EpssFeed, KevFeed } from "./feeds.js";
import { type Limb, type OsvVuln, cmp, limbKey } from "./types.js";

export type State = "Healthy" | "Rotting" | "Possessed";
export type UnknownReason = "osv-unavailable" | "osv-stale" | "version-unpinned" | "feed-missing";

export const SPAWN_EPSS = 0.1;
const SEVERITY: Record<string, number> = { LOW: 2, MODERATE: 5, MEDIUM: 5, HIGH: 7.5, CRITICAL: 9.5 };

export function severityNumber(label: string | null): number {
  return label === null ? 0 : (SEVERITY[label.toUpperCase()] ?? 0);
}

/** Pure score. KEV dominates EPSS, EPSS (5 decimals) dominates severity (0 to 10). */
export function scoreOf(i: { kev: boolean; epss: number | null; severity: number }): number {
  return (i.kev ? 1e9 : 0) + (i.epss ?? 0) * 1e7 + i.severity;
}

export interface RankedLimb extends Limb {
  rank: number;
  id: string;
  owner: string;
  state: State;
  unknown: boolean;
  unknownReason: UnknownReason | null;
  spawned: boolean;
  score: number;
  kev: boolean;
  epss: number | null;
  severity: number;
  vulns: { id: string; cves: string[] }[];
}

export interface RankInput {
  limbs: Limb[];
  /** Limb key to vulns. A limb absent from this map has OSV status unknown. */
  osv: Map<string, OsvVuln[]>;
  /** Limb keys whose OSV answer is expired and could not be refreshed. */
  stale?: Set<string>;
  kev: KevFeed | null;
  epss: EpssFeed | null;
  ownerOfManifest: (manifest: string) => string;
}

const STATE_RANK: Record<State, number> = { Possessed: 0, Rotting: 1, Healthy: 2 };

function cvesOf(v: OsvVuln): string[] {
  return [...new Set([v.id, ...v.aliases].map((s) => s.toUpperCase()).filter((s) => s.startsWith("CVE-")))].sort(cmp);
}

/**
 * Combine several OSV answers for the same limb, worst case. Any unknown answer
 * (undefined) makes the result unknown; otherwise the vulns are unioned by id.
 * Order of the inputs does not matter.
 */
export function combineOsvAnswers(answers: (OsvVuln[] | undefined)[]): OsvVuln[] | undefined {
  if (answers.length === 0 || answers.some((a) => a === undefined)) return undefined;
  const byId = new Map<string, OsvVuln>();
  for (const list of answers as OsvVuln[][]) {
    for (const v of list) {
      const prev = byId.get(v.id);
      byId.set(
        v.id,
        prev === undefined
          ? { id: v.id, aliases: [...new Set(v.aliases)].sort(cmp), severity: v.severity }
          : {
              id: v.id,
              aliases: [...new Set([...prev.aliases, ...v.aliases])].sort(cmp),
              severity: severityNumber(prev.severity) >= severityNumber(v.severity) ? prev.severity : v.severity,
            },
      );
    }
  }
  return [...byId.values()].sort((a, b) => cmp(a.id, b.id));
}

export function rankLimbs(input: RankInput): RankedLimb[] {
  const feedMissing = input.kev === null || input.epss === null;
  const rows = input.limbs.map((l) => {
    const key = limbKey(l);
    const vulns = input.osv.get(key);
    const list = vulns ?? [];
    const cves = list.flatMap(cvesOf);
    const kev = input.kev !== null && cves.some((c) => input.kev!.cves.has(c));
    const epssVals =
      input.epss === null ? [] : cves.flatMap((c) => (input.epss!.scores.has(c) ? [input.epss!.scores.get(c)!] : []));
    const epss = epssVals.length > 0 ? Math.max(...epssVals) : null;
    const severity = list.reduce((m, v) => Math.max(m, severityNumber(v.severity)), 0);
    let reason: UnknownReason | null = null;
    if (l.version === "unknown") reason = "version-unpinned";
    else if (vulns === undefined) reason = "osv-unavailable";
    else if (input.stale?.has(key)) reason = "osv-stale";
    else if (feedMissing) reason = "feed-missing";
    let state: State = kev ? "Possessed" : list.length > 0 ? "Rotting" : "Healthy";
    if (reason !== null && state === "Healthy") state = "Rotting"; // fail-safe: unknown is never clean
    const spawned = state === "Possessed" || (state === "Rotting" && epss !== null && epss >= SPAWN_EPSS);
    return {
      ...l,
      id: key,
      owner: input.ownerOfManifest(l.manifest),
      state,
      unknown: reason !== null,
      unknownReason: reason,
      spawned,
      score: scoreOf({ kev, epss, severity }),
      kev,
      epss,
      severity,
      vulns: list.map((v) => ({ id: v.id, cves: cvesOf(v) })).sort((a, b) => cmp(a.id, b.id)),
    };
  });
  rows.sort(
    (a, b) =>
      STATE_RANK[a.state] - STATE_RANK[b.state] ||
      b.score - a.score ||
      Number(a.unknown) - Number(b.unknown) ||
      cmp(a.id, b.id),
  );
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

export interface Counts {
  limbs: number;
  findings: number;
  exorcised: number;
  spawned: number;
  /** Unknown findings that are not spawned. They are never exorcised as noise. */
  unresolved: number;
  possessed: number;
  rotting: number;
  healthy: number;
  unknown: number;
}

export function countLimbs(limbs: RankedLimb[]): Counts {
  const healthy = limbs.filter((l) => l.state === "Healthy").length;
  const spawned = limbs.filter((l) => l.spawned).length;
  const findings = limbs.length - healthy;
  return {
    limbs: limbs.length,
    findings,
    exorcised: limbs.filter((l) => l.state !== "Healthy" && !l.spawned && !l.unknown).length,
    spawned,
    unresolved: limbs.filter((l) => l.unknown && !l.spawned).length,
    possessed: limbs.filter((l) => l.state === "Possessed").length,
    rotting: limbs.filter((l) => l.state === "Rotting").length,
    healthy,
    unknown: limbs.filter((l) => l.unknown).length,
  };
}
