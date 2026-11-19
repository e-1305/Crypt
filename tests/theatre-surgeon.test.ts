// Surgeon's theatre model (issue #217): strict command to tool mapping, one honest narrator line, bounded jars.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { numRuns } from "./runs.js";
import { MAX_JARS, MAX_LABEL, TOOLS, addJar, cleanLabel, narratorLine, takeDown, toolForCommand, type Jar, type Step } from "../src/theatre/surgeon.js";

const RUNS = numRuns(200);
const BANNED = /leaderboard|scoreboard|top (contributor|healer|surgeon)s?|\bblame|\bculprit|fault of|caused by|introduced by|committed by|broke(n)? by|\bauthored? by|per[- ]person|individual (score|rank)|\bhall of shame/i;
const STEPS: Step[] = ["scan", "examine", "graft", "ci-green", "ci-red", "reraise", "seal", "jar"];

describe("tool for command", () => {
  it("maps the grammar to tools", () => {
    expect(toolForCommand("EXAMINE LODASH")).toBe("scalpel");
    expect(toolForCommand("RAID")).toBe("scalpel");
    expect(toolForCommand("GRAFT LODASH")).toBe("needle");
    expect(toolForCommand("SEAL CRYPT")).toBe("lamp");
    expect(toolForCommand("ASSIGN LODASH")).toBeNull();
  });
  it("anything off grammar lifts no tool", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (s) => {
        const t = toolForCommand(s);
        if (t !== null) expect(s).toMatch(/^(EXAMINE [A-Z]{1,32}|GRAFT [A-Z]{1,32}|SEAL CRYPT|RAID)$/);
      }),
      { numRuns: RUNS },
    );
    for (const bad of [" EXAMINE X", "examine x", "EXAMINE X ", "EXAMINE", "SEAL", "GRAFT x1", 5, null, undefined]) expect(toolForCommand(bad)).toBeNull();
  });
  it("every tool shows its text command", () => {
    expect(TOOLS.map((t) => t.id)).toEqual(["scalpel", "needle", "magnifier", "lamp", "bell"]);
    for (const t of TOOLS) expect(t.command.length).toBeGreaterThan(0);
  });
});

describe("narrator", () => {
  it("is exactly one plain line, blameless, honest, never a merge claim", () => {
    fc.assert(
      fc.property(fc.constantFrom(...STEPS), fc.string({ maxLength: 60 }), (step, subject) => {
        const line = narratorLine(step, subject);
        expect(line).not.toMatch(/[\r\n]/);
        expect(line.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(2);
        expect(line).not.toMatch(BANNED);
        expect(line).not.toMatch(/\bmerged\b|\bmerges\b|\bmerging\b/i);
        if (step === "graft") expect(line).toContain("DRY RUN");
        if (step === "ci-green" || step === "ci-red" || step === "reraise") expect(line).toContain("SIMULATED");
      }),
      { numRuns: RUNS },
    );
  });
});

describe("jars", () => {
  it("labels are bounded and sanitised", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const l = cleanLabel(s);
        expect(l.length).toBeLessThanOrEqual(MAX_LABEL);
        expect(l).toMatch(/^[A-Za-z0-9._\-/ ~]*$/);
      }),
      { numRuns: RUNS },
    );
  });
  it("a pasted repo adds exactly one jar and a duplicate adds none", () => {
    const once = addJar([], "e-1305/crypt-demo");
    expect(once).toEqual([{ repo: "e-1305/crypt-demo", place: "shelf" }]);
    expect(addJar(once, "E-1305/Crypt-Demo")).toEqual(once);
    expect(addJar(once, "not a repo")).toEqual(once);
    expect(addJar(once, "a/b").length).toBe(2);
  });
  it("the shelf is capped and scan puts exactly one jar on the table", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.stringMatching(/^[a-z]{1,8}$/), fc.stringMatching(/^[a-z]{1,8}$/)), { maxLength: 20 }), (pairs) => {
        let jars: Jar[] = [];
        for (const [o, r] of pairs) jars = addJar(jars, o + "/" + r);
        expect(jars.length).toBeLessThanOrEqual(MAX_JARS);
        if (jars.length) {
          const down = takeDown(jars, jars[0].repo);
          expect(down.filter((j) => j.place === "table").length).toBe(1);
          expect(takeDown(jars, "zz/unknown")).toEqual(jars);
        }
      }),
      { numRuns: RUNS },
    );
  });
});
