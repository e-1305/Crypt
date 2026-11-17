import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { REJECTED_TEXT } from "../src/common/agent.js";
import { nodeIo } from "../src/common/io.js";
import { judge, verify, type InquisitorCtx } from "../src/inquisitor/index.js";
import type { CheckRun } from "../src/github/client.js";
import { makeAgentEnv, mockClient, type MockOpts } from "./agent-helpers.js";

const run = (status: string, conclusion: string | null): CheckRun => ({ name: "ci", status, conclusion });

function setup(opts: MockOpts, maxAttempts = 3) {
  const env = makeAgentEnv();
  const limb = env.idOf("alpha");
  env.writeRecord(limb, "alpha", 7);
  const m = mockClient(opts);
  const sleeps: number[] = [];
  const ctx: InquisitorCtx = {
    ...env.paths,
    io: nodeIo,
    client: m.client,
    now: env.now,
    sleep: async (ms) => void sleeps.push(ms),
    maxAttempts,
    intervalMs: 10,
  };
  return { env, limb, m, ctx, sleeps };
}

describe("judge", () => {
  it("is green only when runs exist and all completed successfully", () => {
    expect(judge([])).toBe("pending");
    expect(judge([run("completed", "success")])).toBe("green");
    expect(judge([run("completed", "success"), run("in_progress", null)])).toBe("pending");
    for (const c of ["failure", "timed_out", "cancelled", "neutral", "skipped", "action_required", null]) {
      expect(judge([run("completed", c), run("in_progress", null)])).toBe("red");
    }
  });
});

describe("inquisitor", () => {
  it("green: the limb awaits a human, state written once, audited", async () => {
    const { env, limb, ctx } = setup({ checkRuns: () => [run("completed", "success")] });
    expect((await verify(ctx, limb)).outcome).toBe("AWAITING_HUMAN_MERGE");
    const s = JSON.parse(env.stateText()!);
    expect(s.limbs[limb]).toMatchObject({ state: "awaiting-human-merge", pr: "crypt/graft-alpha-1.0.1" });
    expect(env.outcomes()).toEqual(["AWAITING_HUMAN_MERGE"]);
    env.cleanup();
  });
  it("polls while pending, then goes green", async () => {
    let n = 0;
    const { env, limb, ctx, sleeps, m } = setup({ checkRuns: () => (++n < 3 ? [run("in_progress", null)] : [run("completed", "success")]) });
    expect((await verify(ctx, limb)).outcome).toBe("AWAITING_HUMAN_MERGE");
    expect(sleeps).toEqual([10, 10]);
    expect(m.calls).toEqual(["getCheckRuns", "getCheckRuns", "getCheckRuns"]);
    env.cleanup();
  });
  it("red, timeout and no CI: GRAFT_REJECTED, limb stays Rotting, no state file", async () => {
    for (const runs of [[run("completed", "failure")], [run("completed", "timed_out")], [run("in_progress", null)], []]) {
      const { env, limb, ctx } = setup({ checkRuns: () => runs });
      const r = await verify(ctx, limb);
      expect(r).toEqual({ outcome: "GRAFT_REJECTED", message: REJECTED_TEXT });
      expect(REJECTED_TEXT).toBe("The graft was rejected. The creature remains.");
      expect(env.stateText()).toBeNull();
      expect(env.outcomes()).toEqual(["GRAFT_REJECTED"]);
      env.cleanup();
    }
  });
  it("an API error changes nothing and writes no state", async () => {
    const { env, limb, ctx } = setup({ failOn: "getCheckRuns" });
    expect((await verify(ctx, limb)).outcome).toBe("ERROR");
    expect(env.stateText()).toBeNull();
    env.cleanup();
  });
  it("unknown limb: no API call", async () => {
    const { env, ctx, m } = setup({});
    expect((await verify(ctx, "NOPE")).outcome).toBe("REJECTED_UNKNOWN_LIMB");
    expect(m.calls).toEqual([]);
    env.cleanup();
  });
  it("rolls the state back when the audit cannot be written", async () => {
    const { env, limb, ctx } = setup({ checkRuns: () => [run("completed", "success")] });
    const io = { ...nodeIo, appendLine: () => { throw new Error("disk"); } };
    expect((await verify({ ...ctx, io }, limb)).outcome).toBe("ERROR");
    expect(env.stateText()).toBeNull();
    env.cleanup();
  });
  it("a corrupt state file is left untouched", async () => {
    const { env, limb, ctx } = setup({ checkRuns: () => [run("completed", "success")] });
    env.writeState("{not json");
    expect((await verify(ctx, limb)).outcome).toBe("ERROR");
    expect(env.stateText()).toBe("{not json");
    env.cleanup();
  });
});

describe("inquisitor properties", () => {
  const conclusion = fc.constantFrom("success", "failure", "timed_out", "cancelled", "neutral", "skipped", null);
  const status = fc.constantFrom("queued", "in_progress", "completed");
  const runs = fc.array(fc.record({ name: fc.string(), status, conclusion }), { maxLength: 4 });

  it("property: any API or CI error leaves out/state.json byte-identical", async () => {
    const prior = fc.oneof(fc.constant(null), fc.constant('{\n  "schemaVersion": 1,\n  "limbs": {}\n}\n'));
    await fc.assert(
      fc.asyncProperty(prior, fc.array(runs, { minLength: 1, maxLength: 3 }), fc.boolean(), async (before, seq, throws) => {
        let i = 0;
        const { env, limb, ctx } = setup({
          checkRuns: () => {
            if (throws) throw new Error("boom");
            const r = seq[Math.min(i++, seq.length - 1)]!;
            // never fully green: errors and red results only
            return r.every((x) => x.status === "completed" && x.conclusion === "success") ? [...r, run("completed", "failure")] : r;
          },
        });
        if (before !== null) env.writeState(before);
        await verify(ctx, limb);
        const same = env.stateText() === before;
        env.cleanup();
        return same;
      }),
      { numRuns: 80 },
    );
  });

  it("property: after SEAL zero API calls for any input", async () => {
    const { env, ctx, m } = setup({});
    env.seal();
    await fc.assert(
      fc.asyncProperty(fc.string(), async (limb) => {
        const r = await verify(ctx, limb);
        return r.outcome === "REJECTED_SEALED" && m.calls.length === 0 && env.stateText() === null;
      }),
      { numRuns: 100 },
    );
    env.cleanup();
  });

  it("property: records no merge-like call and calls only getCheckRuns", async () => {
    await fc.assert(
      fc.asyncProperty(runs, async (r) => {
        const { env, limb, ctx, m } = setup({ checkRuns: () => r });
        await verify(ctx, limb);
        const ok = m.calls.every((c) => c === "getCheckRuns");
        env.cleanup();
        return ok;
      }),
      { numRuns: 50 },
    );
  });
});
