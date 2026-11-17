/** Pure census code: parse the repo list, aggregate counts, render the aggregate-only results. No I/O. */

export interface RepoRef {
  ecosystem: "npm" | "PyPI";
  repo: string; // owner/name
  sha: string;
}

export interface RepoCounts {
  limbs: number;
  findings: number;
  exorcised: number;
  spawned: number;
  unresolved: number;
  possessed: number;
  unknown: number;
  /** Limbs whose owner is "unowned" (no CODEOWNERS rule matches the manifest). */
  unowned: number;
  /** 1 when the repository has no CODEOWNERS file in any location, else 0. */
  noCodeowners: number;
}

export interface Aggregate {
  repos: number;
  limbs: number;
  findings: number;
  exorcised: number;
  spawned: number;
  unresolved: number;
  possessed: number;
  unknown: number;
  unowned: number;
  noCodeowners: number;
  pctFindings: number;
  pctExorcised: number;
  pctSpawned: number;
  pctUnowned: number;
  medianBefore: number;
  medianAfter: number;
}

export interface Meta {
  scanDate: string; // YYYY-MM-DD, UTC
  kevDate: string | null;
  epssDate: string | null;
}

const ROW = /^\|\s*(npm|PyPI)\s*\|\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s*\|\s*([0-9a-f]{40})\s*\|\s*$/;

export function parseRepos(md: string): RepoRef[] {
  const out: RepoRef[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = ROW.exec(line);
    if (m) out.push({ ecosystem: m[1] as RepoRef["ecosystem"], repo: m[2]!, sha: m[3]! });
  }
  return out;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const pct = (n: number, d: number) => (d === 0 ? 0 : (100 * n) / d);
const sum = (xs: RepoCounts[], k: keyof RepoCounts) => xs.reduce((a, c) => a + c[k], 0);

export function aggregate(repos: RepoCounts[]): Aggregate {
  const limbs = sum(repos, "limbs");
  const findings = sum(repos, "findings");
  const exorcised = sum(repos, "exorcised");
  const spawned = sum(repos, "spawned");
  const unowned = sum(repos, "unowned");
  return {
    repos: repos.length,
    limbs,
    findings,
    exorcised,
    spawned,
    unresolved: sum(repos, "unresolved"),
    possessed: sum(repos, "possessed"),
    unknown: sum(repos, "unknown"),
    unowned,
    noCodeowners: sum(repos, "noCodeowners"),
    pctFindings: pct(findings, limbs),
    pctExorcised: pct(exorcised, findings),
    pctSpawned: pct(spawned, findings),
    pctUnowned: pct(unowned, limbs),
    medianBefore: median(repos.map((r) => r.findings)),
    medianAfter: median(repos.map((r) => r.spawned)),
  };
}

const n = (x: number) => x.toLocaleString("en-US");
const p = (x: number) => `${x.toFixed(1)}%`;
const m = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export function renderResults(a: Aggregate, meta: Meta): string {
  const lines = [
    "# Crypt Census: results",
    "",
    `- Across ${a.repos} popular open-source projects, CRYPT's filter cut ${n(a.findings)} findings to ${n(a.spawned)} monsters.`,
    `- ${p(a.pctExorcised)} of findings were exorcised as noise, so only ${p(a.pctSpawned)} spawned: ${n(a.spawned)} limbs out of ${n(a.limbs)} dependencies.`,
    `- ${n(a.possessed)} limbs were possessed (actively exploited, CISA KEV), and ${p(a.pctUnowned)} of all limbs had no CODEOWNERS owner to heal them. ${a.noCodeowners} of ${a.repos} repositories have no CODEOWNERS file at all.`,
    "",
    "Aggregates only. No project is named next to a finding. Per-repo data stays in a gitignored directory (blameless publication rule).",
    "",
    "## Numbers",
    "",
    "| Measure | Value |",
    "|---|---|",
    `| Repositories scanned | ${a.repos} |`,
    `| Total limbs (dependencies) | ${n(a.limbs)} |`,
    `| Findings (limbs with a known vulnerability) | ${n(a.findings)} (${p(a.pctFindings)} of limbs) |`,
    `| Exorcised by the noise filter | ${n(a.exorcised)} (${p(a.pctExorcised)} of findings) |`,
    `| Spawned as monsters | ${n(a.spawned)} (${p(a.pctSpawned)} of findings) |`,
    `| Unresolved (status unknown, kept as findings, never called clean) | ${n(a.unresolved)} |`,
    `| Possessed limbs (CISA KEV) | ${n(a.possessed)} |`,
    `| Limbs with no CODEOWNERS owner | ${n(a.unowned)} (${p(a.pctUnowned)} of limbs) |`,
    `| Repositories with no CODEOWNERS file at all | ${a.noCodeowners} of ${a.repos} |`,
    `| Median findings per repo, before exorcism | ${m(a.medianBefore)} |`,
    `| Median findings per repo, after exorcism (spawned) | ${m(a.medianAfter)} |`,
    "",
    "## Method",
    "",
    "- Each repository was read at a pinned commit SHA (list: [repos.md](repos.md)). Only the root manifests and CODEOWNERS files were downloaded as text. No code was run and nothing was installed.",
    "- The scan used CRYPT's `exhume` (OSV for vulnerabilities, CISA KEV and FIRST EPSS for ranking). Noise exorcism follows `.kiro/steering/sla-policy.md`: only Possessed limbs and Rotting limbs with EPSS >= 0.1 spawn.",
    "- A limb owner comes from CODEOWNERS only. Git history is never read.",
    "- Reproduce with `npm run census`.",
    "",
    "## Dates",
    "",
    `- Scan date (UTC): ${meta.scanDate}`,
    `- CISA KEV feed date: ${meta.kevDate ?? "unknown"}`,
    `- FIRST EPSS feed date: ${meta.epssDate ?? "unknown"}`,
    "",
    "OSV advisories and both feeds change daily, so a rerun on another day gives different numbers for the same SHAs.",
    "",
    "## Limitations",
    "",
    "- Lockfile only: the scan reads `package-lock.json` (v2/v3) and `requirements.txt` (`==` pins). Python requirements without an `==` pin cannot be checked; they are counted as unresolved findings, never as clean.",
    "- No reachability analysis: a finding means the locked version has a known advisory, not that the vulnerable code runs.",
    "- Only root manifests are read. Manifests in subdirectories and other lockfile formats (yarn, pnpm, poetry) are out of scope.",
    "- Lockfiles include development dependencies, so some findings sit in build tooling.",
    "- CODEOWNERS covers the manifest, so every limb of a manifest shares one owner (or none).",
    "- A sample of 20 popular projects is not a random sample of all software.",
    "",
  ];
  return lines.join("\n");
}

/** True when the text names any repository from the list as `owner/name` (case-insensitive). */
export function leaksProjectName(text: string, repos: RepoRef[]): boolean {
  const t = text.toLowerCase();
  return repos.some((r) => t.includes(r.repo.toLowerCase()));
}
