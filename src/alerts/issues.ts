// Pure builder for `crypt alerts --format issues`: one issue per Possessed (KEV) limb.
// Owners come from CODEOWNERS data in creature.json. No person is ever named.
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

/** Limb IDs are capital letters only (see parse.ts), so the graft command uses the package name reduced to letters. */
export function graftId(name: string): string {
  const id = name.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 32);
  return id === "" ? "LIMB" : id;
}

export const issueTitle = (name: string, version: string): string => `[CRYPT] KEV: ${name} ${version}`;

export function buildIssues(creature: unknown, repo = "<owner/name>"): AlertIssue[] {
  const limbs = Array.isArray(rec(creature).limbs) ? (rec(creature).limbs as unknown[]) : [];
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
      `${name} ${version} is Possessed: it is in the CISA KEV catalog, so it is exploited in the wild.`,
      "",
      `CVEs: ${cves.length > 0 ? cves.join(", ") : "none listed"}`,
      `Owner: ${ownerLabel(clean(l.owner, 100))}`,
      `SLA: fix within ${SLA_HOURS} hours of the raid.`,
      "",
      "Graft command:",
      "",
      "```",
      `crypt graft ${graftId(name)} --live --repo ${repo}`,
      "```",
      "",
      "A person reviews and lands the pull request.",
    ].join("\n");
    out.push({ limb: name, title, body });
    if (out.length >= MAX_ISSUES) break;
  }
  return out;
}
