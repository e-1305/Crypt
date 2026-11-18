import { describe, expect, it } from "vitest";
import { type CreatureFile, type CreatureLimb, analyse, judge, passesFilter, render } from "../scripts/census/upstream-candidates.js";
import type { Advisory } from "../src/necromancer/version.js";

const limb = (o: Partial<CreatureLimb> = {}): CreatureLimb => ({
  id: "npm:foo@1.0.0", ecosystem: "npm", name: "foo", version: "1.0.0", direct: true, manifest: "package-lock.json",
  state: "Rotting", kev: false, epss: 0.5, vulns: [{ id: "GHSA-1", cves: ["CVE-1"] }], ...o,
});
const adv = (events: Record<string, string>[], name = "foo"): Advisory => ({
  id: "GHSA-1", aliases: [], affected: [{ package: { ecosystem: "npm", name }, ranges: [{ type: "SEMVER", events }] }],
});

describe("passesFilter", () => {
  it("keeps Possessed and Rotting with EPSS >= 0.1 only", () => {
    expect(passesFilter(limb({ epss: 0.1 }))).toBe(true);
    expect(passesFilter(limb({ epss: 0.0999 }))).toBe(false);
    expect(passesFilter(limb({ state: "Possessed", kev: true, epss: 0 }))).toBe(true);
    expect(passesFilter(limb({ state: "Healthy", epss: 0.9 }))).toBe(false);
  });
});

describe("judge", () => {
  it("names a same-major fix as a candidate", () => {
    expect(judge(limb(), [adv([{ introduced: "0" }, { fixed: "1.2.0" }])])).toEqual({ kind: "candidate", fixed: "1.2.0" });
  });
  it("marks a fix in a higher major as breaking", () => {
    expect(judge(limb(), [adv([{ introduced: "0" }, { fixed: "2.0.0" }])])).toEqual({ kind: "breaking", fixed: "2.0.0" });
  });
  it("reports no fix when every range stays open", () => {
    expect(judge(limb(), [adv([{ introduced: "0" }])])).toEqual({ kind: "no-fix" });
  });
  it("fails safe: a missing advisory or a 4-part version is never a candidate", () => {
    expect(judge(limb(), [null]).kind).toBe("unverifiable");
    expect(judge(limb({ ecosystem: "PyPI", version: "4.1.0.25" }), [adv([{ introduced: "0" }, { fixed: "4.8.1" }])]).kind).toBe("unverifiable");
  });
});

describe("analyse and render", () => {
  const files: CreatureFile[] = [{ repo: "a/b", limbs: [limb(), limb({ name: "bar", state: "Healthy", vulns: [] }), limb({ name: "low", epss: 0.01 })] }];
  it("reads only filtered limbs and renders a table row with the fixed version", async () => {
    const rows = await analyse(files, async () => adv([{ introduced: "0" }, { fixed: "1.2.0" }]));
    expect(rows).toHaveLength(1);
    const text = render(rows);
    expect(text).toContain("| a/b | package-lock.json | foo | 1.0.0 | yes | no | 0.5 | CVE-1 | fix 1.2.0 (same major) |");
  });
  it("makes no call when nothing passes the filter", async () => {
    let calls = 0;
    await analyse([{ repo: "a/b", limbs: [limb({ epss: 0.01 })] }], async () => (calls++, null));
    expect(calls).toBe(0);
  });
});
