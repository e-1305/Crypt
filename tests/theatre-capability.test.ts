import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { decideTheatre } from "../src/theatre/capability.js";
import { tailRows, wrapLine } from "../src/theatre/screen-text.js";

const base = { webgl2: true, reducedMotion: false, highContrast: false, flag: null };

describe("decideTheatre", () => {
  it("mounts 3D only when everything allows it", () => {
    expect(decideTheatre(base)).toEqual({ mode: "3d", reason: "ok" });
  });
  it("falls back for each blocker", () => {
    expect(decideTheatre({ ...base, webgl2: false }).reason).toBe("no-webgl2");
    expect(decideTheatre({ ...base, reducedMotion: true }).reason).toBe("reduced-motion");
    expect(decideTheatre({ ...base, highContrast: true }).reason).toBe("high-contrast");
    expect(decideTheatre({ ...base, flag: "off" }).reason).toBe("flag-off");
    expect(decideTheatre({ ...base, flag: "OFF" }).mode).toBe("2d");
  });
  it("property: any blocker means 2D, and other flag values do not block", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), fc.option(fc.string(), { nil: null }), (webgl2, reducedMotion, highContrast, flag) => {
        const d = decideTheatre({ webgl2, reducedMotion, highContrast, flag });
        const blocked = !webgl2 || reducedMotion || highContrast || (flag !== null && flag.toLowerCase() === "off");
        return (d.mode === "2d") === blocked;
      }),
    );
  });
});

describe("screen text", () => {
  it("wraps at spaces and hard-cuts long words", () => {
    expect(wrapLine("aaa bbb ccc", 7)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapLine("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    expect(wrapLine("", 5)).toEqual([""]);
  });
  it("property: rows never exceed width or count", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 20 }), fc.integer({ min: 1, max: 40 }), fc.integer({ min: 0, max: 30 }), (lines, cols, rows) => {
        const out = tailRows(lines, cols, rows);
        return out.length <= rows && out.every((r) => r.length <= cols);
      }),
    );
  });
});
