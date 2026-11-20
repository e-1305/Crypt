// Bench XP HUD: storage never throws, heals count once, the model follows progress.ts.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { numRuns } from "./runs.js";
import { HUD_KEY, HUD_LABEL, hudModel, loadLog, recordHeals, type StorageLike } from "../src/web/progress-hud.js";
import { LEVELS } from "../src/theatre/progress.js";

const mem = (): StorageLike & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};
const throwing: StorageLike = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };

describe("progress HUD storage", () => {
  it("survives blocked storage and bad data", () => {
    expect(loadLog(throwing)).toEqual({});
    expect(loadLog(null)).toEqual({});
    expect(() => recordHeals(throwing, [{ key: "npm:a", kev: true }])).not.toThrow();
    const s = mem();
    for (const bad of ["{", "[1]", "null", '{"a":1}']) { s.data[HUD_KEY] = bad; expect(loadLog(s)).toEqual({}); }
  });
  it("counts a limb once however often it is recorded", () => {
    fc.assert(fc.property(fc.array(fc.record({ key: fc.string(), kev: fc.boolean() }), { maxLength: 20 }), (hs) => {
      const s = mem();
      const once = recordHeals(s, hs);
      const twice = recordHeals(s, hs);
      return JSON.stringify(once) === JSON.stringify(twice) && hudModel(once).xp === hudModel(twice).xp;
    }), { numRuns: numRuns(100) });
  });
  it("persists across loads", () => {
    const s = mem();
    recordHeals(s, [{ key: "npm:a", kev: false }]);
    expect(hudModel(loadLog(s)).xp).toBe(10);
  });
});

describe("hudModel", () => {
  it("starts at level 1 with an empty bar, labelled this browser", () => {
    const m = hudModel({});
    expect(m).toMatchObject({ level: 1, title: LEVELS[0].title, xp: 0, percent: 0, label: HUD_LABEL });
    expect(m.text).toContain("this browser");
  });
  it("keeps the bar in 0..100 and levels up with XP", () => {
    fc.assert(fc.property(fc.array(fc.boolean(), { maxLength: 200 }), (kevs) => {
      const log = Object.fromEntries(kevs.map((k, i) => ["k" + i, k]));
      const m = hudModel(log);
      return m.percent >= 0 && m.percent <= 100 && m.level >= 1 && m.level <= LEVELS.length;
    }), { numRuns: numRuns(100) });
    const big = Object.fromEntries(Array.from({ length: 60 }, (_, i) => ["k" + i, true]));
    expect(hudModel(big).level).toBeGreaterThan(hudModel({ a: true }).level);
  });
});
