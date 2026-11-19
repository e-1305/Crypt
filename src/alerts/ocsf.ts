// Pure builder for `crypt alerts --format ocsf`: one OCSF Vulnerability Finding (class_uid 2002) per spawned limb.
// Schema: OCSF 1.1.0, class Vulnerability Finding (schema.ocsf.io). See docs/SOC.md.
// Deterministic: same creature and same `now` give the same bytes. Fail-safe: an invalid creature throws, nothing is written.
// Blameless: the owner is a team handle from CODEOWNERS or "unowned". No person is ever named.
import { teamOwners } from "./issues.js";

export const OCSF_VERSION = "1.1.0";
export const VULNERABILITY_FINDING = 2002;
export const FINDINGS_CATEGORY = 2;
// Keep equal to package.json "version" (tests/alerts-ocsf.test.ts checks it).
export const PRODUCT_VERSION = "0.2.0";
const ACTIVITY_CREATE = 1;
const STATUS_NEW = 1;

export type SlaClass = "48 hours" | "this sprint" | "backlog";

export interface OcsfFinding {
  class_uid: number;
  class_name: "Vulnerability Finding";
  category_uid: number;
  category_name: "Findings";
  activity_id: number;
  activity_name: "Create";
  type_uid: number;
  severity_id: number;
  severity: string;
  status_id: number;
  status: "New";
  time: number;
  metadata: { version: string; product: { name: "CRYPT"; vendor_name: "e-1305"; version: string } };
  finding_info: { uid: string; title: string; desc: string; created_time: number; types: string[] };
  vulnerabilities: { cve?: { uid: string }; title: string; severity: string; is_exploit_available: boolean; affected_packages: { name: string; version: string; type: string }[] }[];
  unmapped: { kev: boolean; epss: number | null; owner_team: string; sla: SlaClass; sla_deadline: string | null; advisory_ids: string[]; feeds_as_of: { kev: string | null; epss: string | null } };
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[^\x20-\x7e]/g, "").trim().slice(0, max) : "");

/** OCSF severity_id: 0 Unknown, 1 Informational, 2 Low, 3 Medium, 4 High, 5 Critical. Unknown stays unknown, never guessed. */
export function severityOf(vendor: unknown): { id: number; name: string } {
  const s = clean(vendor, 20).toUpperCase();
  const map: Record<string, [number, string]> = { CRITICAL: [5, "Critical"], HIGH: [4, "High"], MODERATE: [3, "Medium"], MEDIUM: [3, "Medium"], LOW: [2, "Low"] };
  const hit = map[s];
  return hit ? { id: hit[0], name: hit[1] } : { id: 0, name: "Unknown" };
}

/** The SLA rule from .kiro/steering/sla-policy.md: KEV 48 hours, EPSS >= 0.1 this sprint, everything else backlog. */
export function slaClass(kev: boolean, epss: number | null): SlaClass {
  if (kev) return "48 hours";
  if (epss !== null && epss >= 0.1) return "this sprint";
  return "backlog";
}

export function buildOcsf(creature: unknown, now: Date): OcsfFinding[] {
  const c = rec(creature);
  if (!Array.isArray(c.limbs)) throw new Error("creature.json has no limbs array");
  const t = now.getTime();
  if (!Number.isFinite(t)) throw new Error("invalid time");
  const product = { name: "CRYPT" as const, vendor_name: "e-1305" as const, version: PRODUCT_VERSION };
  // "As of": the KEV and EPSS feed dates recorded in creature.json, so a reader knows how old the ranking is. null when a feed was missing.
  const feeds = rec(c.feeds);
  const feedDate = (k: string): string | null => clean(rec(feeds[k]).date, 40) || null;
  const feedsAsOf = { kev: feedDate("kev"), epss: feedDate("epss") };
  const out: OcsfFinding[] = [];
  const limbs = (c.limbs as unknown[]).map(rec).filter((l) => l.spawned === true && clean(l.name, 100) !== "");
  limbs.sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0) || clean(a.name, 100).localeCompare(clean(b.name, 100)));
  for (const l of limbs) {
    const name = clean(l.name, 100);
    const version = clean(l.version, 50) || "unknown";
    const ecosystem = clean(l.ecosystem, 20) || "unknown";
    const kev = l.kev === true;
    const epss = typeof l.epss === "number" && Number.isFinite(l.epss) && l.epss >= 0 && l.epss <= 1 ? l.epss : null;
    const sev = severityOf(l.vendorSeverity);
    const vulns = (Array.isArray(l.vulns) ? l.vulns : []).map(rec);
    const advisories = [...new Set(vulns.map((v) => clean(v.id, 60)).filter(Boolean))].sort();
    const cves = [...new Set(vulns.flatMap((v) => (Array.isArray(v.cves) ? v.cves : [])).map((x) => clean(x, 40)).filter((x) => /^CVE-\d{4}-\d+$/.test(x)))].sort();
    const sla = slaClass(kev, epss);
    const pkg = { name, version, type: ecosystem };
    const title = `${kev ? "Actively exploited (CISA KEV)" : "Vulnerable"} dependency: ${name} ${version}`;
    const entries = (cves.length > 0 ? cves : [null]).map((cve) => ({
      ...(cve ? { cve: { uid: cve } } : {}),
      title: cve ? `${cve} in ${name} ${version}` : `${advisories[0] ?? "advisory"} in ${name} ${version}`,
      severity: sev.name,
      is_exploit_available: kev,
      affected_packages: [pkg],
    }));
    out.push({
      class_uid: VULNERABILITY_FINDING,
      class_name: "Vulnerability Finding",
      category_uid: FINDINGS_CATEGORY,
      category_name: "Findings",
      activity_id: ACTIVITY_CREATE,
      activity_name: "Create",
      type_uid: VULNERABILITY_FINDING * 100 + ACTIVITY_CREATE,
      severity_id: sev.id,
      severity: sev.name,
      status_id: STATUS_NEW,
      status: "New",
      time: t,
      metadata: { version: OCSF_VERSION, product },
      finding_info: {
        uid: `crypt:${ecosystem}:${name}@${version}`,
        title,
        desc: `Locked version ${version} of ${name} has a known advisory. Lockfile-level finding: it does not prove the vulnerable code runs. Fix through one pull request that a person reviews and lands.`,
        created_time: t,
        types: ["Dependency"],
      },
      vulnerabilities: entries,
      unmapped: {
        kev,
        epss,
        owner_team: teamOwners(l.owner),
        sla,
        sla_deadline: sla === "48 hours" ? new Date(t + 48 * 3600 * 1000).toISOString() : null,
        advisory_ids: advisories,
        feeds_as_of: feedsAsOf,
      },
    });
  }
  return out;
}
