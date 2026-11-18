// Pure builder for `crypt alerts --format issues`: one issue per Possessed (KEV) limb.
// Owners come from CODEOWNERS data in creature.json. No person is ever named.
import { limbIds, spawnedLimbs, type LimbInput } from "../raise/generate.js";
import { ownerLabel } from "../exhume/owners.js";

export const MAX_ISSUES = 5;
export const SLA_HOURS = 48;

export interface AlertIssue {
  limb: string;
  title: string;
  body: string;
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[^\x20-\x7e]/g, "").trim().slice(0, max) : "");

/** Real limb IDs, from the same code that writes the game. A Possessed limb that is not spawned has no game ID, so it falls back to its own. */
function graftIds(limbs: Record<string, unknown>[]): Map<Record<string, unknown>, string> {
  const spawned = spawnedLimbs(limbs as LimbInput[]) as Record<string, unknown>[];
  const ids = limbIds(spawned.map((l) => (typeof l.name === "string" ? l.name : "")));
  const map = new Map<Record<string, unknown>, string>();
  spawned.forEach((l, i) => map.set(l, ids[i]!));
  return map;
}

/** Inside a code span a name cannot mention anyone. */
const code = (v: string): string => v.replace(/`/g, "'");

export const issueTitle = (name: string, version: string): string => `[CRYPT] KEV: ${name} ${version}`;

/** Issues for Possessed limbs, most urgent first. `cap` limits the list (the live run passes Infinity, then caps after dropping open titles). */
export function buildIssues(creature: unknown, repo = "<owner/name>", cap = MAX_ISSUES): AlertIssue[] {
  const limbs = Array.isArray(rec(creature).limbs) ? (rec(creature).limbs as unknown[]) : [];
  const gids = graftIds(limbs.map(rec));
  const out: AlertIssue[] = [];
  const seen = new Set<string>();
  const possessed = limbs.map(rec).filter((l) => l.state === "Possessed" && clean(l.name, 100) !== "");
  possessed.sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0));
  for (const l of possessed) {
    const name = clean(l.name, 100);
    const version = clean(l.version, 50) || "unknown";
    const title = issueTitle(name, version);
    if (seen.has(title)) continue;
    seen.add(title);
    const cves = [
      ...new Set(
        (Array.isArray(l.vulns) ? l.vulns : [])
          .flatMap((v) => (Array.isArray(rec(v).cves) ? (rec(v).cves as unknown[]) : []))
          .map((c) => clean(c, 40))
          .filter((c) => /^CVE-\d{4}-\d+$/.test(c)),
      ),
    ].sort();
    const body = [
      `\`${code(name)} ${code(version)}\` is Possessed: it is in the CISA KEV catalog, so it is exploited in the wild.`,
      "",
      `CVEs: ${cves.length > 0 ? cves.join(", ") : "none listed"}`,
      `Owner: ${ownerLabel(clean(l.owner, 100))}`,
      `SLA: fix within ${SLA_HOURS} hours of the raid.`,
      "",
      "Graft command:",
      "",
      "```",
      `crypt graft ${(gids.get(l) ?? limbIds([name])[0])} --live --repo ${repo}`,
      "```",
      "",
      "A person reviews and lands the pull request.",
    ].join("\n");
    out.push({ limb: name, title, body });
    if (out.length >= cap) break;
  }
  return out;
}
