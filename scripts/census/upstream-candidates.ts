/**
 * Read-only analysis of the census output in out/census/*.json (written by `npm run census`).
 * Lists limbs that pass the noise filter (Possessed, or Rotting with EPSS >= 0.1) and says whether
 * a fixed version exists that does not cross a major version. Only GET requests to api.osv.dev; nothing is written.
 * Usage: tsx scripts/census/upstream-candidates.ts [out/census]
 * A version derived from a `last_affected` bound (last affected + 1 patch) may not be published: check the registry by hand.
 * Bot PRs and CONTRIBUTING rules are NOT checked here; docs/UPSTREAM.md records those by hand.
 */
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseAdvisory } from "../../src/necromancer/advisory.js";
import { type Advisory, chooseVersion } from "../../src/necromancer/version.js";

export const EPSS_LINE = 0.1;

export type Verdict =
  | { kind: "candidate"; fixed: string }
  | { kind: "breaking"; fixed: string }
  | { kind: "no-fix" }
  | { kind: "unverifiable"; reason: string };

export interface CreatureLimb {
  id: string;
  ecosystem: "npm" | "PyPI";
  name: string;
  version: string;
  direct: boolean;
  manifest: string;
  state: string;
  kev: boolean;
  epss: number | null;
  vulns: { id: string; cves: string[] }[];
}

export interface CreatureFile {
  repo: string;
  limbs: CreatureLimb[];
}

export interface Row {
  repo: string;
  file: string;
  ecosystem: string;
  name: string;
  from: string;
  direct: boolean;
  kev: boolean;
  epss: number | null;
  cves: string[];
  verdict: Verdict;
}

/** Same filter as `.kiro/steering/sla-policy.md`: Possessed, or Rotting with EPSS >= 0.1. */
export function passesFilter(l: Pick<CreatureLimb, "state" | "kev" | "epss">): boolean {
  if (l.state === "Possessed" || l.kev) return true;
  return l.state === "Rotting" && l.epss !== null && l.epss >= EPSS_LINE;
}

/** Verdict for one limb. Anything unclear is "unverifiable" (fail safe: no candidate). */
export function judge(l: CreatureLimb, advisories: (Advisory | null)[]): Verdict {
  if (advisories.length === 0 || advisories.some((a) => a === null)) return { kind: "unverifiable", reason: "advisory missing or unreadable" };
  const choice = chooseVersion(l.ecosystem, l.name, l.version, advisories as Advisory[]);
  if (!choice) {
    return /^\d+\.\d+\.\d+$/.test(l.version)
      ? { kind: "no-fix" }
      : { kind: "unverifiable", reason: "version is not major.minor.patch" };
  }
  return choice.breaking ? { kind: "breaking", fixed: choice.version } : { kind: "candidate", fixed: choice.version };
}

export async function analyse(creatures: CreatureFile[], lookup: (id: string) => Promise<Advisory | null>): Promise<Row[]> {
  const rows: Row[] = [];
  for (const c of creatures) {
    for (const l of c.limbs.filter(passesFilter)) {
      const advisories = await Promise.all(l.vulns.map((v) => lookup(v.id)));
      rows.push({
        repo: c.repo,
        file: l.manifest,
        ecosystem: l.ecosystem,
        name: l.name,
        from: l.version,
        direct: l.direct,
        kev: l.kev,
        epss: l.epss,
        cves: [...new Set(l.vulns.flatMap((v) => v.cves))].sort(),
        verdict: judge(l, advisories),
      });
    }
  }
  return rows.sort((a, b) => Number(b.kev) - Number(a.kev) || (b.epss ?? 0) - (a.epss ?? 0) || (a.repo < b.repo ? -1 : 1));
}

const describe = (v: Verdict): string =>
  v.kind === "candidate" ? `fix ${v.fixed} (same major)` :
  v.kind === "breaking" ? `fix ${v.fixed} (crosses a major or 0.x minor)` :
  v.kind === "no-fix" ? "no fixed version in OSV ranges" : `not verified: ${v.reason}`;

export function render(rows: Row[], max = 8): string {
  const lines = ["| Repo | File | Package | Current | Direct | KEV | EPSS | CVEs | Verdict |", "|---|---|---|---|---|---|---|---|---|"];
  for (const r of rows.filter((x) => x.verdict.kind === "candidate").slice(0, max).concat(rows.filter((x) => x.verdict.kind !== "candidate"))) {
    lines.push(`| ${r.repo} | ${r.file} | ${r.name} | ${r.from} | ${r.direct ? "yes" : "no"} | ${r.kev ? "yes" : "no"} | ${r.epss ?? "n/a"} | ${r.cves.join(", ") || "none"} | ${describe(r.verdict)} |`);
  }
  return lines.join("\n") + "\n";
}

async function osvAdvisory(id: string): Promise<Advisory | null> {
  try {
    const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20_000) });
    return res.ok ? parseAdvisory(await res.json()) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const dir = process.argv[2] ?? "out/census";
  const files = readdirSync(dir).filter((f) => f.includes("__") && f.endsWith(".json"));
  if (files.length === 0) {
    console.error(`upstream-candidates: no creature files in ${dir}. Run npm run census first.`);
    process.exit(1);
  }
  const creatures = files.map((f) => {
    const c = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as CreatureFile;
    return { ...c, repo: f.replace(/\.json$/, "").replace("__", "/") };
  });
  process.stdout.write(render(await analyse(creatures, osvAdvisory)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
