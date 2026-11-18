import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { numRuns } from "./runs.js";
import { readFileSync, writeFileSync } from "node:fs";
import { renderPlate } from "../src/render/plate.js";
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

describe("issue #141: reraise after a re-exhume", () => {
  const lodash = (version: string, extra: Record<string, unknown> = {}) => ({
    ecosystem: "npm", name: "lodash", version, state: "Healthy", rank: 1, spawned: false, ...extra,
  });

  it("graft, human merge, re-exhume (lodash 4.18.1), reraise: the plate shows HEALED 1", async () => {
    const env = makeAgentEnv([{ name: "lodash", version: "4.17.15", fixed: "4.18.1" }]);
    env.writeRecord(env.idOf("lodash"), "lodash", 10, "4.18.1");
    const m = mockClient({ prState: () => ({ open: false, landed: true, landedBy: "octo-cat" }) });
    const ctx = { ...env.paths, io: nodeIo, client: m.client, now: env.now };
    // The later graft run re-exhumed the merged repo: lodash is already 4.18.1 and is not a finding.
    const creature = creatureOf(env);
    creature.limbs[0] = { ...creature.limbs[0], version: "4.18.1", state: "Healthy", spawned: false, kev: false, vulns: [] };
    writeFileSync(env.paths.creaturePath, JSON.stringify(creature));
    const r = await reraise(ctx);
    expect(r.healed).toHaveLength(1);
    const after = creatureOf(env);
    expect(after.limbs[0]).toMatchObject({ version: "4.18.1", state: "Healthy", healed: true, healedBy: "octo-cat" });
    const plate = renderPlate(after);
    expect(plate).toContain("HEALED 1");
    expect(plate).toContain("HEALTHY 0");
    env.cleanup();
  });

  it("plate counts a healed limb even without healedBy", () => {
    const c = applyHealed({ limbs: [lodash("4.18.1")] }, [{ ecosystem: "npm", name: "lodash", from: "4.17.15", to: "4.18.1" }]);
    expect(renderPlate(c)).toContain("HEALED 1");
  });

  it("a later different version is not healed by this PR", () => {
    const c = { limbs: [lodash("4.19.0")] };
    const r = applyHealed(c, [{ ecosystem: "npm", name: "lodash", from: "4.17.15", to: "4.18.1" }]) as any;
    expect(r.limbs[0]).toEqual(c.limbs[0]);
  });

  it("property: a limb matches iff its version is from or to; counts stay consistent", () => {
    const ver = fc.constantFrom("1.0.0", "1.0.1", "2.0.0", "3.0.0");
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: fc.constantFrom("a", "b"), version: ver, state: fc.constantFrom("Rotting", "Possessed", "Healthy") }), { maxLength: 8 }),
        fc.constantFrom("a", "b"), ver, ver,
        (ls, name, from, to) => {
          const limbs = ls.map((l) => ({ ecosystem: "npm", ...l, spawned: l.state !== "Healthy" }));
          const r = applyHealed({ limbs }, [{ ecosystem: "npm", name, from, to }]) as any;
          r.limbs.forEach((l: any, i: number) => {
            const o = limbs[i]!;
            const hit = o.name === name && (o.version === from || o.version === to);
            if (hit) expect(l).toMatchObject({ state: "Healthy", healed: true, spawned: false, version: to });
            else expect(l).toEqual(o);
          });
          const n = (f: (l: any) => boolean) => r.limbs.filter(f).length;
          expect(r.counts).toMatchObject({
            spawned: n((l) => l.spawned === true), healthy: n((l) => l.state === "Healthy"),
            rotting: n((l) => l.state === "Rotting"), possessed: n((l) => l.state === "Possessed"),
          });
        },
      ),
      { numRuns: numRuns(100) },
    );
  });
});
