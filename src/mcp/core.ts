// Pure handlers for the CRYPT MCP server. No SDK, no network, no git, no environment access.
// Writes go only through the game's path: grammar, then the watcher (seal check, limbs.json, request file, audit).
// Outputs are built from explicit field allowlists (blameless) and never carry tokens.
import { join } from "node:path";
import { parseCommand } from "../bridge/grammar.js";
import { createWatcher, type Ctx, type Watcher } from "../bridge/watch.js";

export interface McpPaths {
  creaturePath: string;
  censusPath: string;
}

export function defaultMcpPaths(cwd: string = process.cwd()): McpPaths {
  return {
    creaturePath: join(cwd, "out", "creature.json"),
    censusPath: join(cwd, "docs", "census", "RESULTS.md"),
  };
}

export interface ToolResult {
  ok: boolean;
  text: string;
}

const fail = (text: string): ToolResult => ({ ok: false, text });

const TOKEN_PATTERNS: RegExp[] = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{8,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\b(?:xox[abprs]|AKIA|AIza)[A-Za-z0-9_-]{8,}/g,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /[A-Za-z0-9+/_-]{40,}={0,2}/g,
];

/** Replaces token-looking strings with [redacted]. */
export function redact(text: string): string {
  let out = text;
  for (const re of TOKEN_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

const CVE_ID = /^CVE-\d{4}-\d{4,}$/;

interface LimbView {
  id: string;
  name: string;
  ecosystem: string;
  version: string;
  state: string;
  cves: string[];
  kev: boolean | null;
  epss: number | null;
  owner: string | null;
  spawned: boolean | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function loadLimbs(ctx: Ctx, paths: McpPaths): LimbView[] {
  const table: unknown = JSON.parse(ctx.fs.readText(ctx.limbsPath));
  if (typeof table !== "object" || table === null || Array.isArray(table)) throw new Error("invalid limbs.json");
  const creature: unknown = JSON.parse(ctx.fs.readText(paths.creaturePath));
  const list = (creature as { limbs?: unknown } | null)?.limbs;
  if (!Array.isArray(list)) throw new Error("invalid creature.json");
  const byKey = new Map<string, Record<string, unknown>>();
  for (const l of list) {
    if (typeof l !== "object" || l === null) continue;
    const r = l as Record<string, unknown>;
    byKey.set(`${String(r.ecosystem)}:${String(r.name)}@${String(r.version)}`, r);
  }
  const out: LimbView[] = [];
  for (const id of Object.keys(table).sort()) {
    const ref = (table as Record<string, Record<string, unknown>>)[id];
    const r = byKey.get(`${String(ref?.ecosystem)}:${String(ref?.name)}@${String(ref?.version)}`);
    if (!r) continue;
    const cves = new Set<string>();
    if (Array.isArray(r.vulns)) {
      for (const v of r.vulns) {
        const c = (v as { cves?: unknown } | null)?.cves;
        if (Array.isArray(c)) for (const x of c) if (typeof x === "string" && CVE_ID.test(x)) cves.add(x);
      }
    }
    out.push({
      id,
      name: String(r.name),
      ecosystem: String(r.ecosystem),
      version: String(r.version),
      state: str(r.state) ?? "Unknown",
      cves: [...cves].sort(),
      kev: typeof r.kev === "boolean" ? r.kev : null,
      epss: typeof r.epss === "number" ? r.epss : null,
      owner: str(r.owner),
      spawned: typeof r.spawned === "boolean" ? r.spawned : null,
    });
  }
  return out;
}

export interface Core {
  listLimbs(): ToolResult;
  getLimb(id: string): ToolResult;
  censusSummary(): ToolResult;
  auditTail(n: number): ToolResult;
  requestGraft(limbId: string): ToolResult;
  seal(): ToolResult;
}

export function createCore(ctx: Ctx, paths: McpPaths): Core {
  const watcher: Watcher = createWatcher(ctx); // one watcher: request numbers keep counting

  function auditLines(): string[] {
    if (ctx.fs.pathState(ctx.auditPath) === "absent") return [];
    return ctx.fs.readText(ctx.auditPath).split("\n").filter((l) => l !== "");
  }

  /** Runs a marker through the watcher and reports the outcome from the audit lines it added. */
  function act(marker: string): string[] {
    const before = auditLines().length;
    watcher.processText(marker);
    return auditLines().slice(before).map((l) => l.split("\t")[3] ?? "ERROR");
  }

  return {
    listLimbs() {
      try {
        return { ok: true, text: JSON.stringify(loadLimbs(ctx, paths), null, 2) };
      } catch {
        return fail("The creature is not available. Run exhume and raise first.");
      }
    },
    getLimb(id) {
      try {
        const limb = loadLimbs(ctx, paths).find((l) => l.id === id);
        return limb ? { ok: true, text: JSON.stringify(limb, null, 2) } : fail("Unknown limb ID.");
      } catch {
        return fail("The creature is not available. Run exhume and raise first.");
      }
    },
    censusSummary() {
      try {
        if (ctx.fs.pathState(paths.censusPath) === "absent") return { ok: true, text: "Census summary not available: docs/census/RESULTS.md is absent." };
        return { ok: true, text: redact(ctx.fs.readText(paths.censusPath)) };
      } catch {
        return fail("Census summary not available.");
      }
    },
    auditTail(n) {
      try {
        const k = Number.isFinite(n) ? Math.min(100, Math.max(1, Math.trunc(n))) : 10;
        return { ok: true, text: redact(auditLines().slice(-k).join("\n")) };
      } catch {
        return fail("The audit log is not available.");
      }
    },
    requestGraft(limbId) {
      try {
        const cmd = parseCommand("GRAFT " + String(limbId));
        if (!cmd.ok || cmd.verb !== "GRAFT") return fail("The graft was rejected. The creature remains.");
        const outcomes = act(`[[CRYPT GRAFT ${cmd.limb}]]`);
        if (outcomes.length === 1 && outcomes[0] === "REQUEST_WRITTEN") {
          return { ok: true, text: `Graft requested for ${cmd.limb}. A human lands the fix.` };
        }
        return fail("The graft was rejected. The creature remains.");
      } catch {
        return fail("The graft was rejected. The creature remains.");
      }
    },
    seal() {
      try {
        const outcomes = act("[[CRYPT SEAL]]");
        return outcomes.length === 1 && outcomes[0] === "SEALED"
          ? { ok: true, text: "The crypt is sealed. No graft will be requested." }
          : fail("The seal could not be confirmed.");
      } catch {
        return fail("The seal could not be confirmed.");
      }
    },
  };
}
