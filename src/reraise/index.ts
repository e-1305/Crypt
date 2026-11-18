// Re-raise: learn which graft PRs a human landed, mark those limbs healed, and rebuild the creature without them.
// Fail-safe: any API error changes nothing; SEAL aborts before any call.
import type { Io } from "../common/io.js";
import {
  audit,
  isSealed,
  readPrRecords,
  readState,
  serializeState,
  tryAudit,
  type AgentPaths,
} from "../common/agent.js";
import { safeLogin } from "../common/creature-status.js";
import type { GithubClient } from "../github/client.js";

export interface ReraiseCtx extends AgentPaths {
  io: Io;
  client: GithubClient;
  now: () => Date;
}

export interface ReraiseResult {
  outcome: "OK" | "REJECTED_SEALED" | "ERROR";
  healed: string[];
  creatureChanged: boolean;
}

interface HealedRef {
  ecosystem: string;
  name: string;
  from?: string;
  to: string;
  /** Praise only: the login of the human who landed it. */
  healedBy?: string;
}

/** Pure: healed limbs become Healthy and do not spawn. Counts that depend on those fields are recomputed. */
export function applyHealed(creature: Record<string, unknown>, healed: HealedRef[]): Record<string, unknown> {
  const limbs = (Array.isArray(creature.limbs) ? creature.limbs : []).map((l: Record<string, unknown>) => {
    const h = healed.find((x) => x.ecosystem === l.ecosystem && x.name === l.name && (x.from === undefined || x.from === l.version || x.to === l.version));
    if (!h) return l;
    // The awaiting status and the CI record end with the heal. healedBy is praise and is kept only when clean.
    const { status: _s, ciVerdict: _v, ciPr: _p, healedBy: _b, ...rest } = l;
    const by = safeLogin(h.healedBy);
    return { ...rest, version: h.to, state: "Healthy", healed: true, spawned: false, kev: false, vulns: [], ...(by ? { healedBy: by } : {}) };
  });
  const count = (f: (l: Record<string, unknown>) => boolean) => limbs.filter(f).length;
  const counts = {
    ...(typeof creature.counts === "object" && creature.counts !== null ? (creature.counts as object) : {}),
    spawned: count((l) => l.spawned === true),
    possessed: count((l) => l.state === "Possessed"),
    rotting: count((l) => l.state === "Rotting"),
    healthy: count((l) => l.state === "Healthy"),
  };
  return { ...creature, counts, limbs };
}

export async function reraise(ctx: ReraiseCtx): Promise<ReraiseResult> {
  const { io } = ctx;
  const fail: ReraiseResult = { outcome: "ERROR", healed: [], creatureChanged: false };
  try {
    if (isSealed(io, ctx.sealPath)) {
      tryAudit(io, ctx.auditPath, ctx.now, "RERAISE", "-", "REJECTED_SEALED");
      return { ...fail, outcome: "REJECTED_SEALED" };
    }
    const state = readState(io, ctx.statePath);
    const records = readPrRecords(io, ctx.prsDir);
    // Collect first: one failed call aborts everything before any write.
    const landed: { r: (typeof records)[number]; by: string }[] = [];
    for (const r of records) {
      if (state.limbs[r.limb]?.state === "healed") continue;
      const s = await ctx.client.getPullRequestState({ number: r.number, branch: r.branch });
      if (s.landed === true) landed.push({ r, by: safeLogin(s.landedBy) });
    }
    const before = io.pathState(ctx.statePath) === "present" ? io.readText(ctx.statePath) : null;
    if (landed.length > 0) {
      for (const { r, by } of landed) {
        state.limbs[r.limb] = {
          state: "healed",
          pr: r.branch,
          updatedAt: ctx.now().toISOString(),
          ecosystem: r.ecosystem,
          name: r.name,
          from: r.from,
          to: r.to,
          ...(by ? { healedBy: by } : {}),
        };
      }
      io.writeText(ctx.statePath, serializeState(state));
    }
    try {
      for (const { r } of landed) audit(io, ctx.auditPath, ctx.now, "RERAISE", r.limb, "HEALED", r.url);
    } catch (e) {
      if (before === null) io.remove(ctx.statePath);
      else io.writeText(ctx.statePath, before);
      throw e;
    }
    const healedRefs: HealedRef[] = Object.values(state.limbs)
      .filter((e) => e.state === "healed" && e.ecosystem && e.name && e.to)
      .map((e) => ({ ecosystem: e.ecosystem!, name: e.name!, from: e.from, to: e.to!, healedBy: e.healedBy }));
    const raw = io.readText(ctx.creaturePath);
    const next = JSON.stringify(applyHealed(JSON.parse(raw), healedRefs), null, 2) + "\n";
    const changed = next !== raw;
    if (changed) io.writeText(ctx.creaturePath, next);
    return { outcome: "OK", healed: landed.map((x) => x.r.limb), creatureChanged: changed };
  } catch (e) {
    process.stderr.write(`reraise: ${(e as Error).message}\n`);
    tryAudit(io, ctx.auditPath, ctx.now, "RERAISE", "-", "ERROR");
    return fail;
  }
}
