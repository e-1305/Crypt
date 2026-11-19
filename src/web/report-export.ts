import { SPAWN_EPSS } from "../exhume/rank.js";
import { UNOWNED } from "../exhume/owners.js";
import { usageOf } from "../exhume/usage.js";
// The ranked list as CSV or JSON, built in the browser from the same ranking the CLI uses (creature.limbs, rank order).
// SLA text follows .kiro/steering/sla-policy.md. Owners come from CODEOWNERS only; no commit author is ever read.
export const NO_OWNER = "no owner";

export interface ExportLimb {
  rank: number;
  name: string;
  version: string;
  state: string;
  kev: boolean;
  epss: number | null;
  severity: number;
  owner?: string | null;
  /** "is it used?" signal; absent in older creatures. */
  usage?: string;
}

export interface ExportRow {
  rank: number;
  package: string;
  version: string;
  state: string;
  kev: boolean;
  epss: number | null;
  severity: number;
  sla: string;
  owner: string;
  used: string;
}

export const CSV_COLUMNS = ["rank", "package", "version", "state", "kev", "epss", "severity", "sla", "owner", "used"] as const;

/** Possessed: 48 hours. Rotting with EPSS >= 0.1: this sprint. Everything else: backlog. */
export function slaOf(l: { state: string; epss: number | null }): string {
  if (l.state === "Possessed") return "48 hours";
  if (l.state === "Rotting" && l.epss !== null && l.epss >= SPAWN_EPSS) return "this sprint";
  return "backlog";
}

export function ownerOrNone(owner: string | null | undefined): string {
  return !owner || owner === UNOWNED ? NO_OWNER : owner;
}

export function exportRows(limbs: readonly ExportLimb[]): ExportRow[] {
  return limbs.map((l) => ({
    rank: l.rank,
    package: l.name,
    version: l.version,
    state: l.state,
    kev: l.kev,
    epss: l.epss,
    severity: l.severity,
    sla: slaOf(l),
    owner: ownerOrNone(l.owner),
    used: usageOf(l.usage),
  }));
}

/** CODEOWNERS handles (@user, @org/team, emails are not matched) are plain text, so they keep their leading @. */
const HANDLES = /^@[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?( @[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?)*$/;

/** Quotes a cell; a leading = + - @ (or tab/CR) gets a single quote so spreadsheets read it as text. */
export function csvCell(v: string | number | boolean | null): string {
  let s = v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string" && !HANDLES.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(limbs: readonly ExportLimb[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of exportRows(limbs)) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function toJson(r: { repo: string; limbs: readonly ExportLimb[]; feeds: { kev: string; epss: string } }, dryRun: string): string {
  return JSON.stringify({ repo: r.repo, dryRun, feeds: r.feeds, limbs: exportRows(r.limbs) }, null, 2) + "\n";
}
