import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DOLLY_MS,
  TITLE_CARD_MS,
  TITLE_CARD_TEXT,
  dollyProgress,
  parseRecordFlag,
  recordModeAfterKey,
  shouldShowTitleCard,
  titleCardVisible,
} from "../src/theatre/polish.js";

describe("title card", () => {
  it("has the verbatim text and a 3 second length", () => {
    expect(TITLE_CARD_TEXT).toBe("CRYPT \u2014 Don't abandon your creature.");
    expect(TITLE_CARD_MS).toBe(3000);
  });
  it("shows for 3 seconds then clears", () => {
    expect(titleCardVisible(0, false)).toBe(true);
    expect(titleCardVisible(2999, false)).toBe(true);
    expect(titleCardVisible(3000, false)).toBe(false);
  });
  it("a skip clears it at any time", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 10000 }), (t) => titleCardVisible(t, true) === false));
  });
  it("only on 3D without reduced motion", () => {
    expect(shouldShowTitleCard({ mode3d: true, reducedMotion: false })).toBe(true);
    expect(shouldShowTitleCard({ mode3d: true, reducedMotion: true })).toBe(false);
    expect(shouldShowTitleCard({ mode3d: false, reducedMotion: false })).toBe(false);
  });
});

describe("recording mode", () => {
  it("parses the flag", () => {
    expect(parseRecordFlag("?record=1")).toBe(true);
    expect(parseRecordFlag("?theatre=off&record=TRUE")).toBe(true);
    expect(parseRecordFlag("?record=on")).toBe(true);
    expect(parseRecordFlag("")).toBe(false);
    expect(parseRecordFlag("?record=0")).toBe(false);
    expect(parseRecordFlag("?record=")).toBe(false);
    expect(parseRecordFlag("?record=yes")).toBe(false);
  });
  it("Escape leaves it and nothing else changes it", () => {
    expect(recordModeAfterKey(true, "Escape")).toBe(false);
    expect(recordModeAfterKey(true, "a")).toBe(true);
    expect(recordModeAfterKey(false, "Escape")).toBe(false);
    fc.assert(fc.property(fc.string(), (k) => recordModeAfterKey(false, k) === false));
  });
});

describe("dolly", () => {
  it("starts at 0, ends at 1, instant under reduced motion", () => {
    expect(dollyProgress(0, false)).toBe(0);
    expect(dollyProgress(DOLLY_MS, false)).toBe(1);
    expect(dollyProgress(0, true)).toBe(1);
  });
  it("property: stays in [0,1] and never goes backwards", () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 3000 }), fc.integer({ min: 0, max: 500 }), (t, d) => {
        const a = dollyProgress(t, false);
        const b = dollyProgress(t + d, false);
        return a >= 0 && a <= 1 && b >= a;
      }),
    );
  });
});
