import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { GUARD_FRAMES, capLimbs, isSlowDevice, moreLabel } from "../src/theatre/caps.js";

describe("capLimbs", () => {
  it("never shows more than max and keeps shown + more = input length", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 200 }), fc.integer({ min: -5, max: 300 }), (limbs, max) => {
        const r = capLimbs(limbs, max);
        expect(r.shown.length).toBeLessThanOrEqual(Math.max(0, max));
        expect(r.shown.length + r.more).toBe(limbs.length);
        expect(r.shown).toEqual(limbs.slice(0, r.shown.length));
      }),
    );
  });
  it("labels the aggregate", () => {
    expect(capLimbs([1, 2, 3], 2)).toEqual({ shown: [1, 2], more: 1 });
    expect(moreLabel(3)).toBe("3 more");
    expect(moreLabel(0)).toBe("");
  });
});

describe("isSlowDevice", () => {
  it("flags slow deltas and passes fast ones", () => {
    expect(isSlowDevice(Array(GUARD_FRAMES).fill(100))).toBe(true);
    expect(isSlowDevice(Array(GUARD_FRAMES).fill(16.7))).toBe(false);
  });
  it("ignores one-off spikes (median) and waits for enough frames", () => {
    expect(isSlowDevice([16, 16, 16, 16, 16, 16, 16, 16, 16, 900])).toBe(false);
    expect(isSlowDevice([100, 100, 100])).toBe(false);
    expect(isSlowDevice([])).toBe(false);
  });
});

describe("shouldRunGuard", () => {
  it("skips the frame guard only for automated browsers", async () => {
    const { shouldRunGuard } = await import("../src/theatre/caps.js");
    expect(shouldRunGuard(true)).toBe(false);
    expect(shouldRunGuard(false)).toBe(true);
    expect(shouldRunGuard(undefined)).toBe(true);
  });
});
