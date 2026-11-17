// Game feel logic (Milestone G1). Pure functions: the clock is passed in, nothing is random, nothing names a person.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { numRuns } from "./runs.js";
import { RAID_MS, rankFor, teamScore, type RaidLimb } from "../src/theatre/raid.js";
import {
  COMBO_WINDOW_MS, GRADES, GRADE_EPITAPHS, bossLimbs, comboState, epitaphFor, gradeFor, multiplierFor, rankProgress, styleBonus, trophies, vitals,
  type Grade,
} from "../src/theatre/gamify.js";

const runs = numRuns(100);
const times = fc.array(fc.integer({ min: 0, max: 10_000_000 }), { maxLength: 30 });
const limb = fc.record(
  {
    ecosystem: fc.constantFrom("npm", "pypi"),
    name: fc.string({ maxLength: 12 }),
    epss: fc.double({ min: 0, max: 1, noNaN: true }),
    kev: fc.boolean(),
    state: fc.constantFrom("Healed", "Rotting", "Possessed", "Healthy"),
  },
  { requiredKeys: ["name"] },
);
const limbs = fc.array(limb, { maxLength: 12 });
const rank = (g: Grade) => GRADES.indexOf(g);

describe("combo", () => {
  it("property: the multiplier stays within 1..3 and rises with the chain", () => {
    fc.assert(fc.property(fc.nat(100), (n) => {
      const m = multiplierFor(n);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(3);
      expect(multiplierFor(n + 1)).toBeGreaterThanOrEqual(m);
    }), { numRuns: runs });
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(1)).toBe(1);
    expect(multiplierFor(100)).toBe(3);
  });
  it("property: chain length drives the state and the multiplier stays in range", () => {
    fc.assert(fc.property(times, (t) => {
      const c = comboState(t);
      expect(c.chain).toBeLessThanOrEqual(t.length);
      expect(c.best).toBeGreaterThanOrEqual(c.chain);
      expect(c.multiplier).toBe(multiplierFor(c.chain));
    }), { numRuns: runs });
  });
  it("chains heals inside the window and starts over after a gap", () => {
    expect(comboState([0, 30_000, 60_000]).chain).toBe(3);
    expect(comboState([0, 30_000, 200_000]).chain).toBe(1);
    expect(comboState([0, 30_000, 200_000]).best).toBe(2);
  });
  it("property: the combo resets once now is past the window after the last heal", () => {
    fc.assert(fc.property(times.filter((t) => t.length > 0), fc.integer({ min: 1, max: 1_000_000 }), (t, extra) => {
      const last = Math.max(...t);
      const c = comboState(t, COMBO_WINDOW_MS, last + COMBO_WINDOW_MS + extra);
      expect(c.chain).toBe(0);
      expect(c.multiplier).toBe(1);
    }), { numRuns: runs });
  });
  it("style bonus is display only and never changes the team score", () => {
    expect(styleBonus(2, 1)).toBe(0);
    expect(styleBonus(2, 3)).toBe(4);
    expect(styleBonus(-1, 9)).toBe(0);
    fc.assert(fc.property(limbs, (l) => {
      const before = teamScore(l as RaidLimb[]);
      comboState([1, 2, 3]);
      bossLimbs(l as RaidLimb[]);
      expect(teamScore(l as RaidLimb[])).toBe(before);
    }), { numRuns: runs });
  });
});

describe("bosses", () => {
  it("picks KEV limbs with EPSS 0.5 or more, else the top-ranked KEV limb", () => {
    const a = { ecosystem: "npm", name: "a", epss: 0.7, kev: true };
    const b = { ecosystem: "npm", name: "b", epss: 0.1, kev: true };
    const c = { ecosystem: "npm", name: "c", epss: 0.9, kev: false };
    expect(bossLimbs([a, b, c])).toEqual([a]);
    expect(bossLimbs([b, { ...b, name: "d", epss: 0.3 }]).map((l) => l.name)).toEqual(["d"]);
    expect(bossLimbs([c])).toEqual([]);
  });
  it("property: every boss is KEV, and some KEV limb always yields at least one boss", () => {
    fc.assert(fc.property(limbs, (l) => {
      const bosses = bossLimbs(l as RaidLimb[]);
      for (const x of bosses) expect(x.kev).toBe(true);
      if ((l as RaidLimb[]).some((x) => x.kev === true)) expect(bosses.length).toBeGreaterThan(0);
      expect(bossLimbs([...(l as RaidLimb[])].reverse())).toEqual(bosses);
    }), { numRuns: runs });
  });
});

describe("trophies", () => {
  const stats = { healed: 0, elapsedMs: 0, nights: 0, bestChain: 0 };
  const ids = (l: RaidLimb[], s = stats) => trophies(l, s).filter((t) => t.earned).map((t) => t.id);
  it("is a fixed shelf with an id, title and description each", () => {
    const shelf = trophies([], stats);
    expect(shelf.map((t) => t.title)).toEqual(["First Blood", "Chain of 3", "Boss Slain", "Clean Sweep", "Nights Without Possession", "Under Ten Minutes"]);
    for (const t of shelf) { expect(t.id).toBeTruthy(); expect(t.description).toBeTruthy(); expect(t.earned).toBe(false); }
  });
  it("awards plates from team figures", () => {
    const healedBoss: RaidLimb = { ecosystem: "npm", name: "x", epss: 0.8, kev: true, state: "Healthy", healed: true };
    expect(ids([healedBoss], { healed: 1, elapsedMs: 300_000, nights: 3, bestChain: 3 }).sort()).toEqual(
      ["boss-slain", "chain-3", "clean-sweep", "first-blood", "nights-3", "under-ten"]);
    const sick: RaidLimb = { ecosystem: "npm", name: "y", epss: 0.1, state: "Rotting" };
    expect(ids([healedBoss, sick], { healed: 1, elapsedMs: 300_000, nights: 0, bestChain: 1 })).toEqual(["first-blood", "boss-slain"]);
    expect(ids([healedBoss], { healed: 1, elapsedMs: 700_000, nights: 0, bestChain: 1 })).not.toContain("under-ten");
  });
  it("property: same input, same shelf", () => {
    fc.assert(fc.property(limbs, fc.nat(20), fc.nat(RAID_MS), (l, h, ms) => {
      const s = { healed: h, elapsedMs: ms, nights: 1, bestChain: 2 };
      expect(trophies(l as RaidLimb[], s)).toEqual(trophies(l as RaidLimb[], s));
    }), { numRuns: runs });
  });
});

describe("grade", () => {
  it("property: grade never drops as healed rises", () => {
    fc.assert(fc.property(fc.nat(30), fc.nat(RAID_MS), (h, ms) => {
      expect(rank(gradeFor({ healed: h + 1, elapsedMs: ms }))).toBeGreaterThanOrEqual(rank(gradeFor({ healed: h, elapsedMs: ms })));
    }), { numRuns: runs });
  });
  it("property: grade never rises as time passes", () => {
    fc.assert(fc.property(fc.nat(30), fc.nat(RAID_MS), fc.nat(RAID_MS), (h, a, b) => {
      const [early, late] = a <= b ? [a, b] : [b, a];
      expect(rank(gradeFor({ healed: h, elapsedMs: late }))).toBeLessThanOrEqual(rank(gradeFor({ healed: h, elapsedMs: early })));
    }), { numRuns: runs });
  });
  it("spans D to S and survives junk", () => {
    expect(gradeFor({ healed: 0, elapsedMs: 0 })).toBe("D");
    expect(gradeFor({ healed: 12, elapsedMs: 0 })).toBe("S");
    expect(GRADES).toContain(gradeFor({ healed: NaN, elapsedMs: Infinity }));
  });
});

describe("vitals and rank progress", () => {
  it("property: health in 0..100, bpm in 50..160 and bpm rises as health falls", () => {
    fc.assert(fc.property(limbs, (l) => {
      const v = vitals(l as RaidLimb[]);
      expect(v.health).toBeGreaterThanOrEqual(0);
      expect(v.health).toBeLessThanOrEqual(100);
      expect(v.bpm).toBeGreaterThanOrEqual(50);
      expect(v.bpm).toBeLessThanOrEqual(160);
    }), { numRuns: runs });
    expect(vitals([])).toEqual({ bpm: 50, health: 100 });
    expect(vitals([{ state: "Possessed", epss: 0.1 }])).toEqual({ bpm: 160, health: 0 });
  });
  it("names the next rank and the heals still needed", () => {
    expect(rankProgress(0)).toEqual({ next: "Surgeon", need: 3 });
    expect(rankProgress(3)).toEqual({ next: "Resurrectionist", need: 4 });
    expect(rankProgress(7)).toEqual({ next: null, need: 0 });
    fc.assert(fc.property(fc.nat(20), (h) => {
      const p = rankProgress(h);
      if (p.next) expect(rankFor(h + p.need)).toBe(p.next);
    }), { numRuns: runs });
  });
});

describe("epitaphs", () => {
  it("has four or more variants per grade and they are deterministic", () => {
    for (const g of GRADES) expect(GRADE_EPITAPHS[g].length).toBeGreaterThanOrEqual(4);
    fc.assert(fc.property(fc.constantFrom(...GRADES), fc.string({ maxLength: 40 }), (g, seed) => {
      expect(epitaphFor(g, seed)).toBe(epitaphFor(g, seed));
      expect(GRADE_EPITAPHS[g]).toContain(epitaphFor(g, seed));
    }), { numRuns: runs });
  });
  it("uses no em dashes", () => {
    for (const g of GRADES) for (const e of GRADE_EPITAPHS[g]) expect(e).not.toContain("\u2014");
  });
});
