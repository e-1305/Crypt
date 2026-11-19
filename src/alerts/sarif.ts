// Pure builder for `crypt alerts --format sarif`: a SARIF 2.1.0 log for GitHub Code Scanning. One result per spawned limb, one rule per advisory id that a result references (the other ids of a limb are in properties.advisory_ids).
// Deterministic: same creature and same `now` give the same bytes. Fail-safe: an invalid creature throws, nothing is written.
// The $schema value is an identifier, not a request: this file makes no network call.
// Blameless: the owner is a team handle from CODEOWNERS or "no owner". No person is ever named.
import { teamOwners } from "./issues.js";
import { PRODUCT_VERSION, slaClass, type SlaClass } from "./ocsf.js";

export const SARIF_VERSION = "2.1.0";
export const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";

export type SarifLevel = "error" | "warning" | "note";

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
}

export interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: SarifLevel;
  message: { text: string };
  locations: { physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } } }[];
  partialFingerprints: { "crypt/limb/v1": string };
  properties: { kev: boolean; epss: number | null; owner_team: string; sla: SlaClass; sla_deadline: string | null; advisory_ids: string[] };
}

export interface SarifLog {
  $schema: string;
  version: "2.1.0";
  runs: {
    tool: { driver: { name: "CRYPT"; organization: "e-1305"; version: string; rules: SarifRule[] } };
    results: SarifResult[];
    properties: { feeds_as_of: { kev: string | null; epss: string | null } };
  }[];
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[^\x20-\x7e]/g, "").trim().slice(0, max) : "");

/** KEV is an error, EPSS >= 0.1 a warning, everything else a note (same ranking as the SLA policy). */
export function levelOf(kev: boolean, epss: number | null): SarifLevel {
  const sla = slaClass(kev, epss);
  return sla === "48 hours" ? "error" : sla === "this sprint" ? "warning" : "note";
}

/** Repo-relative POSIX directory of the scanned path ("" for the root). Rejects anything that could leave the repo. */
export function cleanBase(base: string | undefined): string {
  const b = (base ?? "").replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  if (b === "" || b === ".") return "";
  if (b.startsWith("/") || !/^[A-Za-z0-9._@ \/-]+$/.test(b) || b.split("/").some((seg) => seg === ".." || seg === "" || seg === ".")) {
    throw new Error("invalid --base: expected a relative directory inside the repository");
  }
  return b;
};

const manifestOf = (ecosystem: string, base: string): string => {
  const file = ecosystem.toLowerCase() === "pypi" ? "requirements.txt" : "package-lock.json";
  return base === "" ? file : `${base}/${file}`;
};

/** `base` is the scanned directory relative to the repository root (the Action `path` input), so results anchor to the real manifest. */
export function buildSarif(creature: unknown, now: Date, base?: string): SarifLog {
  const dir = cleanBase(base);
  const c = rec(creature);
  if (!Array.isArray(c.limbs)) throw new Error("creature.json has no limbs array");
  const t = now.getTime();
  if (!Number.isFinite(t)) throw new Error("invalid time");
  const feeds = rec(c.feeds);
  const feedDate = (k: string): string | null => clean(rec(feeds[k]).date, 40) || null;
  const limbs = (c.limbs as unknown[]).map(rec).filter((l) => l.spawned === true && clean(l.name, 100) !== "");
  limbs.sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0) || clean(a.name, 100).localeCompare(clean(b.name, 100)));

  const rules = new Map<string, SarifRule>();
  const results: SarifResult[] = [];
  const pending: { limb: Record<string, unknown>; advisories: string[] }[] = [];
  for (const l of limbs) {
    const vulns = (Array.isArray(l.vulns) ? l.vulns : []).map(rec);
    const advisories = [...new Set(vulns.map((v) => clean(v.id, 60)).filter(Boolean))].sort();
    pending.push({ limb: l, advisories });
    // Only the advisory a result uses becomes a rule; the limb's other ids stay in properties.advisory_ids.
    for (const id of advisories.slice(0, 1)) {
      if (rules.has(id)) continue;
      const cves = [...new Set(vulns.filter((v) => clean(v.id, 60) === id).flatMap((v) => (Array.isArray(v.cves) ? v.cves : [])).map((x) => clean(x, 40)).filter((x) => /^CVE-\d{4}-\d+$/.test(x)))].sort();
      rules.set(id, {
        id,
        name: id,
        shortDescription: { text: `Known advisory ${id}${cves.length > 0 ? ` (${cves.join(", ")})` : ""} in a locked dependency` },
      });
    }
  }
  const ruleList = [...rules.values()].sort((a, b) => a.id.localeCompare(b.id));
  const index = new Map(ruleList.map((r, i) => [r.id, i]));

  for (const { limb: l, advisories } of pending) {
    const name = clean(l.name, 100);
    const version = clean(l.version, 50) || "unknown";
    const ecosystem = clean(l.ecosystem, 20) || "unknown";
    const kev = l.kev === true;
    const epss = typeof l.epss === "number" && Number.isFinite(l.epss) && l.epss >= 0 && l.epss <= 1 ? l.epss : null;
    const sla = slaClass(kev, epss);
    // A limb with no advisory id still gets a result, under one generic rule.
    const ruleId = advisories[0] ?? "CRYPT-UNKNOWN-ADVISORY";
    if (!index.has(ruleId)) {
      const r: SarifRule = { id: ruleId, name: ruleId, shortDescription: { text: "Dependency with a known advisory (id not recorded)" } };
      ruleList.push(r);
      index.set(ruleId, ruleList.length - 1);
    }
    const text = `${kev ? "Actively exploited (CISA KEV): " : ""}${name} ${version} has a known advisory (${ruleId}). Lockfile-level finding: it does not prove the vulnerable code runs. SLA: ${sla}.`;
    results.push({
      ruleId,
      ruleIndex: index.get(ruleId)!,
      level: levelOf(kev, epss),
      message: { text },
      locations: [{ physicalLocation: { artifactLocation: { uri: manifestOf(ecosystem, dir) }, region: { startLine: 1 } } }],
      partialFingerprints: { "crypt/limb/v1": `crypt:${ecosystem}:${name}@${version}` },
      properties: {
        kev,
        epss,
        owner_team: teamOwners(l.owner),
        sla,
        sla_deadline: sla === "48 hours" ? new Date(t + 48 * 3600 * 1000).toISOString() : null,
        advisory_ids: advisories,
      },
    });
  }
  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: { driver: { name: "CRYPT", organization: "e-1305", version: PRODUCT_VERSION, rules: ruleList } },
        results,
        properties: { feeds_as_of: { kev: feedDate("kev"), epss: feedDate("epss") } },
      },
    ],
  };
}
