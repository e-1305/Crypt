// Limbs look like their state (#308): glow follows EPSS, rot droops, healed limbs wear a bandage, no drips under reduced motion.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { glowOf, droopOf, layoutCreature } from "../src/theatre/creature3d-layout.js";

const src = readFileSync(resolve(import.meta.dirname, "..", "web/theatre/creature3d.js"), "utf8");

describe("creature 3D limb state cues", () => {
  it("maps EPSS to emissive intensity 0.3..1.0, monotonic, clamped, safe on bad input", () => {
    expect(glowOf(0)).toBe(0.3);
    expect(glowOf(1)).toBe(1);
    expect(glowOf(0.5)).toBeGreaterThan(glowOf(0.1));
    expect(glowOf(7)).toBe(1);
    expect(glowOf(-1)).toBe(0.3);
    expect(glowOf(NaN)).toBe(0.3);
  });
  it("carries a clamped epss on each laid-out limb, 0 when absent", () => {
    const out = layoutCreature({ limbs: [{ name: "a", state: "Possessed", epss: 0.8, rank: 1 }, { name: "b", state: "Rotting", epss: "x", rank: 2 }] });
    expect(out.map((l) => l.epss)).toEqual([0.8, 0]);
  });
  it("droops Rotting limbs most and leaves Possessed and Healthy straight", () => {
    expect(droopOf("Rotting")).toBeGreaterThan(droopOf("Unknown"));
    expect(droopOf("Possessed")).toBe(0);
    expect(droopOf("Healthy")).toBe(0);
  });
  it("bends the tube with droopOf, glows with glowOf, wraps Healed limbs", () => {
    expect(src).toMatch(/-0\.18 - droopOf\(l\.state\)/);
    expect(src).toMatch(/glowOf\(l\.epss\)/);
    expect(src).toMatch(/if \(l\.state === "Healed"\)/);
    expect(src).toMatch(/if \(l\.state === "Healthy"\) m\.material\.color\.lerp/);
  });
  it("makes drips only when motion is allowed and flashes green only at heal time", () => {
    expect(src).toMatch(/if \(!reduced && dripSrc\.length < MAX_DRIP_LIMBS\)/);
    expect(src).toMatch(/healedNow\.includes\(l\) && !reduced/);
    expect(src).toMatch(/if \(drips\) stepDrips\(now\)/);
  });
});
