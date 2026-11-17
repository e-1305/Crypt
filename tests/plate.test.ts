import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { creatureName, plateSummary, renderPlate } from "../src/render/plate.js";

const limb = (rank: number, name: string, version: string, state: string, spawned: boolean) => ({
  rank,
  id: `npm:${name}@${version}`,
  ecosystem: "npm",
  name,
  version,
  owner: "@crypt-fixture/supply-chain",
  state,
  spawned,
  kev: state === "Possessed",
  epss: 0.5,
  vulns: [],
});

/** Same limbs as the fixture creature built by `npm run exhume` on fixtures/vulnerable-npm. */
export const FIXTURE = {
  schemaVersion: 1,
  counts: { limbs: 7, spawned: 2 },
  limbs: [
    limb(1, "jquery", "3.4.1", "Possessed", true),
    limb(2, "lodash", "4.17.15", "Rotting", true),
    limb(3, "handlebars", "4.0.11", "Rotting", false),
    limb(4, "minimist", "0.0.8", "Rotting", false),
    limb(5, "node-fetch", "2.6.0", "Rotting", false),
    limb(6, "ms", "2.1.3", "Healthy", false),
    limb(7, "mkdirp", "0.5.1", "Healthy", false),
  ],
};

const many = (n: number, state = "Rotting") => ({
  limbs: Array.from({ length: n }, (_, i) => limb(i + 1, `package-with-a-rather-long-name-${i}`, "1.2.3-beta.10+build", state, true)),
});

describe("plate renderer", () => {
  it("matches the snapshot for the fixture creature", () => {
    expect(renderPlate(FIXTURE, { repo: "crypt-demo" })).toMatchSnapshot();
  });

  it("titles the plate from the creature's own repo, never the cwd (snapshot)", () => {
    const text = renderPlate({ ...FIXTURE, repo: "vulnerable-npm-fixture" });
    expect(text).toContain("THE CREATURE OF vulnerable-npm-fixture");
    expect(text).toMatchSnapshot();
  });

  it("scripts/plate.ts prints the creature's repo from a differently named cwd", () => {
    const cwd = join(mkdtempSync(join(tmpdir(), "crypt-")), "some-other-dir");
    mkdirSync(cwd);
    const file = join(cwd, "creature.json");
    writeFileSync(file, JSON.stringify({ ...FIXTURE, repo: "vulnerable-npm-fixture" }));
    const root = join(__dirname, "..");
    const run = (...extra: string[]) =>
      spawnSync(process.execPath, ["--import", join(root, "node_modules/tsx/dist/loader.mjs"), join(root, "scripts/plate.ts"), file, ...extra], { encoding: "utf8", cwd });
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("THE CREATURE OF vulnerable-npm-fixture");
    expect(r.stdout).not.toContain("some-other-dir");
    expect(run("--repo", "override").stdout).toContain("THE CREATURE OF override");
  });

  it("has the required header, label and footer", () => {
    const t = renderPlate(FIXTURE, { repo: "crypt-demo" });
    expect(t).toContain("PLATE I. \u2014 THE CREATURE OF crypt-demo");
    expect(t).toContain(`The Creature of crypt-demo, called ${creatureName("crypt-demo")}`);
    expect(t).toContain("jquery 3.4.1 \u2014 POSSESSED");
    expect(t).toContain("lodash 4.17.15 \u2014 ROTTING");
    expect(t).toContain("LIMBS 7  POSSESSED 1  ROTTING 4  HEALED 0  HEALTHY 2");
  });

  it("names the creature deterministically from the repo name", () => {
    expect(creatureName("crypt-demo")).toBe(creatureName("crypt-demo"));
    expect(creatureName("crypt-demo")).toMatch(/^[A-Z][a-z]+-\d{1,2}$/);
    expect(new Set(["a", "b", "c", "d", "e", "f"].map(creatureName)).size).toBeGreaterThan(1);
  });

  it("is deterministic", () => {
    expect(renderPlate(FIXTURE, { repo: "x" })).toBe(renderPlate(structuredClone(FIXTURE), { repo: "x" }));
  });

  it("marks each state with its texture and word", () => {
    const c = { limbs: [...FIXTURE.limbs.slice(0, 2), { ...limb(3, "fixed", "2.0.0", "Healthy", false), healed: true }] };
    const t = renderPlate(c, { repo: "r" });
    expect(t).toContain("#####");
    expect(t).toContain("%%%%%");
    expect(t).toContain("fixed 2.0.0 \u2014 HEALED");
    expect(t).toContain("HEALED 1");
    expect(renderPlate({ limbs: [limb(1, "a", "1", "Healed", false)] }, { repo: "r" })).toContain("a 1 \u2014 HEALED");
    // Healed limb interior has no texture characters.
    const healedOnly = renderPlate({ limbs: [limb(1, "a", "1", "Healed", false)] }, { repo: "r" });
    expect(healedOnly.split("\n").filter((l) => l.includes("|")).join("")).not.toMatch(/[#%]/);
    expect(plateSummary(c)).toEqual(["jquery 3.4.1: Possessed", "lodash 4.17.15: Rotting", "fixed 2.0.0: Healed"]);
  });

  it("handles zero limbs and overflow", () => {
    expect(renderPlate({ limbs: [] }, { repo: "r" })).toContain("LIMBS 0");
    expect(renderPlate(null, { repo: "r" })).toContain("LIMBS 0");
    const t = renderPlate(many(30), { repo: "r" });
    expect(t).toContain("ALSO ON THE SLAB:");
    expect(t).toContain("... and 13 more");
  });

  it("never prints owners or blame words", () => {
    const t = renderPlate({ ...FIXTURE, limbs: FIXTURE.limbs.map((l) => ({ ...l, author: "Mallory", owner: "@mallory/team" })) }, { repo: "r" });
    expect(t).not.toMatch(/mallory|@|owner|author|blame|fault/i);
  });

  it("fits 80 columns for any input", () => {
    const text = fc.string({ unit: "binary", maxLength: 200 });
    const arbLimb = fc.record({
      rank: fc.oneof(fc.integer(), fc.constant(undefined)),
      ecosystem: text,
      name: text,
      version: text,
      state: fc.constantFrom("Possessed", "Rotting", "Healthy", "Healed", "x"),
      spawned: fc.boolean(),
      healed: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(arbLimb, { maxLength: 40 }), text, (limbs, repo) => {
        const out = renderPlate({ limbs }, { repo });
        for (const line of out.split("\n")) {
          expect([...line].length).toBeLessThanOrEqual(80);
          // Only the literal em dash is non-ASCII.
          expect(line.replace(/\u2014/g, "-")).toMatch(/^[\x20-\x7e]*$/);
        }
      }),
    );
  });
});

describe("plateInput", () => {
  it("drops owners and unknown fields", async () => {
    const { plateInput } = await import("../src/render/plate.js");
    const out = plateInput({ repo: "r", secret: 1, limbs: [{ ...FIXTURE.limbs[0], owner: "@x/y" }] });
    expect(JSON.stringify(out)).not.toContain("@x/y");
    expect(Object.keys(out.limbs[0]).sort()).toEqual(["ecosystem", "epss", "kev", "name", "rank", "spawned", "state", "version"]);
  });
});
