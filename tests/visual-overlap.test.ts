import { describe, expect, it } from "vitest";
// @ts-expect-error plain ES module without types
import { findOverlaps, intersects } from "../scripts/ci/overlap.mjs";

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
});
