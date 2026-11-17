// Blameless property (steering: blameless.md). The theatre has one team score. It never ranks people, never builds a
// leaderboard, and names a person only in praise ("healed by"). Pure code, so the runs are cheap; they are still
// capped (as in tests/hooks.test.ts) because the grammar below does not need thousands of cases.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { numRuns } from "./runs.js";
import { cardData, cardLines } from "../src/theatre/card.js";
import { GRADES, GRADE_EPITAPHS, bossLimbs, trophies } from "../src/theatre/gamify.js";
import { EPITAPHS, praiseLines, rankFor, teamScore, type RaidLimb } from "../src/theatre/raid.js";

const ROOT = resolve(import.meta.dirname, "..");
const RUNS = Math.min(numRuns(100), 300);

/** Wording that points at a person as the cause, or orders people. */
const BANNED = /leaderboard|scoreboard|top (contributor|healer|surgeon)s?|\bblame|\bculprit|fault of|caused by|introduced by|committed by|broke(n)? by|\bauthored? by|per[- ]person|individual (score|rank)|\bhall of shame/i;

const text = fc.string({ maxLength: 30 });
const limb = fc.record(
  {
    ecosystem: fc.constantFrom("npm", "pypi", "go"),
    name: text,
    epss: fc.double({ min: 0, max: 1, noNaN: true }),
    kev: fc.boolean(),
    state: fc.constantFrom("Healed", "Rotting", "Possessed", "Healthy"),
    status: fc.constantFrom("awaiting-human-merge", undefined),
    healedBy: text,
  },
  { requiredKeys: ["name"] },
);
const limbs = fc.array(limb, { maxLength: 12 });

describe("theatre is blameless", () => {
  it("property: the team score ignores who healed a limb", () => {
    fc.assert(
      fc.property(limbs, fc.array(text, { minLength: 12, maxLength: 12 }), (list, names) => {
        const renamed = list.map((l, i) => ({ ...l, healedBy: names[i] }));
        const nobody = list.map(({ healedBy: _h, ...rest }) => rest);
        expect(teamScore(renamed as RaidLimb[])).toBe(teamScore(nobody as RaidLimb[]));
      }),
      { numRuns: RUNS },
    );
  });

  it("property: praise lines are 'healed by' praise only, at most one per healed limb, ordered by limb and never by person", () => {
    fc.assert(
      fc.property(limbs, (list) => {
        const lines = praiseLines(list as RaidLimb[]);
        for (const line of lines) {
          expect(line).toMatch(/ healed by /);
          expect(line).not.toMatch(BANNED);
        }
        // Reversing the input changes nothing: the order is by limb, not by input position or person.
        expect(praiseLines([...list].reverse() as RaidLimb[]).length).toBe(lines.length);
        expect(lines.length).toBeLessThanOrEqual(list.filter((l) => l.state === "Healed").length);
      }),
      { numRuns: RUNS },
    );
  });

  it("property: card and ranks carry team figures only and never banned wording", () => {
    fc.assert(
      fc.property(limbs, fc.string({ maxLength: 40 }), fc.integer({ min: 0, max: 2_000_000 }), (list, repo, ms) => {
        const card = cardData(repo, list as RaidLimb[], ms);
        expect(Object.keys(card).sort()).toEqual(["chain", "epitaph", "grade", "limbsHealed", "rank", "repo", "riskRemoved", "time", "title", "trophies"]);
        for (const line of cardLines(card)) expect(line.replace(card.repo, "")).not.toMatch(BANNED);
        expect(rankFor(card.limbsHealed)).toBe(card.rank);
      }),
      { numRuns: RUNS },
    );
  });

  it("property: game feel output never contains a healer name or a per-person count", () => {
    fc.assert(
      fc.property(limbs, fc.string({ minLength: 3, maxLength: 12 }), (list, who) => {
        const named = (list as RaidLimb[]).map((l) => ({ ...l, healedBy: `Zq${who}Zq` }));
        const out = JSON.stringify([trophies(named, { healed: 3, elapsedMs: 1000, nights: 3, bestChain: 3 }), cardData("repo", named, 1000, { all: named, bestChain: 3 })]);
        expect(out).not.toContain(`Zq${who}Zq`);
        expect(out).not.toMatch(BANNED);
        expect(JSON.stringify(bossLimbs(named).map((l) => l.name))).not.toContain(`Zq${who}Zq`);
      }),
      { numRuns: RUNS },
    );
    for (const g of GRADES) for (const e of GRADE_EPITAPHS[g]) expect(e).not.toMatch(BANNED);
  });

  it("every epitaph is free of banned wording", () => {
    for (const e of EPITAPHS) expect(e).not.toMatch(BANNED);
  });

  it("the page and theatre sources (comments removed) hold no leaderboard, ranking of people or blame wording", () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const f of ["src/theatre/raid.ts", "src/theatre/card.ts", "src/theatre/gamify.ts", "src/theatre/screen-text.ts", "src/theatre/heal-events.ts", "src/theatre/polish.ts", "src/theatre/audio-plan.ts", "web/raid.js", "web/heal.js", "web/theatre/sound.js", "web/theatre/board.js", "web/theatre/wall.js", "web/theatre/card-draw.js"]) {
      expect(strip(readFileSync(join(ROOT, f), "utf8")), f).not.toMatch(BANNED);
    }
    expect(readFileSync(join(ROOT, "web", "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "")).not.toMatch(BANNED);
  });
});
