import { describe, expect, it } from "vitest";
// @ts-expect-error plain ES module without types
import { filterFixedBoxes, findOverlaps, intersects, isFullViewport } from "../scripts/ci/overlap.mjs";

const box = (name: string, x: number, y: number, width: number, height: number) => ({ name, x, y, width, height });

describe("visual QA overlap helper", () => {
  it("flags a synthetic overlapping pair", () => {
    expect(findOverlaps([box("a", 0, 0, 100, 40), box("b", 50, 20, 100, 40)])).toEqual([["a", "b"]]);
  });
  it("passes boxes that touch or sit apart", () => {
    expect(findOverlaps([box("a", 0, 0, 100, 40), box("b", 100, 0, 100, 40), box("c", 0, 60, 100, 40)])).toEqual([]);
  });
  it("ignores sub-pixel rounding overlap", () => {
    expect(intersects(box("a", 0, 0, 100, 40), box("b", 99.5, 0, 100, 40))).toBe(false);
  });
  it("treats near-full-viewport boxes as overlays", () => {
    expect(isFullViewport(box("o", 0, 0, 1440, 900), 1440, 900)).toBe(true);
    expect(isFullViewport(box("bar", 0, 800, 1440, 60), 1440, 900)).toBe(false);
  });
  it("drops overlays and 1px hidden boxes from fixed boxes", () => {
    const kept = filterFixedBoxes([box("canvas", 0, 0, 1440, 900), box("sr", 0, 0, 1, 1), box("raid", 16, 800, 300, 60)], 1440, 900);
    expect(kept.map((b: { name: string }) => b.name)).toEqual(["raid"]);
  });
});
