// Shared guards for agents: SEAL, audit and state. Fail-safe: anything unclear means no action.
import type { Io } from "./io.js";

export type AgentOutcome =
  | "REJECTED_SEALED"
  | "REJECTED_UNKNOWN_LIMB"
  | "PR_OPENED"
  | "PR_EXISTS"
  | "NO_FIX_AVAILABLE"
  | "REFUSED_NOT_SPAWNED"
  | "RAID_LIMIT"
  | "AWAITING_HUMAN_MERGE"
  | "GRAFT_REJECTED"
  | "HEALED"
  | "NO_ACTION"
  | "API_CALL"
  | "ERROR";

export const REJECTED_TEXT = "The graft was rejected. The creature remains.";

export interface AgentPaths {
  sealPath: string;
  auditPath: string;
  limbsPath: string;
  creaturePath: string;
  statePath: string;
  prsDir: string;
}

export function defaultPaths(cwd: string = process.cwd()): AgentPaths {
  const p = (...s: string[]) => [cwd, ...s].join("/");
  return {
    sealPath: p(".crypt-seal"),
    auditPath: p("crypt-audit.log"),
    limbsPath: p("out", "limbs.json"),
    creaturePath: p("out", "creature.json"),
    statePath: p("out", "state.json"),
    prsDir: p("out", "prs"),
  };
}

/** True when the seal exists or its state cannot be determined. */
export function isSealed(io: Io, sealPath: string): boolean {
  try {
    return io.pathState(sealPath) === "present";
  } catch {
    return true;
  }
}

export function audit(
  io: Io,
  auditPath: string,
  now: () => Date,
  command: string,
  limb: string,
  outcome: AgentOutcome,
  url = "-",
): void {
  io.appendLine(auditPath, [now().toISOString(), command, limb, outcome, url].join("\t"));
}

/** Audit that never throws: used on abort paths where nothing else may happen. */
export function tryAudit(...args: Parameters<typeof audit>): void {
  try {
    audit(...args);
  } catch {
    // nothing more can be done safely
  }
}

export const LIMB_ID = /^[A-Z]{1,32}$/;

/** The only authority for valid limb IDs is out/limbs.json. Returns null for unknown IDs or an unusable table. */
export function lookupLimb(io: Io, limbsPath: string, limb: string): { ecosystem: string; name: string; version: string } | null {
  try {
    if (!LIMB_ID.test(limb)) return null;
    const table: unknown = JSON.parse(io.readText(limbsPath));
    if (typeof table !== "object" || table === null || Array.isArray(table)) return null;
    if (!Object.prototype.hasOwnProperty.call(table, limb)) return null;
    const e = (table as Record<string, unknown>)[limb];
    if (typeof e !== "object" || e === null) return null;
    const { ecosystem, name, version } = e as Record<string, unknown>;
    if (typeof ecosystem !== "string" || typeof name !== "string" || typeof version !== "string") return null;
    return { ecosystem, name, version };
  } catch {
    return null;
  }
}

export interface LimbStateEntry {
  state: "awaiting-human-merge" | "healed";
  pr: string;
  updatedAt: string;
  ecosystem?: string;
  name?: string;
  from?: string;
  to?: string;
  /** Login of the human who landed it. Praise only. */
  healedBy?: string;
}

export interface State {
  schemaVersion: 1;
  limbs: Record<string, LimbStateEntry>;
}

/** Absent file: empty state. Present but unreadable or invalid: throws (caller changes nothing). */
export function readState(io: Io, statePath: string): State {
  if (io.pathState(statePath) === "absent") return { schemaVersion: 1, limbs: {} };
  const s: unknown = JSON.parse(io.readText(statePath));
  if (typeof s !== "object" || s === null || (s as State).schemaVersion !== 1) throw new Error("invalid state.json");
  const limbs = (s as State).limbs;
  if (typeof limbs !== "object" || limbs === null || Array.isArray(limbs)) throw new Error("invalid state.json");
  return s as State;
}

export function serializeState(s: State): string {
  const limbs = Object.fromEntries(Object.keys(s.limbs).sort().map((k) => [k, s.limbs[k]]));
  return JSON.stringify({ schemaVersion: 1, limbs }, null, 2) + "\n";
}

/** Record of one opened PR, in out/prs/<branch with / replaced by ->.json. */
export interface PrRecord {
  branch: string;
  limb: string;
  ecosystem: string;
  name: string;
  from: string;
  to: string;
  breaking: boolean;
  number: number;
  url: string;
  headSha?: string;
  sabotage?: boolean;
  [k: string]: unknown;
}

/** Real PR records only. Records of rejected grafts are archived in out/prs/rejected/ and not read. */
export function readPrRecords(io: Io, prsDir: string): PrRecord[] {
  const out: PrRecord[] = [];
  for (const f of io.listDir(prsDir)) {
    if (!f.endsWith(".json")) continue;
    const r: unknown = JSON.parse(io.readText(`${prsDir}/${f}`));
    if (typeof r !== "object" || r === null) throw new Error(`invalid PR record ${f}`);
    const x = r as Record<string, unknown>;
    if (x.dryRun === true) continue; // dry-run payloads are not PRs
    if (typeof x.branch !== "string" || typeof x.limb !== "string" || typeof x.name !== "string") throw new Error(`invalid PR record ${f}`);
    out.push(x as unknown as PrRecord);
  }
  return out;
}

export function branchFile(branch: string): string {
  return branch.replace(/\//g, "-") + ".json";
}
