import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  EPITAPHS, KEV_WEIGHT, RAID_MS, SLA_KEV_MS, createRaidTimer, countsForScore, epitaph, formatClock, healedCount,
  isRaidCommand, nightsWithoutPossession, praiseLines, rankFor, riskOf, teamScore, type RaidLimb,
} from "../src/theatre/raid.js";
import { cardData, cardLines } from "../src/theatre/card.js";

const epss = fc.double({ min: 0, max: 1, noNaN: true });
const limb = fc.record({
  ecosystem: fc.constantFrom("npm", "pypi"),
  name: fc.string({ minLength: 1, maxLength: 12 }),
  epss: fc.option(epss, { nil: undefined }),
  kev: fc.boolean(),
  healed: fc.boolean(),
  status: fc.constantFrom(undefined, "awaiting-human-merge", "other"),
});

describe("riskOf", () => {
  it("is monotonic in EPSS", () => {
    fc.assert(fc.property(epss, epss, fc.boolean(), (a, b, kev) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      expect(riskOf({ epss: lo, kev })).toBeLessThanOrEqual(riskOf({ epss: hi, kev }));
    }));
  });
  it("KEV outranks non-KEV at the same EPSS", () => {
    fc.assert(fc.property(epss, (e) => {
      expect(riskOf({ epss: e, kev: true })).toBeGreaterThanOrEqual(riskOf({ epss: e, kev: false }));
      if (e > 0) expect(riskOf({ epss: e, kev: true })).toBeGreaterThan(riskOf({ epss: e, kev: false }));
    }));
  });
  it("treats missing or invalid EPSS as zero", () => {
    for (const e of [undefined, null, NaN, -1, 2, "0.5"]) expect(riskOf({ epss: e, kev: true })).toBe(0);
  });
});

describe("teamScore", () => {
  it("equals the sum of EPSS x KEV weight over healed or awaiting-human-merge limbs", () => {
    const limbs: RaidLimb[] = [
      { epss: 0.5, kev: true, healed: true },
      { epss: 0.2, kev: false, status: "awaiting-human-merge" },
      { epss: 0.9, kev: true, state: "Possessed" },
      { epss: 0.1, kev: false, state: "Healed" },
    ];
    expect(teamScore(limbs)).toBeCloseTo(0.5 * KEV_WEIGHT + 0.2 + 0.1, 10);
  });
  it("never decreases as limbs heal", () => {
    fc.assert(fc.property(fc.array(limb, { maxLength: 12 }), fc.nat(), (limbs, k) => {
      const i = limbs.length === 0 ? 0 : k % limbs.length;
      const after = limbs.map((l, j) => (j === i ? { ...l, healed: true } : l));
      expect(teamScore(after)).toBeGreaterThanOrEqual(teamScore(limbs) - 1e-12);
    }));
  });
  it("counts only qualifying limbs", () => {
    fc.assert(fc.property(fc.array(limb, { maxLength: 12 }), (limbs) => {
      expect(teamScore(limbs)).toBeCloseTo(limbs.filter(countsForScore).reduce((s, l) => s + riskOf(l), 0), 9);
    }));
  });
});

describe("rankFor", () => {
  it("has the three thresholds and never goes down", () => {
    expect(rankFor(0)).toBe("Apprentice");
    expect(rankFor(2)).toBe("Apprentice");
    expect(rankFor(3)).toBe("Surgeon");
    expect(rankFor(6)).toBe("Surgeon");
    expect(rankFor(7)).toBe("Resurrectionist");
    const order = ["Apprentice", "Surgeon", "Resurrectionist"];
    fc.assert(fc.property(fc.nat(50), fc.nat(50), (a, b) => {
      expect(order.indexOf(rankFor(Math.min(a, b)))).toBeLessThanOrEqual(order.indexOf(rankFor(Math.max(a, b))));
    }));
  });
  it("is earned by heals, not by awaiting merges", () => {
    const l: RaidLimb[] = Array.from({ length: 9 }, () => ({ status: "awaiting-human-merge", epss: 1 }));
    expect(healedCount(l)).toBe(0);
  });
});

describe("nightsWithoutPossession", () => {
  const DAY = 86400000;
  it("counts from scan start when nothing breached", () => {
    expect(nightsWithoutPossession([{ kev: true, detectedAt: 0 }], 10 * 3600 * 1000, 0)).toBe(0);
    expect(nightsWithoutPossession([], 5 * DAY + 5, 0)).toBe(5);
  });
  it("is zero while a KEV limb is open past 48h", () => {
    expect(nightsWithoutPossession([{ kev: true, detectedAt: 0 }], 4 * DAY, 0)).toBe(0);
  });
  it("counts from the moment a breached limb was healed", () => {
    const l = [{ kev: true, healed: true, detectedAt: 0, resolvedAt: 3 * DAY }];
    expect(nightsWithoutPossession(l, 5 * DAY, 0)).toBe(2);
  });
  it("ignores limbs healed inside the SLA", () => {
    const l = [{ kev: true, healed: true, detectedAt: 0, resolvedAt: SLA_KEV_MS }];
    expect(nightsWithoutPossession(l, 5 * DAY, 0)).toBe(5);
  });
  it("is never negative", () => {
    fc.assert(fc.property(fc.array(limb, { maxLength: 6 }), fc.integer({ min: -1e9, max: 1e12 }), (limbs, now) => {
      expect(nightsWithoutPossession(limbs, now, 0)).toBeGreaterThanOrEqual(0);
    }));
  });
});

describe("epitaph", () => {
  it("is deterministic and drawn from the fixed list", () => {
    fc.assert(fc.property(fc.string(), (seed) => {
      expect(epitaph(seed)).toBe(epitaph(seed));
      expect(EPITAPHS).toContain(epitaph(seed));
    }));
  });
});

describe("raid timer", () => {
  it("never exceeds 15:00 and ends exactly there", () => {
    let t = 1000;
    const timer = createRaidTimer(() => t);
    expect(timer.view().status).toBe("idle");
    timer.start();
    t += RAID_MS - 1;
    expect(timer.view().status).toBe("running");
    t += 1;
    expect(timer.view()).toEqual({ status: "done", elapsedMs: RAID_MS, remainingMs: 0 });
    expect(formatClock(timer.view().remainingMs)).toBe("00:00");
    fc.assert(fc.property(fc.integer({ min: -1e6, max: 1e10 }), (dt) => {
      t = 1000 + dt;
      const v = timer.view();
      expect(v.elapsedMs).toBeLessThanOrEqual(RAID_MS);
      expect(v.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(v.elapsedMs + v.remainingMs).toBe(RAID_MS);
    }));
  });
  it("shows 15:00 at the start and ignores a second start", () => {
    let t = 0;
    const timer = createRaidTimer(() => t);
    timer.start();
    expect(formatClock(timer.view().remainingMs)).toBe("15:00");
    t = 5000;
    timer.start();
    expect(timer.view().elapsedMs).toBe(5000);
  });
  it("recognises only the RAID command", () => {
    expect(isRaidCommand("RAID")).toBe(true);
    expect(isRaidCommand(" raid ")).toBe(true);
    expect(isRaidCommand("RAID NOW")).toBe(false);
    expect(isRaidCommand(5)).toBe(false);
  });
});

describe("blameless output", () => {
  const banned = /\b(blame|blamed|fault|failed by|worst|leaderboard|rank(ed)? by person|shame)\b/i;
  it("praise names people only as 'healed by' and orders by limb", () => {
    const l: RaidLimb[] = [
      { ecosystem: "npm", name: "zed", healed: true, healedBy: "@bo" },
      { ecosystem: "npm", name: "abe", healed: true, healedBy: "@al" },
      { ecosystem: "npm", name: "mid", healed: false, healedBy: "@cy" },
    ];
    expect(praiseLines(l)).toEqual(["abe healed by @al", "zed healed by @bo"]);
  });
  it("praise output is independent of which person healed which limb's count", () => {
    fc.assert(fc.property(fc.array(limb, { maxLength: 10 }), (limbs) => {
      for (const p of praiseLines(limbs.map((l) => ({ ...l, healedBy: "@x" })))) expect(p).toMatch(/ healed by @x$/);
    }));
  });
  it("card and epitaphs contain no blame wording, owners or per-person figures", () => {
    fc.assert(fc.property(fc.array(limb, { maxLength: 10 }), fc.string(), fc.nat(RAID_MS * 2), (limbs, repo, ms) => {
      const text = cardLines(cardData(repo, limbs, ms)).join("\n");
      expect(text).not.toMatch(banned);
      expect(text).not.toMatch(/@[\w-]+\//);
    }));
    for (const e of EPITAPHS) expect(e).not.toMatch(banned);
  });
});

describe("cardData", () => {
  it("reports healed limbs, risk, time and rank", () => {
    const gained: RaidLimb[] = [{ epss: 0.5, kev: true, healed: true }, { epss: 0.25, healed: true }];
    const c = cardData("my-repo", gained, RAID_MS + 5000);
    expect(c.limbsHealed).toBe(2);
    expect(c.riskRemoved).toBe("1.75");
    expect(c.time).toBe("15:00");
    expect(c.rank).toBe("Apprentice");
    expect(cardData("my-repo", gained, RAID_MS + 5000)).toEqual(c);
  });
  it("cleans the repo name to printable ASCII and is bounded", () => {
    const c = cardData("re\u0000po\u202e" + "x".repeat(100), [], 0);
    expect(c.repo).toMatch(/^[\x20-\x7e]{1,40}$/);
  });
  it("is stable for a raid with no heals", () => {
    expect(cardData(undefined, [], 0).limbsHealed).toBe(0);
  });
});
