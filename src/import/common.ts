// Shared helpers for the adapters. Pure: no fs, no network.
import { normalizePypiName } from "../exhume/lockfile.js";
import { type Limb, type OsvVuln, UNKNOWN_VERSION, cmp } from "../exhume/types.js";
import { parsePurl } from "./purl.js";
import { ImportError, type ImportedLimb, type RawFinding } from "./types.js";

const MAX_NAME = 200;
const MAX_VERSION = 100;
const ID = /^(?:CVE-\d{4}-\d{4,}|GHSA(?:-[23456789cfghjmpqrvwx]{4}){3})$/i;

export function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.flatMap((x) => (typeof x === "string" && x.trim() !== "" ? [x.trim()] : [])) : [];
}

/** Vendor severity label for display. Anything outside LOW, MEDIUM, HIGH, CRITICAL is dropped. */
export function normalizeSeverity(label: unknown): string | null {
  if (typeof label !== "string") return null;
  const u = label.trim().toUpperCase();
  const m = u === "MODERATE" ? "MEDIUM" : u;
  return m === "LOW" || m === "MEDIUM" || m === "HIGH" || m === "CRITICAL" ? m : null;
}

/** CVSS base score to a label. */
export function severityFromScore(score: unknown): string | null {
  const n = typeof score === "number" ? score : typeof score === "string" && /^\d+(\.\d+)?$/.test(score) ? Number(score) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 10) return null;
  return n >= 9 ? "CRITICAL" : n >= 7 ? "HIGH" : n >= 4 ? "MEDIUM" : "LOW";
}

/** CVE and GHSA ids found in the given texts, upper-cased. */
export function advisoryIds(...texts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) for (const m of (t ?? "").matchAll(/CVE-\d{4}-\d{4,}|GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}/gi)) out.add(m[0].toUpperCase());
  return [...out].sort(cmp);
}

export function isAdvisoryId(s: string): boolean {
  return ID.test(s);
}

/** Builds one OsvVuln. Returns null when there is no usable id (a malformed entry). */
export function vuln(id: unknown, aliases: string[], severity: string | null): OsvVuln | null {
  const i = str(id);
  if (i === null || i.length > 100 || /\s/.test(i)) return null;
  const main = ID.test(i) ? i.toUpperCase() : i;
  const al = [...new Set(aliases.map((a) => a.trim().toUpperCase()).filter((a) => a !== "" && a.length <= 100 && a !== main.toUpperCase()))].sort(cmp);
  return { id: main, aliases: al, severity };
}

function clean(s: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}

/** Maps a tool ecosystem or purl type to ours, or null when we do not model it. */
export function mapEcosystem(e: string | null): "npm" | "PyPI" | null {
  const u = (e ?? "").trim().toLowerCase();
  if (["npm", "node-pkg", "node", "javascript", "yarn", "pnpm", "yarn-pkg"].includes(u)) return "npm";
  if (["pypi", "pip", "pipenv", "poetry", "python", "python-pkg", "uv"].includes(u)) return "PyPI";
  return null;
}

/** Package fields from a purl, with explicit fields as fallback. */
export function fromPurl(purl: unknown): { ecosystem: string | null; name: string | null; version: string | null } | null {
  const p = parsePurl(purl);
  return p === null ? null : { ecosystem: p.type, name: p.name, version: p.version };
}

/**
 * Maps one raw finding to a limb. A problem with the package identity (no name, no version,
 * unsupported ecosystem) gives version "unknown", so rankLimbs reports unknown. It is never Healthy.
 */
export function toImported(raw: RawFinding, manifest: string): ImportedLimb {
  const eco = mapEcosystem(raw.ecosystem);
  const name = raw.name === null ? null : clean(raw.name, MAX_NAME);
  const version = raw.version === null ? null : clean(raw.version, MAX_VERSION);
  let limb: Limb;
  if (name === null || name === "") {
    limb = { ecosystem: "npm", name: `unidentified/${clean(raw.label, 80) || "finding"}`, version: UNKNOWN_VERSION, direct: false, manifest };
  } else if (eco === null) {
    const prefix = clean(raw.ecosystem ?? "unknown-ecosystem", 40) || "unknown-ecosystem";
    limb = { ecosystem: "npm", name: `${prefix}:${name}`, version: UNKNOWN_VERSION, direct: false, manifest };
  } else {
    const ok = version !== null && version !== "" && !/\s/.test(version) && version !== UNKNOWN_VERSION;
    limb = { ecosystem: eco, name: eco === "PyPI" ? normalizePypiName(name) : name, version: ok ? version : UNKNOWN_VERSION, direct: false, manifest };
  }
  return { limb, vulns: raw.vulnsOk ? raw.vulns : undefined };
}

export function requireArray(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new ImportError(what);
  return v;
}
