// After a live graft opened a pull request: say so, then let the Inquisitor watch the `test` check.
// The caller does not await this inside the dfrotz output loop; it tracks the returned promise.
import { branchFile, readPrRecords, REJECTED_TEXT, type AgentPaths } from "../../src/common/agent.js";
import type { Io } from "../../src/common/io.js";
import type { GithubClient } from "../../src/github/client.js";
import { verify } from "../../src/inquisitor/index.js";

export interface LiveGraftCtx extends AgentPaths {
  io: Io;
  client: GithubClient;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  intervalMs: number;
}

export const CHECK_NAME = "test";
/** Green needs the same result on two consecutive polls. */
export const MIN_ATTEMPTS = 2;

export async function handleLiveGraft(ctx: LiveGraftCtx, limb: string, branch: string, out: { write(s: string): unknown }): Promise<void> {
  let url = "";
  try {
    url = readPrRecords(ctx.io, ctx.prsDir).find((r) => r.branch === branch)?.url ?? "";
  } catch {
    // the Inquisitor reports unreadable records as ERROR
  }
  out.write(`Graft ${limb}: pull request opened ${url || branchFile(branch)}\n`);
  const maxAttempts = Math.max(MIN_ATTEMPTS, Math.ceil(ctx.timeoutMs / ctx.intervalMs));
  const r = await verify({ ...ctx, maxAttempts, requiredCheck: CHECK_NAME }, limb);
  if (r.outcome === "AWAITING_HUMAN_MERGE") out.write(`${limb}: awaiting a human to land the pull request\n`);
  else if (r.outcome === "GRAFT_REJECTED") out.write(`${REJECTED_TEXT}\n`);
  else if (r.outcome === "REJECTED_SEALED") out.write(`${limb}: the crypt is sealed, the Inquisitor stood down\n`);
  else if (r.outcome === "NO_ACTION") out.write(`${limb}: no change\n`);
  else out.write(`${limb}: ERROR while checking the pull request, nothing changed\n`);
}
