import type { Creature } from "../exhume/creature.js";
import { ownerLabel } from "../exhume/owners.js";
import { SPAWN_EPSS } from "../exhume/rank.js";
import { cmp } from "../exhume/types.js";

/** CRYPT opens at most this many PRs per run (sla-policy). */
export const MAX_PRS = 5;
const MAX_IDS = 3;

export interface CompareRow {
  name: string;
  version: string;
  direct: boolean;
  advisories: string[];
  /** Dependabot security updates open one PR per vulnerable package; no advisories, no PR. */
  dependabotPr: boolean;
  cryptRank: number;
  cryptState: string;
  cryptSpawns: boolean;
  owner: string;
  why: string;
}

function why(l: Creature["limbs"][number], spawns: boolean): string {
  if (l.unknown) return "not compared (OSV answer unknown)";
  if (l.state === "Healthy") return "no advisories, nothing to fix";
  if (l.kev) return `in CISA KEV (Possessed, 48h), EPSS ${l.epss ?? "n/a"}`;
  const e = l.epss === null ? "n/a" : String(l.epss);
  return spawns
    ? `EPSS ${e} >= ${SPAWN_EPSS} (this sprint)`
    : `EPSS ${e} < ${SPAWN_EPSS} noise line, backlog`;
}

/** Pure: rows sorted alphabetically by package name (our stated order, GitHub documents none). */
export function compareRows(c: Creature): CompareRow[] {
  let spawned = 0;
  const spawnSet = new Set<string>();
  for (const l of c.limbs) {
    // limbs are already ranked, so the cap keeps the top ones
    if (l.spawned && spawned < MAX_PRS) {
      spawned++;
      spawnSet.add(l.id);
    }
  }
  return c.limbs
    .map((l): CompareRow => {
      const advisories = l.vulns.map((v) => v.id).sort(cmp);
      const spawns = spawnSet.has(l.id);
      return {
        name: l.name,
        version: l.version,
        direct: l.direct,
        advisories,
        dependabotPr: advisories.length > 0,
        cryptRank: l.rank,
        cryptState: l.state,
        cryptSpawns: spawns,
        owner: ownerLabel(l.owner),
        why: why(l, spawns),
      };
    })
    .sort((a, b) => cmp(a.name, b.name));
}

function advisoryCell(ids: string[]): string {
  if (ids.length === 0) return "0";
  const shown = ids.slice(0, MAX_IDS).join(", ");
  return ids.length > MAX_IDS ? `${ids.length}: ${shown}, +${ids.length - MAX_IDS} more` : `${ids.length}: ${shown}`;
}

export function renderTable(rows: CompareRow[]): string {
  const out = [
    "| Package | Version | Advisories | Dependabot would open | CRYPT | Why |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    const crypt = r.cryptSpawns
      ? `#${r.cryptRank} spawns, owner ${r.owner}`
      : r.dependabotPr
        ? `#${r.cryptRank} exorcises (no PR)`
        : `#${r.cryptRank} healthy`;
    out.push(
      `| ${r.name}${r.direct ? "" : " (transitive)"} | ${r.version} | ${advisoryCell(r.advisories)} | ${r.dependabotPr ? "1 PR" : "none"} | ${crypt} | ${r.why} |`,
    );
  }
  return out.join("\n");
}

export function renderSummary(rows: CompareRow[]): string {
  const dep = rows.filter((r) => r.dependabotPr).length;
  const spawn = rows.filter((r) => r.cryptSpawns).length;
  const noise = rows.filter((r) => r.dependabotPr && !r.cryptSpawns).length;
  return `Dependabot would open ${dep} PRs. CRYPT spawns ${spawn} (max ${MAX_PRS}) and exorcises ${noise} as noise. Every PR waits for human review.`;
}
