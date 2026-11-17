// Offline tests for the live wiring: flags, Inquisitor hand-off in the session, reraise with HEALED on the plate.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nodeIo } from "../src/common/io.js";
import { GITHUB_BASE } from "../src/cli/url.js";
import { UsageError } from "../src/cli/exit.js";
import { parseCli } from "../src/cli/parse.js";
import { reraise } from "../src/reraise/index.js";
import { generate } from "../src/raise/generate.js";
import { renderPlate } from "../src/render/plate.js";
import { handleLiveGraft } from "../scripts/cli/live-graft.js";
import { makeAgentEnv, mockClient } from "./agent-helpers.js";

const TOKEN = { GITHUB_TOKEN: "t" };
const URL = `${GITHUB_BASE}/o/r`;

describe("flags: sabotage refusal matrix", () => {
  const g = (...flags: string[]) => parseCli(["graft", "LODASH", ...flags], TOKEN);
  it("is refused unless both --live and --i-know-this-is-a-demo are given", () => {
    expect(() => g("--sabotage")).toThrow(UsageError);
    expect(() => g("--sabotage", "--live")).toThrow(/i-know-this-is-a-demo/);
    expect(() => g("--sabotage", "--i-know-this-is-a-demo")).toThrow(/--live/);
    expect(() => g("--i-know-this-is-a-demo")).toThrow(UsageError);
    expect(() => g("--i-know-this-is-a-demo", "--live")).toThrow(UsageError);
  });
  it("is accepted with all three, and off by default", () => {
    expect(g("--sabotage", "--live", "--i-know-this-is-a-demo", "--repo", "o/r").flags).toEqual({ sabotage: true, live: true, "i-know-this-is-a-demo": true, repo: "o/r" });
    expect(g().flags.sabotage).toBeUndefined();
  });
  it("help labels --sabotage as demo only", async () => {
    const { helpText } = await import("../src/cli/help.js");
    expect(helpText()).toMatch(/--sabotage\s+graft: DEMO ONLY/);
  });
});

describe("flags: raid --live", () => {
  it("accepts a GitHub URL with a token", () => {
    expect(parseCli(["raid", URL, "--live", "--timeout", "30"], TOKEN).flags).toEqual({ live: true, timeout: "30" });
  });
  it("refuses a local path, --offline and a missing token before any work", () => {
    expect(() => parseCli(["raid", "fixtures/vulnerable-npm", "--live"], TOKEN)).toThrow(/GitHub URL/);
    expect(() => parseCli(["raid", URL, "--live", "--offline"], TOKEN)).toThrow(/--offline/);
    expect(() => parseCli(["raid", URL, "--live"], {})).toThrow(/GITHUB_TOKEN/);
    expect(() => parseCli(["raid", URL, "--live"], { GITHUB_TOKEN: "" })).toThrow(UsageError);
  });
  it("validates --timeout as an integer from 10 to 3600", () => {
    for (const bad of ["9", "3601", "1.5", "abc", "-5", "1e3"]) expect(() => parseCli(["raid", URL, "--live", "--timeout", bad], TOKEN)).toThrow(/--timeout/);
    for (const ok of ["10", "600", "3600"]) expect(parseCli(["inquisit", "LODASH", "--live", "--timeout", ok], TOKEN).flags.timeout).toBe(ok);
    expect(() => parseCli(["raid", URL, "--timeout", "30"], TOKEN)).toThrow(/--live/);
  });
});

describe("flags: inquisit and reraise", () => {
  it("--live needs a token; without --live nothing changes", () => {
    expect(() => parseCli(["inquisit", "LODASH", "--live"], {})).toThrow(/GITHUB_TOKEN/);
    expect(() => parseCli(["reraise", "--live"], {})).toThrow(/GITHUB_TOKEN/);
    expect(parseCli(["reraise", "--live", "--timeout", "20"], TOKEN).flags).toEqual({ live: true, timeout: "20" });
    expect(parseCli(["inquisit", "LODASH"], {}).flags).toEqual({});
  });
});

describe("session hand-off to the Inquisitor", () => {
  const sink = () => {
    const lines: string[] = [];
    return { lines, write: (s: string) => void lines.push(s) };
  };
  const make = (runs: () => { name: string; status: string; conclusion: string | null }[]) => {
    const env = makeAgentEnv();
    const limb = env.idOf("alpha");
    const branch = env.writeRecord(limb, "alpha", 7);
    const m = mockClient({ checkRuns: runs });
    const ctx = { ...env.paths, io: nodeIo, client: m.client, now: env.now, sleep: async () => {}, timeoutMs: 40, intervalMs: 10 };
    return { env, limb, branch, m, ctx };
  };
  it("prints the PR URL, then 'awaiting a human' on a green test check", async () => {
    const { env, limb, branch, ctx } = make(() => [{ name: "test", status: "completed", conclusion: "success" }]);
    const out = sink();
    await handleLiveGraft(ctx, limb, branch, out);
    expect(out.lines[0]).toBe(`Graft ${limb}: pull request opened https://example.invalid/pr/7\n`);
    expect(out.lines[1]).toBe(`${limb}: awaiting a human to land the pull request\n`);
    expect(env.outcomes()).toEqual(["AWAITING_HUMAN_MERGE"]);
    env.cleanup();
  });
  it("prints the rejection text on red and on timeout, and the limb stays rotting", async () => {
    for (const runs of [[{ name: "test", status: "completed", conclusion: "failure" }], []]) {
      const { env, limb, branch, ctx } = make(() => runs);
      const out = sink();
      await handleLiveGraft(ctx, limb, branch, out);
      expect(out.lines[1]).toBe("The graft was rejected. The creature remains.\n");
      expect(env.stateText()).toBeNull();
      env.cleanup();
    }
  });
  it("an API failure prints an ERROR line and changes nothing", async () => {
    const { env, limb, branch, ctx } = make(() => {
      throw new Error("boom");
    });
    const out = sink();
    await handleLiveGraft(ctx, limb, branch, out);
    expect(out.lines[1]).toMatch(/ERROR/);
    expect(env.stateText()).toBeNull();
    env.cleanup();
  });
});

describe("reraise live", () => {
  const setup = (opts: Parameters<typeof mockClient>[0]) => {
    const env = makeAgentEnv([
      { name: "alpha", version: "1.0.0", fixed: "1.0.1" },
      { name: "beta", version: "1.0.0", fixed: "1.0.1" },
    ]);
    env.writeRecord(env.idOf("alpha"), "alpha", 10);
    env.writeRecord(env.idOf("beta"), "beta", 11);
    const m = mockClient(opts);
    return { env, m, ctx: { ...env.paths, io: nodeIo, client: m.client, now: env.now } };
  };
  it("a merged PR heals the limb: state, creature and the plate say HEALED", async () => {
    const { env, ctx } = setup({ prState: (r) => ({ open: false, landed: r.number === 10 }) });
    const r = await reraise(ctx);
    expect(r.healed).toEqual([env.idOf("alpha")]);
    const raw = readFileSync(env.paths.creaturePath, "utf8");
    const creature = JSON.parse(raw);
    expect(creature.limbs.find((l: any) => l.name === "alpha")).toMatchObject({ state: "Healthy", healed: true, spawned: false });
    expect(JSON.parse(env.stateText()!).limbs[env.idOf("alpha")].state).toBe("healed");
    const plate = renderPlate(creature, { repo: "demo" });
    expect(plate).toMatch(/HEALED 1\b/);
    expect(plate).toMatch(/alpha 1\.0\.1 .{1,4} HEALED/);
    expect(Object.values(generate(creature).limbs).map((l) => l.name)).toEqual(["beta"]);
    env.cleanup();
  });
  it("an API 500 leaves state.json and creature.json byte-identical", async () => {
    const { env, ctx } = setup({ failOn: "getPullRequestState" });
    const before = readFileSync(env.paths.creaturePath, "utf8");
    const r = await reraise(ctx);
    expect(r.outcome).toBe("ERROR");
    expect(readFileSync(env.paths.creaturePath, "utf8")).toBe(before);
    expect(env.stateText()).toBeNull();
    env.cleanup();
  });
});
