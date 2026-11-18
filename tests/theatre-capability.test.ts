import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { decideTheatre } from "../src/theatre/capability.js";
import { tailRows, wrapLine } from "../src/theatre/screen-text.js";

const base = { webgl2: true, reducedMotion: false, highContrast: false, flag: null, viewportWidth: 1280, coarsePointer: false };

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
    expect(decideTheatre({ ...base, flag: "2d" }).mode).toBe("2d");
  });
  it("small screens default to 2D, ?theatre=3d forces 3D", () => {
    expect(decideTheatre({ ...base, viewportWidth: 390 })).toEqual({ mode: "2d", reason: "small-screen" });
    expect(decideTheatre({ ...base, viewportWidth: 899 }).reason).toBe("small-screen");
    expect(decideTheatre({ ...base, viewportWidth: 900 }).mode).toBe("3d");
    expect(decideTheatre({ ...base, coarsePointer: true }).reason).toBe("small-screen");
    expect(decideTheatre({ ...base, viewportWidth: 390, flag: "3d" })).toEqual({ mode: "3d", reason: "ok" });
    expect(decideTheatre({ ...base, viewportWidth: 390, flag: "3d", webgl2: false }).reason).toBe("no-webgl2");
    expect(decideTheatre({ ...base, viewportWidth: 390, flag: "3d", reducedMotion: true }).reason).toBe("reduced-motion");
  });
  it("property: any blocker means 2D, and other flag values do not block", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), fc.option(fc.string(), { nil: null }), fc.integer({ min: 200, max: 2400 }), fc.boolean(), (webgl2, reducedMotion, highContrast, flag, viewportWidth, coarsePointer) => {
        const d = decideTheatre({ webgl2, reducedMotion, highContrast, flag, viewportWidth, coarsePointer });
        const f = flag === null ? null : flag.toLowerCase();
        const small = f !== "3d" && (viewportWidth < 900 || coarsePointer);
        const blocked = !webgl2 || reducedMotion || highContrast || f === "off" || f === "2d" || small;
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
