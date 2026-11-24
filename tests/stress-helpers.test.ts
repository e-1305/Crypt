import { describe, expect, it } from "vitest";
import { checksTable, claimsClean, commandMix, mb, median, percentile, summarize, syntheticCreature, syntheticLockfile } from "../scripts/stress/lib.mjs";

describe("stress harness helpers", () => {
  it("builds a synthetic creature with the requested limb count and valid states", () => {
    const c = syntheticCreature(400);
    expect(c.limbs).toHaveLength(400);
    expect(new Set(c.limbs.map((l) => l.state))).toEqual(new Set(["Possessed", "Rotting", "Healthy"]));
    expect(new Set(c.limbs.map((l) => l.name)).size).toBe(400);
  });

  it("builds a lockfile with n packages plus the root entry, and pads resolved fields", () => {
    const lock = JSON.parse(syntheticLockfile(50));
    expect(lock.lockfileVersion).toBe(3);
    expect(Object.keys(lock.packages)).toHaveLength(51);
    expect(syntheticLockfile(2, 1000).length).toBeGreaterThan(2000);
  });

  it("mixes commands: exact count, one 1 KB line, unicode and garbage", () => {
    const m = commandMix(200);
    expect(m).toHaveLength(200);
    expect(m.some((c) => c.length === 1024)).toBe(true);
    expect(m.some((c) => /[^\x00-\x7f]/.test(c))).toBe(true);
    expect(m).toContain("HELP");
  });

  it("flags clean claims but not the fail-safe wording", () => {
    expect(claimsClean("Good news: this repo is clean.")).toBe(true);
    expect(claimsClean("No vulnerabilities found")).toBe(true);
    expect(claimsClean("Could not reach api.osv.dev. Nothing is marked healthy. Try again.")).toBe(false);
    expect(claimsClean("is larger than the 20 MB cap, so nothing was drawn.")).toBe(false);
  });

  it("computes median, percentile and megabytes", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(mb(5 * 1048576)).toBe(5);
  });

  it("summarizes failures and renders a table with escaped pipes", () => {
    const scenarios = [
      { id: "a", checks: [{ name: "x", ok: true, detail: "1 ms" }, { name: "y", ok: false, detail: "a|b" }] },
      { id: "b", checks: [{ name: "z", ok: true }] },
    ];
    const s = summarize(scenarios);
    expect(s.passed).toBe(false);
    expect(s.checks).toBe(3);
    expect(s.failures).toEqual([{ scenario: "a", check: "y", detail: "a|b" }]);
    const t = checksTable(scenarios);
    expect(t).toContain("| a | y | FAIL | a\\|b |");
    expect(summarize([scenarios[1]!]).passed).toBe(true);
  });
});
