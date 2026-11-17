import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { numRuns } from "./runs.js";
import { readFileSync } from "node:fs";
import { nodeIo } from "../src/common/io.js";
import { applyHealed, reraise } from "../src/reraise/index.js";
import { generate } from "../src/raise/generate.js";
import { makeAgentEnv, mockClient, type MockOpts } from "./agent-helpers.js";

function setup(opts: MockOpts, names = ["alpha", "beta"]) {
  const env = makeAgentEnv(names.map((name) => ({ name, version: "1.0.0", fixed: "1.0.1" })));
  names.forEach((n, i) => env.writeRecord(env.idOf(n), n, 10 + i));
  const m = mockClient(opts);
  const ctx = { ...env.paths, io: nodeIo, client: m.client, now: env.now };
  return { env, m, ctx };
}

const creatureOf = (env: ReturnType<typeof makeAgentEnv>) => JSON.parse(readFileSync(env.paths.creaturePath, "utf8"));

describe("reraise", () => {
  it("marks landed PRs healed, and the healed limb no longer spawns", async () => {
    const { env, ctx } = setup({ prState: (r) => ({ open: false, landed: r.number === 10 }) });
    const alpha = env.idOf("alpha");
    const r = await reraise(ctx);
    expect(r).toMatchObject({ outcome: "OK", healed: [alpha], creatureChanged: true });
    expect(JSON.parse(env.stateText()!).limbs[alpha]).toMatchObject({ state: "healed", name: "alpha", to: "1.0.1" });
    const creature = creatureOf(env);
    expect(creature.limbs.find((l: any) => l.name === "alpha")).toMatchObject({ state: "Healthy", spawned: false, version: "1.0.1" });
    expect(creature.counts.spawned).toBe(1);
    const regenerated = Object.values(generate(creature).limbs).map((l) => l.name);
    expect(regenerated).toEqual(["beta"]);
    expect(env.outcomes()).toEqual(["HEALED"]);
    env.cleanup();
  });
  it("is idempotent and asks no more about healed PRs", async () => {
    const { env, ctx, m } = setup({ prState: () => ({ open: false, landed: true }) });
    await reraise(ctx);
    const state = env.stateText();
    const before = m.calls.length;
    const r = await reraise(ctx);
    expect(r).toMatchObject({ outcome: "OK", healed: [], creatureChanged: false });
    expect(m.calls.length).toBe(before);
    expect(env.stateText()).toBe(state);
    env.cleanup();
  });
  it("nothing landed: no state file", async () => {
    const { env, ctx } = setup({});
    expect((await reraise(ctx)).healed).toEqual([]);
    expect(env.stateText()).toBeNull();
    env.cleanup();
  });
  it("applyHealed heals only the limb version that the PR fixed", () => {
    const c = { limbs: [
      { ecosystem: "npm", name: "a", version: "1.0.0", state: "Rotting", spawned: true },
      { ecosystem: "npm", name: "a", version: "2.0.0", state: "Rotting", spawned: true },
    ] };
    const r = applyHealed(c, [{ ecosystem: "npm", name: "a", from: "1.0.0", to: "1.0.1" }]) as any;
    expect(r.limbs.map((l: any) => l.state)).toEqual(["Healthy", "Rotting"]);
  });
  it("ignores dry-run records, so a stale payload cannot abort the run", async () => {
    const { env, ctx, m } = setup({ prState: () => ({ open: false, landed: false }) });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${env.paths.prsDir}/crypt-graft-zzz-1.json`, JSON.stringify({ dryRun: true, branch: "b", limb: "ZZZ", name: "z", number: 0, url: "-" }));
    expect((await reraise(ctx)).outcome).toBe("OK");
    expect(m.calls).toHaveLength(2);
    env.cleanup();
  });
  it("applyHealed is pure and recomputes counts", () => {
    const c = { counts: { spawned: 1 }, limbs: [{ ecosystem: "npm", name: "a", version: "1.0.0", state: "Rotting", spawned: true }] };
    const copy = JSON.stringify(c);
    const r = applyHealed(c, [{ ecosystem: "npm", name: "a", to: "1.0.1" }]) as any;
    expect(JSON.stringify(c)).toBe(copy);
    expect(r.counts).toMatchObject({ spawned: 0, healthy: 1, rotting: 0 });
  });
});

describe("reraise properties", () => {
  it("property: any API error leaves state.json and creature.json byte-identical", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 1 }), fc.boolean(), async (failAt, firstLanded) => {
        let n = 0;
        const { env, ctx } = setup({
          prState: () => {
            if (n++ === failAt) throw new Error("boom");
            return { open: false, landed: firstLanded };
          },
        });
        const stateBefore = env.stateText();
        const creatureBefore = readFileSync(env.paths.creaturePath, "utf8");
        const r = await reraise(ctx);
        const same = r.outcome === "ERROR" && env.stateText() === stateBefore && readFileSync(env.paths.creaturePath, "utf8") === creatureBefore;
        env.cleanup();
        return same;
      }),
      { numRuns: numRuns(30) },
    );
  });
  it("property: after SEAL zero API calls and no change", async () => {
    const { env, ctx, m } = setup({ prState: () => ({ open: false, landed: true }) });
    env.seal();
    const creatureBefore = readFileSync(env.paths.creaturePath, "utf8");
    await fc.assert(
      fc.asyncProperty(fc.integer(), async () => {
        const r = await reraise(ctx);
        return r.outcome === "REJECTED_SEALED" && m.calls.length === 0 && env.stateText() === null && readFileSync(env.paths.creaturePath, "utf8") === creatureBefore;
      }),
      { numRuns: numRuns(20) },
    );
    env.cleanup();
  });
  it("property: only getPullRequestState is called (no merge-like call)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (landed) => {
        const { env, ctx, m } = setup({ prState: () => ({ open: false, landed }) });
        await reraise(ctx);
        const ok = m.calls.every((c) => c === "getPullRequestState");
        env.cleanup();
        return ok;
      }),
      { numRuns: numRuns(20) },
    );
  });
});
