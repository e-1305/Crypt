// Offline acceptance for the live raid: mocked GitHub and registry, real agents.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoFile, registryFixture } from "./live-helpers.js";
import { happyRaid, logViolations, sabotageRaid, sealedRaid } from "./live-raid-flow.js";

describe("full mocked raid on crypt-demo", () => {
  it("opens one PR per limb with a correct lockfile, waits for a human, then marks HEALED", async () => {
    const h = await happyRaid();
    const { w, env } = h.s;
    expect(w.prs).toHaveLength(2);
    for (const [name, to] of [["lodash", "4.17.21"], ["jquery", "3.5.0"]] as const) {
      const files = w.filesAt(`refs/heads/crypt/graft-${name}-${to}`);
      const lock = JSON.parse(files["package-lock.json"]!);
      const base = JSON.parse(demoFile("package-lock.json"));
      expect(lock.packages[`node_modules/${name}`]).toEqual({ version: to, resolved: registryFixture(name, to).dist.tarball, integrity: registryFixture(name, to).dist.integrity });
      expect(JSON.parse(files["package.json"]!).dependencies[name]).toBe(to);
      for (const k of Object.keys(base.packages)) if (k !== "" && k !== `node_modules/${name}`) expect(lock.packages[k]).toEqual(base.packages[k]);
      expect(files["test/smoke.test.js"] ?? demoFile("smoke.test.js")).toBe(demoFile("smoke.test.js"));
    }
    expect(h.outcomesBeforeMerge.filter((o) => o === "AWAITING_HUMAN_MERGE")).toHaveLength(2);
    expect(Object.values(JSON.parse(h.stateBeforeMerge!).limbs).map((l: any) => l.state)).toEqual(["awaiting-human-merge", "awaiting-human-merge"]); // nothing is healed until a human lands the PR
    expect(h.s.stdout.join("")).toMatch(/LODASH: awaiting a human to land the pull request/);
    expect(h.re.outcome).toBe("OK");
    expect(h.re.healed.sort()).toEqual([h.lodash.limb, h.jquery.limb].sort());
    expect(h.plate).toMatch(/HEALED/);
    expect(Object.keys(h.generated.limbs)).toEqual([]);
    expect(env.audit().length).toBeGreaterThan(0);
    expect(logViolations(h.s)).toEqual([]);
  });

  it("sabotage: red check, GRAFT_REJECTED text, limb still rotting, record archived", async () => {
    const r = await sabotageRaid();
    const { w, env } = r.s;
    expect(r.pr!.head).toMatch(/-sabotage$/);
    expect(w.filesAt(`refs/heads/${r.pr!.head}`)["test/smoke.test.js"]).not.toBe(demoFile("smoke.test.js"));
    expect(r.s.stdout.join("")).toContain("The graft was rejected. The creature remains.");
    expect(env.outcomes()).toContain("GRAFT_REJECTED");
    expect(env.stateText()).toBeNull();
    expect(readdirSync(join(env.paths.prsDir, "rejected"))).toHaveLength(1);
    expect(readFileSync(env.paths.creaturePath, "utf8")).toContain('"Rotting"');
    expect(logViolations(r.s)).toEqual([]);
  });

  it("sealed: a graft makes zero API calls", async () => {
    const { s, r } = await sealedRaid();
    expect(r.outcome).toBe("REJECTED_SEALED");
    expect(s.w.requests).toEqual([]);
    expect(s.env.audit().some((l) => l.includes("API_CALL"))).toBe(false);
  });
});
