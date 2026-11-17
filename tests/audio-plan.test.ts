import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { beatIntervalMs, countPossessed, heartbeatBpm, MAX_BPM, MIN_BPM } from "../src/theatre/audio-plan.js";

describe("audio plan", () => {
  it("heartbeat BPM is monotonic in the possessed count", () => {
    fc.assert(fc.property(fc.nat(100), fc.nat(100), (a, b) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return heartbeatBpm(lo) <= heartbeatBpm(hi);
    }));
  });
  it("increases with the first possessed limbs and is clamped", () => {
    expect(heartbeatBpm(0)).toBe(MIN_BPM);
    expect(heartbeatBpm(1)).toBeGreaterThan(heartbeatBpm(0));
    expect(heartbeatBpm(3)).toBeGreaterThan(heartbeatBpm(2));
    expect(heartbeatBpm(1000)).toBe(MAX_BPM);
    fc.assert(fc.property(fc.double({ noNaN: false }), (n) => {
      const b = heartbeatBpm(n);
      return b >= MIN_BPM && b <= MAX_BPM;
    }));
  });
  it("treats bad input as zero", () => {
    for (const v of [NaN, -5, Infinity * -1]) expect(heartbeatBpm(v)).toBe(MIN_BPM);
  });
  it("beat interval matches the BPM", () => {
    expect(beatIntervalMs(0)).toBeCloseTo(60000 / MIN_BPM);
  });
  it("counts only Possessed limbs", () => {
    expect(countPossessed([{ state: "Possessed" }, { state: "Rotting" }, null, { state: "Possessed" }])).toBe(2);
    expect(countPossessed("x")).toBe(0);
  });
});
