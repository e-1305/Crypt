// First 30 seconds (Milestone G3). Pure logic: hints, tutorial commands, pressure and the daily banner.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { numRuns } from "./runs.js";
import { parseCommand } from "../src/bridge/grammar.js";
import { RAID_MS, teamScore, type RaidLimb } from "../src/theatre/raid.js";
import {
  DAILY_EVENTS, IDLE_HINT_MS, dailyEvent, nextHint, pressureLabel, pressureWarning, spreadPressure, stepText, tutorialCommand, tutorialSteps,
} from "../src/theatre/onboarding.js";

const runs = numRuns(100);
const limbId = fc.stringMatching(/^[A-Z]{1,32}$/);
const done = fc.array(fc.boolean(), { maxLength: tutorialSteps.length });

describe("tutorial", () => {
  it("has the five steps in order", () => {
    expect(tutorialSteps.map((s) => s.id)).toEqual(["look", "examine", "assign", "graft", "review"]);
  });

  it("every suggested command is accepted by the strict grammar parser", () => {
    fc.assert(fc.property(limbId, (id) => {
      for (const s of tutorialSteps) {
        const c = tutorialCommand(s, id);
        if (s.command === null) expect(c).toBeNull();
        else expect(parseCommand(c)).toEqual({ ok: true, verb: s.verb, limb: id });
      }
    }), { numRuns: runs });
  });

  it("suggests nothing for a limb id the grammar would refuse", () => {
    for (const bad of ["", "lodash", "A B", "A".repeat(33), "A;B", "../x"]) {
      for (const s of tutorialSteps) expect(tutorialCommand(s, bad)).toBeNull();
    }
  });

  it("every hint that names a command is a parser-accepted command, and nothing suggests SEAL", () => {
    fc.assert(fc.property(done, fc.integer({ min: IDLE_HINT_MS, max: 100_000 }), limbId, (d, idle, id) => {
      const h = nextHint(d, idle, id);
      if (h === null) return;
      const m = /^Hint: type ([A-Z]+ [A-Z]+) and press Enter\.$/.exec(h);
      if (m) expect(parseCommand(m[1]).ok).toBe(true);
      expect(h).not.toMatch(/SEAL/);
    }), { numRuns: runs });
  });

  it("the graft step tells the player to type it, and no step text claims an automatic run", () => {
    const g = tutorialSteps.find((s) => s.id === "graft")!;
    expect(stepText(g, "LODASH")).toContain("Type GRAFT LODASH yourself");
    for (const s of tutorialSteps) expect(s.text).not.toMatch(/—|automatic/i);
  });
});

describe("nextHint", () => {
  it("never speaks before 8 seconds idle", () => {
    fc.assert(fc.property(done, fc.integer({ min: -1000, max: IDLE_HINT_MS - 1 }), limbId, (d, idle, id) => {
      expect(nextHint(d, idle, id)).toBeNull();
    }), { numRuns: runs });
  });

  it("gives exactly one hint, for the first unfinished step, after 8 seconds", () => {
    fc.assert(fc.property(done, fc.integer({ min: IDLE_HINT_MS, max: 1e6 }), limbId, (d, idle, id) => {
      const h = nextHint(d, idle, id);
      const allDone = tutorialSteps.every((_, i) => d[i] === true);
      if (allDone) expect(h).toBeNull();
      else {
        expect(typeof h).toBe("string");
        expect((h as string).split("Hint:").length).toBe(2);
      }
    }), { numRuns: runs });
  });

  it("ignores a non-numeric idle time", () => {
    expect(nextHint([], Number.NaN, "A")).toBeNull();
  });
});

describe("spreadPressure", () => {
  const ms = fc.integer({ min: -1000, max: RAID_MS * 2 });
  it("stays within 0 and 1", () => {
    fc.assert(fc.property(ms, fc.integer({ min: -2, max: 50 }), (t, k) => {
      const p = spreadPressure(t, k);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }), { numRuns: runs });
    expect(spreadPressure(Number.NaN, Number.NaN)).toBe(0);
  });

  it("never falls as time passes or as open KEV limbs grow", () => {
    fc.assert(fc.property(ms, ms, fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 10 }), (a, b, k1, k2) => {
      const [t1, t2] = a <= b ? [a, b] : [b, a];
      const [c1, c2] = k1 <= k2 ? [k1, k2] : [k2, k1];
      expect(spreadPressure(t2, c1)).toBeGreaterThanOrEqual(spreadPressure(t1, c1));
      expect(spreadPressure(t1, c2)).toBeGreaterThanOrEqual(spreadPressure(t1, c1));
    }), { numRuns: runs });
  });

  it("starts at 0, rises over the raid and does not change the team score", () => {
    expect(spreadPressure(0, 3)).toBe(0);
    expect(spreadPressure(RAID_MS, 0)).toBeGreaterThan(0.5);
    fc.assert(fc.property(
      fc.array(fc.record({ epss: fc.double({ min: 0, max: 1, noNaN: true }), kev: fc.boolean(), healed: fc.boolean() }), { maxLength: 12 }),
      ms,
      (l, t) => {
        const limbs = l.map((x, i) => ({ ecosystem: "npm", name: "p" + i, state: x.healed ? "Healed" : "Possessed", ...x })) as RaidLimb[];
        const before = teamScore(limbs);
        spreadPressure(t, limbs.filter((x) => x.kev === true).length);
        expect(teamScore(limbs)).toBe(before);
      },
    ), { numRuns: runs });
  });

  it("labels state an action and use no prohibition", () => {
    fc.assert(fc.property(fc.double({ min: -1, max: 2, noNaN: true }), fc.integer({ min: 0, max: 5 }), (p, k) => {
      const t = pressureLabel(p, k);
      expect(t).toMatch(/^Possession spread: \d+ percent\. Heal /);
      expect(t).not.toMatch(/\b(don't|do not|never|must not)\b/i);
    }), { numRuns: runs });
  });
});

describe("pressureWarning", () => {
  it("warns at 10, 5 and 1 minutes left and not before", () => {
    expect(pressureWarning(10 * 60000 + 1)).toBeNull();
    expect(pressureWarning(10 * 60000)).toContain("10 minutes");
    expect(pressureWarning(5 * 60000 + 1)).toContain("10 minutes");
    expect(pressureWarning(5 * 60000)).toContain("5 minutes");
    expect(pressureWarning(60000)).toContain("One minute");
    expect(pressureWarning(0)).toContain("One minute");
    expect(pressureWarning(Number.NaN)).toBeNull();
  });
});

describe("dailyEvent", () => {
  it("is deterministic, one of eight lines, and ignores the time of day", () => {
    expect(DAILY_EVENTS).toHaveLength(8);
    fc.assert(fc.property(fc.date({ min: new Date("2000-01-01"), max: new Date("2100-01-01"), noInvalidDate: true }), (d) => {
      const iso = d.toISOString();
      expect(dailyEvent(iso)).toBe(dailyEvent(iso));
      expect(dailyEvent(iso)).toBe(dailyEvent(iso.slice(0, 10)));
      expect(DAILY_EVENTS).toContain(dailyEvent(iso));
    }), { numRuns: runs });
  });

  it("reaches several lines over a year and handles bad input", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 365; d++) seen.add(dailyEvent(new Date(Date.UTC(2026, 0, 1 + d)).toISOString()));
    expect(seen.size).toBe(8);
    for (const bad of ["", "tomorrow", "26-1-1"]) expect(dailyEvent(bad)).toBe(DAILY_EVENTS[0]);
    expect(dailyEvent(null as unknown as string)).toBe(DAILY_EVENTS[0]);
  });

  it("uses no em dash and names no person", () => {
    for (const l of DAILY_EVENTS) expect(l).not.toMatch(/—|@/);
  });
});
