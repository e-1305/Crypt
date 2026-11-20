// 3D heal burst: a limb that turns Healed flashes, never under reduced motion, and cleans up after itself.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(import.meta.dirname, "..", "web/theatre/creature3d.js"), "utf8");

describe("creature 3D heal burst", () => {
  it("fires only for a limb going from Possessed or Rotting to Healed", () => {
    expect(src).toMatch(/l\.state === "Healed" && \(prevState\.get\(l\.id\) === "Possessed" \|\| prevState\.get\(l\.id\) === "Rotting"\)/);
  });
  it("is skipped under reduced motion", () => {
    expect(src).toMatch(/if \(!reduced\) for \(const l of healedNow\) startBurst\(l\)/);
  });
  it("ends every burst and frees its resources on dispose", () => {
    expect(src).toMatch(/bursts\.forEach\(endBurst\); bursts = \[\]; burstGeo\.dispose\(\)/);
    expect(src).toMatch(/b\.mesh\.material\.dispose\(\); b\.el\.remove\(\)/);
  });
  it("writes only text into the page (no innerHTML)", () => {
    expect(src).not.toMatch(/innerHTML|insertAdjacentHTML/);
  });
});
