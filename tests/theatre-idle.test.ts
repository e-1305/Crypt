import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { IDLE_MS, MAX_FPS, MAX_PIXEL_RATIO, frameDue, pixelRatioFor, shouldRender, type RenderState } from "../src/theatre/caps.js";

const base: RenderState = { now: 10_000, lastInputAt: 10_000, dollyActive: false, flashActive: false, texDirty: false, visible: true };

describe("shouldRender", () => {
  it("renders right after input and stops once idle for IDLE_MS", () => {
    expect(shouldRender(base)).toBe(true);
    expect(shouldRender({ ...base, now: 10_000 + IDLE_MS - 1 })).toBe(true);
    expect(shouldRender({ ...base, now: 10_000 + IDLE_MS })).toBe(false);
  });
  it("keeps rendering while a dolly, flash or texture update is pending", () => {
    const idle = { ...base, now: 10_000 + IDLE_MS * 5 };
    expect(shouldRender(idle)).toBe(false);
    expect(shouldRender({ ...idle, dollyActive: true })).toBe(true);
    expect(shouldRender({ ...idle, flashActive: true })).toBe(true);
    expect(shouldRender({ ...idle, texDirty: true })).toBe(true);
  });
  it("never renders when not visible", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), fc.integer({ min: 0, max: 100_000 }), (d, f, t, now) => {
        expect(shouldRender({ now, lastInputAt: now, dollyActive: d, flashActive: f, texDirty: t, visible: false })).toBe(false);
      }),
    );
  });
  it("fails open to rendering on a bad timestamp", () => {
    expect(shouldRender({ ...base, now: Number.NaN })).toBe(true);
  });
});

describe("frameDue", () => {
  it("caps at 30 fps but lets a 60 Hz display land on every second frame", () => {
    expect(MAX_FPS).toBe(30);
    expect(frameDue(1000 + 16.7, 1000)).toBe(false);
    expect(frameDue(1000 + 33.3, 1000)).toBe(true);
    expect(frameDue(0, -1e9)).toBe(true);
  });
  it("never renders more than 30 fps on a 144 Hz clock", () => {
    let last = -1e9, n = 0;
    for (let t = 0; t < 10_000; t += 1000 / 144) if (frameDue(t, last)) { last = t; n++; }
    expect(n).toBeLessThanOrEqual(31 * 10);
  });
});

describe("pixelRatioFor", () => {
  it("caps at 1.5 and defaults to 1", () => {
    expect(MAX_PIXEL_RATIO).toBe(1.5);
    expect(pixelRatioFor(2)).toBe(1.5);
    expect(pixelRatioFor(1)).toBe(1);
    expect(pixelRatioFor(undefined)).toBe(1);
    expect(pixelRatioFor(Number.NaN)).toBe(1);
    fc.assert(fc.property(fc.double({ noNaN: true, min: -5, max: 10 }), (d) => {
      const r = pixelRatioFor(d);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(1.5);
    }));
  });
});
