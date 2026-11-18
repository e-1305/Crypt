// Issue #41 item 4: shared team record (team.scanStart) on creature.json.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { numRuns } from "./runs.js";
import { stampTeam } from "../src/common/team-record.js";
import { plateInput } from "../src/render/plate.js";
import { teamScore } from "../src/theatre/raid.js";

const NOW = 1_000_000_000;
const prev = (scanStart: unknown) => JSON.stringify({ team: { scanStart } });

describe("stampTeam", () => {
  it("keeps a valid previous scanStart", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: NOW }), (s) => {
      expect((stampTeam({}, prev(s), NOW) as unknown as { team: { scanStart: number } }).team.scanStart).toBe(s);
    }), { numRuns: numRuns(100) });
  });
  it("uses now for junk, future, non-positive or non-finite previous values", () => {
    const bad = fc.oneof(fc.string(), fc.constant(null), fc.integer({ max: 0 }), fc.integer({ min: NOW + 1 }), fc.constant("{"));
    fc.assert(fc.property(bad, (b) => {
      for (const raw of [typeof b === "string" ? b : prev(b), prev(b), undefined, 5]) {
        expect((stampTeam({}, raw, NOW) as unknown as { team: { scanStart: number } }).team.scanStart).toBe(NOW);
      }
    }), { numRuns: numRuns(100) });
  });
  it("never throws and never mutates its input", () => {
    fc.assert(fc.property(fc.anything(), fc.anything(), (c, p) => {
      const before = JSON.stringify(c);
      stampTeam(c, p, NOW);
      expect(JSON.stringify(c)).toBe(before);
    }), { numRuns: numRuns(100) });
  });
});

describe("plateInput team record", () => {
  it("passes only a finite scanStart and drops other team keys", () => {
    const c = { limbs: [], team: { scanStart: 5, logins: ["bob"], extra: 1 } };
    expect(plateInput(c).team).toEqual({ scanStart: 5 });
    for (const bad of ["5", null, NaN, Infinity]) expect(plateInput({ limbs: [], team: { scanStart: bad } })).not.toHaveProperty("team");
    expect(plateInput({ limbs: [] })).not.toHaveProperty("team");
  });
  it("team never changes teamScore", () => {
    fc.assert(fc.property(fc.anything(), (t) => {
      const limbs = [{ ecosystem: "npm", name: "a", version: "1", state: "Healed", healed: true, healedBy: "x" }];
      const a = teamScore(plateInput({ limbs }).limbs as never);
      const b = teamScore(plateInput({ limbs, team: t }).limbs as never);
      expect(b).toBe(a);
    }), { numRuns: numRuns(100) });
  });
});
