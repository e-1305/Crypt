import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { anchorOf, layoutBounds, layoutCreature, STATE_COLOR, STATE_SHAPE, stateOf } from "../src/theatre/creature3d-layout.js";

const limb = (name: string, rank: number, state: string, extra: Record<string, unknown> = {}) => ({ id: `npm:${name}@1.0.0`, name, version: "1.0.0", rank, state, ...extra });

describe("3D creature layout", () => {
  it("puts the most urgent limb at the head and keeps rank order", () => {
    const out = layoutCreature({ limbs: [limb("b", 2, "Rotting"), limb("a", 1, "Possessed"), limb("c", 3, "Healthy")] });
    expect(out.map((l) => l.id)).toEqual(["npm:a@1.0.0", "npm:b@1.0.0", "npm:c@1.0.0"]);
    expect(out[0]!.region).toBe("head");
    expect(out[0]!.color).toBe(STATE_COLOR.Possessed);
    expect(out[0]!.label).toContain("Possessed");
  });

  it("never shows unknown as healthy, and state has a non-color cue", () => {
    expect(stateOf({ state: "Healthy", unknown: true })).toBe("Unknown");
    expect(stateOf({ state: "weird" })).toBe("Unknown");
    expect(new Set(Object.values(STATE_SHAPE)).size).toBe(Object.keys(STATE_SHAPE).length);
  });

  it("is safe on bad input", () => {
    expect(layoutCreature(null)).toEqual([]);
    expect(layoutCreature({ limbs: "x" })).toEqual([]);
    expect(layoutCreature({ limbs: [{}, { name: "" }] })).toEqual([]);
  });

  it("lays out every limb exactly once, deterministically, with finite coordinates (property, up to 400 limbs)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: fc.stringMatching(/^[a-z]{1,8}$/), rank: fc.integer({ min: 1, max: 500 }), state: fc.constantFrom("Possessed", "Rotting", "Healed", "Healthy", "Unknown", "x") }), { maxLength: 400 }),
        (rows) => {
          const limbs = rows.map((r, i) => ({ ...r, id: `npm:${r.name}-${i}@1` }));
          const a = layoutCreature({ limbs });
          const b = layoutCreature({ limbs: [...limbs].reverse() });
          if (JSON.stringify(a) !== JSON.stringify(b)) return false;
          if (a.length !== limbs.length) return false;
          if (new Set(a.map((l) => l.id)).size !== a.length) return false;
          return a.every((l) => [l.x, l.y, l.z].every(Number.isFinite) && STATE_COLOR[l.state] === l.color);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("3D creature framing bounds", () => {
  const demo = { limbs: Array.from({ length: 30 }, (_, i) => limb(`pkg${i}`, i + 1, i % 3 === 0 ? "Possessed" : i % 3 === 1 ? "Rotting" : "Healthy")) };
  it("has a non-degenerate box for the demo creature and for an empty one", () => {
    for (const c of [demo, { limbs: [] }]) {
      const b = layoutBounds(layoutCreature(c));
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
      expect(b.radius).toBeGreaterThan(0);
    }
  });
  it("holds every limb and its bone anchor inside the box", () => {
    const limbs = layoutCreature(demo);
    const b = layoutBounds(limbs);
    for (const l of [...limbs, ...limbs.map(anchorOf)]) {
      expect(l.x).toBeGreaterThanOrEqual(b.minX);
      expect(l.x).toBeLessThanOrEqual(b.maxX);
      expect(l.y).toBeGreaterThanOrEqual(b.minY);
      expect(l.y).toBeLessThanOrEqual(b.maxY);
      expect(l.z).toBeGreaterThanOrEqual(b.minZ);
      expect(l.z).toBeLessThanOrEqual(b.maxZ);
    }
  });
});

describe("3D-d: limbs spread around the body", async () => {
  const { layoutCreature: lay, regionCounts } = await import("../src/theatre/creature3d-layout.js");
  const demo = { limbs: Array.from({ length: 7 }, (_, i) => ({ id: "l" + i, name: "pkg" + i, rank: i + 1, state: i === 0 ? "Possessed" : i < 5 ? "Rotting" : "Healthy" })) };
  const out = lay(demo);
  it("puts limbs left, right and below the torso for a 7-limb creature", () => {
    expect(out.some((l) => l.x < -0.5)).toBe(true);
    expect(out.some((l) => l.x > 0.5)).toBe(true);
    expect(out.some((l) => l.y < 1.0)).toBe(true);
    expect(out.filter((l) => l.region === "head")).toHaveLength(1);
    expect(out[0]!.region).toBe("head");
  });
  it("keeps every pair of limbs at least 0.4 apart (up to 60 limbs)", () => {
    for (const n of [2, 7, 20, 60]) {
      const ls = lay({ limbs: Array.from({ length: n }, (_, i) => ({ id: "x" + i, name: "p" + i, rank: i, state: "Rotting" })) });
      for (let a = 0; a < ls.length; a++) for (let b = a + 1; b < ls.length; b++) {
        const d = Math.hypot(ls[a]!.x - ls[b]!.x, ls[a]!.y - ls[b]!.y, ls[a]!.z - ls[b]!.z);
        expect(d, `n=${n} ${a}-${b}`).toBeGreaterThanOrEqual(0.4);
      }
    }
  });
  it("splits counts sanely", () => {
    expect(regionCounts(0)).toEqual([0, 0, 0]);
    expect(regionCounts(1)).toEqual([1, 0, 0]);
    expect(regionCounts(7)).toEqual([1, 3, 2]);
    for (let n = 1; n < 300; n++) { const [h, a, l] = regionCounts(n); expect(h + a + l).toBeLessThanOrEqual(n); }
  });
});
