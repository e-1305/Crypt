// Issue #41 items 1-3: the pipeline records on creature.json limbs (ciVerdict, status, healedBy).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { numRuns } from "./runs.js";
import { nodeIo } from "../src/common/io.js";
import { patchLimb, safeLogin } from "../src/common/creature-status.js";
import { verify, type InquisitorCtx } from "../src/inquisitor/index.js";
import { applyHealed, reraise } from "../src/reraise/index.js";
import { plateInput } from "../src/render/plate.js";
import { markRed, type MemoryStore } from "../src/web/healed.js";
import { applyHealEvent, REJECTION_LINE } from "../src/theatre/heal-events.js";
import { countsForScore, praiseLines, teamScore, type RaidLimb } from "../src/theatre/raid.js";
import { makeAgentEnv, mockClient, type MockOpts } from "./agent-helpers.js";
import type { CheckRun } from "../src/github/client.js";

const run = (conclusion: string | null): CheckRun => ({ name: "test", status: conclusion === null ? "in_progress" : "completed", conclusion });

function setup(opts: MockOpts) {
  const env = makeAgentEnv();
  const limb = env.idOf("alpha");
  env.writeRecord(limb, "alpha", 7);
  const m = mockClient(opts);
  const ctx: InquisitorCtx = { ...env.paths, io: nodeIo, client: m.client, now: env.now, sleep: async () => {}, maxAttempts: 3, intervalMs: 1, requiredCheck: "test" };
  const creature = () => JSON.parse(readFileSync(env.paths.creaturePath, "utf8"));
  const alpha = () => creature().limbs.find((l: { name: string }) => l.name === "alpha");
  return { env, limb, m, ctx, creature, alpha };
}

describe("patchLimb and safeLogin", () => {
  it("patches only the matching limb and never changes its input", () => {
    const c = { limbs: [{ ecosystem: "npm", name: "a", version: "1", x: 1 }, { ecosystem: "npm", name: "b", version: "1" }] };
    const copy = JSON.stringify(c);
    const out = patchLimb(c, { ecosystem: "npm", name: "a", version: "1" }, { set: { y: 2 }, clear: ["x"] }) as typeof c;
    expect(out.limbs[0]).toEqual({ ecosystem: "npm", name: "a", version: "1", y: 2 });
    expect(out.limbs[1]).toEqual(c.limbs[1]);
    expect(JSON.stringify(c)).toBe(copy);
  });
  it("returns junk unchanged", () => {
    for (const j of [null, 3, "x", [], {}, { limbs: "no" }]) expect(patchLimb(j, { ecosystem: "npm", name: "a" }, { set: { y: 1 } })).toEqual(j);
  });
  it("property: a login is at most 39 characters of [A-Za-z0-9-]", () => {
    fc.assert(fc.property(fc.anything(), (x) => /^[A-Za-z0-9-]{0,39}$/.test(safeLogin(x))), { numRuns: numRuns(200) });
    fc.assert(fc.property(fc.string({ maxLength: 120 }), (s) => /^[A-Za-z0-9-]{0,39}$/.test(safeLogin(s))), { numRuns: numRuns(200) });
    expect(safeLogin("octo-cat")).toBe("octo-cat");
    expect(safeLogin("a b\n@c")).toBe("abc");
  });
});

describe("inquisitor records on creature.json", () => {
  it("green writes status awaiting-human-merge and the web score counts it", async () => {
    const { env, limb, ctx, alpha, creature } = setup({ checkRuns: () => [run("success")] });
    expect((await verify(ctx, limb)).outcome).toBe("AWAITING_HUMAN_MERGE");
    expect(alpha()).toMatchObject({ status: "awaiting-human-merge", state: "Rotting" });
    expect(alpha().ciVerdict).toBeUndefined();
    const web = plateInput(creature()).limbs as RaidLimb[];
    expect(countsForScore(web.find((l) => l.name === "alpha")!)).toBe(true);
    expect(teamScore(web)).toBeGreaterThan(0);
    env.cleanup();
  });
  it("red writes ciVerdict red and the PR number; a later green clears it", async () => {
    const checks: CheckRun[][] = [[run("failure")]];
    const { env, limb, ctx, alpha } = setup({ checkRuns: () => checks[0]! });
    expect((await verify(ctx, limb)).outcome).toBe("GRAFT_REJECTED");
    expect(alpha()).toMatchObject({ ciVerdict: "red", ciPr: 7 });
    expect(alpha().status).toBeUndefined();
    env.writeRecord(limb, "alpha", 8);
    checks[0] = [run("success")];
    expect((await verify(ctx, limb)).outcome).toBe("AWAITING_HUMAN_MERGE");
    expect(alpha().ciVerdict).toBeUndefined();
    expect(alpha().ciPr).toBeUndefined();
    expect(alpha().status).toBe("awaiting-human-merge");
    env.cleanup();
  });
  it("pending writes nothing", async () => {
    const { env, limb, ctx, creature } = setup({ checkRuns: () => [run(null)] });
    const before = JSON.stringify(creature());
    await verify(ctx, limb);
    expect(JSON.stringify(creature())).toBe(before);
    env.cleanup();
  });
  it("a red verdict shows the convulse effect with the rejection line on a sick limb", () => {
    const web = plateInput(setup({}).creature()).limbs;
    expect(web.length).toBe(1);
    const r = applyHealEvent({ "npm:alpha": "Rotting" }, { type: "ci-red", limb: "npm:alpha" });
    expect(r.effect).toEqual({ kind: "convulse", limb: "npm:alpha", line: REJECTION_LINE });
    expect(r.states["npm:alpha"]).toBe("Rotting");
  });
  it("an audit failure rolls creature.json back (green and red)", async () => {
    for (const conclusion of ["success", "failure"]) {
      const { env, limb, ctx } = setup({ checkRuns: () => [run(conclusion)] });
      const before = readFileSync(env.paths.creaturePath, "utf8");
      const io = { ...nodeIo, appendLine: () => { throw new Error("disk full"); } };
      const r = await verify({ ...ctx, io }, limb);
      expect(r.outcome).toBe("ERROR");
      expect(readFileSync(env.paths.creaturePath, "utf8")).toBe(before);
      expect(env.stateText()).toBeNull();
      env.cleanup();
    }
  });
  it("property: an API error or SEAL leaves creature.json byte-identical", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (sealed) => {
        const { env, limb, ctx } = setup(sealed ? { checkRuns: () => [run("success")] } : { failOn: "getCheckRuns" });
        if (sealed) env.seal();
        const before = readFileSync(env.paths.creaturePath, "utf8");
        const r = await verify(ctx, limb);
        const same = readFileSync(env.paths.creaturePath, "utf8") === before && r.outcome === (sealed ? "REJECTED_SEALED" : "ERROR");
        env.cleanup();
        return same;
      }),
      { numRuns: numRuns(20) },
    );
  });
  it("an unreadable creature.json is an error and changes nothing", async () => {
    const { env, limb, ctx } = setup({ checkRuns: () => [run("success")] });
    writeFileSync(env.paths.creaturePath, "{not json");
    expect((await verify(ctx, limb)).outcome).toBe("ERROR");
    expect(readFileSync(env.paths.creaturePath, "utf8")).toBe("{not json");
    expect(env.stateText()).toBeNull();
    env.cleanup();
  });
  it("property: only getCheckRuns is called (no merge-like call)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("success", "failure", null), async (c) => {
        const { env, limb, ctx, m } = setup({ checkRuns: () => [run(c)] });
        await verify(ctx, limb);
        const ok = m.calls.every((x) => x === "getCheckRuns");
        env.cleanup();
        return ok;
      }),
      { numRuns: numRuns(20) },
    );
  });
});

describe("reraise records healedBy", () => {
  function reraiseSetup(landedBy: string | undefined) {
    const env = makeAgentEnv();
    const limb = env.idOf("alpha");
    env.writeRecord(limb, "alpha", 7);
    const m = mockClient({ checkRuns: () => [run("success")], prState: () => ({ open: false, landed: true, ...(landedBy !== undefined ? { landedBy } : {}) }) });
    return { env, limb, m, ctx: { ...env.paths, io: nodeIo, client: m.client, now: env.now } };
  }
  it("healed limb gets healedBy, loses status, and praise names the healer", async () => {
    const { env, limb, m, ctx } = reraiseSetup("octo-cat");
    await verify({ ...ctx, sleep: async () => {}, maxAttempts: 3, intervalMs: 1, requiredCheck: "test" }, limb);
    expect(JSON.parse(readFileSync(env.paths.creaturePath, "utf8")).limbs[0].status).toBe("awaiting-human-merge");
    await reraise(ctx);
    const creature = JSON.parse(readFileSync(env.paths.creaturePath, "utf8"));
    expect(creature.limbs[0]).toMatchObject({ state: "Healthy", healed: true, healedBy: "octo-cat" });
    expect(creature.limbs[0].status).toBeUndefined();
    expect(JSON.parse(env.stateText()!).limbs[limb].healedBy).toBe("octo-cat");
    expect(praiseLines(plateInput(creature).limbs as RaidLimb[])).toEqual(["alpha healed by octo-cat"]);
    expect(m.calls.every((c) => c === "getCheckRuns" || c === "getPullRequestState")).toBe(true);
    env.cleanup();
  });
  it("no landedBy: healed without healedBy", async () => {
    const { env, ctx } = reraiseSetup(undefined);
    await reraise(ctx);
    const l = JSON.parse(readFileSync(env.paths.creaturePath, "utf8")).limbs[0];
    expect(l.healed).toBe(true);
    expect("healedBy" in l).toBe(false);
    env.cleanup();
  });
  it("property: whatever the API says, healedBy is a clean login or absent", async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.string({ maxLength: 80 }), fc.constant(undefined)), async (by) => {
        const { env, ctx } = reraiseSetup(by);
        await reraise(ctx);
        const l = JSON.parse(readFileSync(env.paths.creaturePath, "utf8")).limbs[0];
        env.cleanup();
        return l.healedBy === undefined || /^[A-Za-z0-9-]{1,39}$/.test(l.healedBy);
      }),
      { numRuns: numRuns(30) },
    );
  });
  it("applyHealed clears the CI record and status", () => {
    const c = { limbs: [{ ecosystem: "npm", name: "a", version: "1", status: "awaiting-human-merge", ciVerdict: "red", ciPr: 3 }] };
    const l = (applyHealed(c, [{ ecosystem: "npm", name: "a", to: "2", healedBy: "bo" }]).limbs as Record<string, unknown>[])[0]!;
    expect(l).toMatchObject({ healed: true, healedBy: "bo", version: "2" });
    expect(l.status).toBeUndefined();
    expect(l.ciVerdict).toBeUndefined();
  });
  it("property: healedBy never changes the team score", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ epss: fc.double({ min: 0, max: 1, noNaN: true }), healed: fc.boolean() }), { maxLength: 10 }), fc.string(), (ls, who) => {
        const a = ls.map((l, i) => ({ ecosystem: "npm", name: `p${i}`, ...l }));
        return teamScore(a) === teamScore(a.map((l) => ({ ...l, healedBy: who })));
      }),
      { numRuns: numRuns(100) },
    );
  });
});

describe("web: markRed", () => {
  const memory = (): MemoryStore => {
    const m = new Map<string, unknown>();
    return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, structuredClone(v)) };
  };
  const red = (pr: unknown) => ({ ecosystem: "npm", name: "a", ciVerdict: "red", ciPr: pr });
  it("shows a red once per PR and again after a new red", () => {
    const s = memory();
    expect(markRed([red(7)], s)).toEqual(["npm:a"]);
    expect(markRed([red(7)], s)).toEqual([]);
    expect(markRed([{ ecosystem: "npm", name: "a" }], s)).toEqual([]);
    expect(markRed([red(7)], s)).toEqual(["npm:a"]);
    expect(markRed([red(8)], s)).toEqual(["npm:a"]);
  });
  it("property: malformed records never produce an event", () => {
    fc.assert(
      fc.property(fc.array(fc.anything(), { maxLength: 8 }), (junk) => {
        try {
          return markRed(junk as never, memory()).every((k) => typeof k === "string");
        } catch {
          return false;
        }
      }),
      { numRuns: numRuns(100) },
    );
  });
});
