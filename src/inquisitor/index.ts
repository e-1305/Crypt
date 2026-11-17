// Inquisitor: checks CI of a graft PR. It reads and records; it never edits code and never lands a PR.
// Fail-safe: an API error changes nothing and writes no state. Red, timeout or no CI leaves the limb Rotting.
import type { Io } from "../common/io.js";
import {
  audit,
  branchFile,
  isSealed,
  lookupLimb,
  readPrRecords,
  readState,
  serializeState,
  tryAudit,
  REJECTED_TEXT,
  type AgentOutcome,
  type AgentPaths,
} from "../common/agent.js";
import type { GithubClient } from "../github/client.js";

export interface InquisitorCtx extends AgentPaths {
  io: Io;
  client: GithubClient;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  maxAttempts: number;
  intervalMs: number;
}

export interface VerifyResult {
  outcome: AgentOutcome;
  message?: string;
}

/** green: all completed and successful. red: something failed. pending: nothing yet or still running. */
export function judge(runs: { status: string; conclusion: string | null }[]): "green" | "red" | "pending" {
  if (runs.some((r) => r.status === "completed" && r.conclusion !== "success")) return "red";
  if (runs.length === 0 || runs.some((r) => r.status !== "completed")) return "pending";
  return "green";
}

export async function verify(ctx: InquisitorCtx, limb: string): Promise<VerifyResult> {
  const { io } = ctx;
  const command = `VERIFY ${limb}`.slice(0, 64);
  const log = (outcome: AgentOutcome, url = "-") => audit(io, ctx.auditPath, ctx.now, command, limb, outcome, url);
  try {
    if (isSealed(io, ctx.sealPath)) {
      tryAudit(io, ctx.auditPath, ctx.now, command, limb, "REJECTED_SEALED");
      return { outcome: "REJECTED_SEALED" };
    }
    if (!lookupLimb(io, ctx.limbsPath, limb)) {
      log("REJECTED_UNKNOWN_LIMB");
      return { outcome: "REJECTED_UNKNOWN_LIMB" };
    }
    const rec = readPrRecords(io, ctx.prsDir).find((r) => r.limb === limb);
    if (!rec) {
      log("NO_ACTION");
      return { outcome: "NO_ACTION" };
    }
    const state = readState(io, ctx.statePath); // unreadable state: throw, change nothing
    let verdict: "green" | "red" | "pending" = "pending";
    let previous: string | null = null; // green needs the same completed set on two polls in a row
    for (let i = 0; i < ctx.maxAttempts; i++) {
      const runs = await ctx.client.getCheckRuns(typeof rec.headSha === "string" ? rec.headSha : rec.branch);
      const v = judge(runs);
      if (v === "red") {
        verdict = "red";
        break;
      }
      const key = v === "green" ? JSON.stringify(runs.map((r) => r.name).sort()) : null;
      if (key !== null && key === previous) {
        verdict = "green";
        break;
      }
      previous = key;
      if (i < ctx.maxAttempts - 1) await ctx.sleep(ctx.intervalMs);
    }
    if (verdict !== "green") {
      log("GRAFT_REJECTED", rec.url);
      if (verdict === "red") {
        // Free the limb for a second attempt. A pending timeout keeps its record: the PR may still turn green.
        const file = branchFile(rec.branch);
        io.mkdirp(`${ctx.prsDir}/rejected`);
        io.writeText(`${ctx.prsDir}/rejected/${file}`, io.readText(`${ctx.prsDir}/${file}`));
        io.remove(`${ctx.prsDir}/${file}`);
      }
      return { outcome: "GRAFT_REJECTED", message: REJECTED_TEXT };
    }
    const current = state.limbs[limb];
    if (current) {
      log("NO_ACTION", rec.url); // already awaiting or healed: no transition
      return { outcome: "NO_ACTION" };
    }
    const before = io.pathState(ctx.statePath) === "present" ? io.readText(ctx.statePath) : null;
    state.limbs[limb] = { state: "awaiting-human-merge", pr: rec.branch, updatedAt: ctx.now().toISOString() };
    io.writeText(ctx.statePath, serializeState(state));
    try {
      log("AWAITING_HUMAN_MERGE", rec.url);
    } catch (e) {
      if (before === null) io.remove(ctx.statePath);
      else io.writeText(ctx.statePath, before); // an unaudited transition must not stand
      throw e;
    }
    return { outcome: "AWAITING_HUMAN_MERGE" };
  } catch (e) {
    process.stderr.write(`inquisitor: ${(e as Error).message}\n`);
    tryAudit(io, ctx.auditPath, ctx.now, command, limb, "ERROR");
    return { outcome: "ERROR" };
  }
}
