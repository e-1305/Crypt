// Team progress (XP and levels). Property tests: XP is monotonic, level thresholds hold, nothing is per person.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { numRuns } from "./runs.js";
import { KEV_DEADLINE_HOURS, LEVELS, XP_HEAL, XP_KEV_HEAL, levelFor, teamProgress, teamXp, xpForHeal, type HealRecord } from "../src/theatre/progress.js";

const runs = numRuns(100);
const hours = fc.double({ min: 0, max: 200, noNaN: true });
const heal = fc.record({ kev: fc.boolean(), hoursBeforeDeadline: hours });
const heals = fc.array(heal, { maxLength: 30 });

describe("xpForHeal", () => {
  it("a KEV heal always beats a non-KEV heal", () => {
    fc.assert(fc.property(hours, (h) => xpForHeal({ kev: true, hoursBeforeDeadline: h }) > xpForHeal({ kev: false, hoursBeforeDeadline: h })), { numRuns: runs });
  });
  it("is monotonic in time left before the deadline", () => {
    fc.assert(fc.property(hours, hours, (a, b) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return xpForHeal({ kev: true, hoursBeforeDeadline: lo }) <= xpForHeal({ kev: true, hoursBeforeDeadline: hi });
    }), { numRuns: runs });
  });
  it("stays within bounds, and bad input gets the base value", () => {
    expect(xpForHeal({ kev: false })).toBe(XP_HEAL);
    expect(xpForHeal({ kev: true })).toBe(XP_KEV_HEAL);
    expect(xpForHeal({ kev: true, hoursBeforeDeadline: NaN })).toBe(XP_KEV_HEAL);
    expect(xpForHeal({ kev: true, hoursBeforeDeadline: -5 })).toBe(XP_KEV_HEAL);
    expect(xpForHeal({ kev: true, hoursBeforeDeadline: KEV_DEADLINE_HOURS * 9 })).toBe(xpForHeal({ kev: true, hoursBeforeDeadline: KEV_DEADLINE_HOURS }));
  });
});

describe("teamXp", () => {
  it("never decreases when a heal is added", () => {
    fc.assert(fc.property(heals, heal, (hs, h) => teamXp([...hs, h]) > teamXp(hs)), { numRuns: runs });
  });
  it("ignores order", () => {
    fc.assert(fc.property(heals, (hs) => teamXp(hs) === teamXp([...hs].reverse())), { numRuns: runs });
  });
});

describe("levels", () => {
  it("thresholds are strictly increasing from 0 with grim titles", () => {
    expect(LEVELS[0].xp).toBe(0);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].xp).toBeGreaterThan(LEVELS[i - 1].xp);
    expect(new Set(LEVELS.map((l) => l.title)).size).toBe(LEVELS.length);
  });
  it("each threshold lands on its level and one XP below on the previous", () => {
    for (let i = 0; i < LEVELS.length; i++) {
      expect(levelFor(LEVELS[i].xp).level).toBe(LEVELS[i].level);
      if (i > 0) expect(levelFor(LEVELS[i].xp - 1).level).toBe(LEVELS[i - 1].level);
    }
  });
  it("level is monotonic in XP", () => {
    fc.assert(fc.property(fc.nat(5000), fc.nat(5000), (a, b) => (a <= b ? levelFor(a).level <= levelFor(b).level : true)), { numRuns: runs });
  });
  it("bad XP gives level 1", () => {
    for (const x of [NaN, -1, Infinity * 0, "x" as unknown as number]) expect(levelFor(x).level).toBe(1);
  });
  it("progress agrees with the level table", () => {
    fc.assert(fc.property(heals, (hs) => {
      const p = teamProgress(hs);
      const next = LEVELS.find((l) => l.level === p.level.level + 1);
      return p.xp >= p.level.xp && (next ? p.toNext === next.xp - p.xp && p.toNext > 0 : p.toNext === null);
    }), { numRuns: runs });
  });
  it("carries no person: records and output hold no author fields", () => {
    const h: HealRecord = { kev: true, hoursBeforeDeadline: 10 };
    expect(Object.keys(h).sort()).toEqual(["hoursBeforeDeadline", "kev"]);
    expect(Object.keys(teamProgress([h])).sort()).toEqual(["level", "toNext", "xp"]);
  });
});
