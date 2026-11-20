import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../web/theatre/creature3d.js", import.meta.url), "utf8");
const theatre = readFileSync(new URL("../web/theatre.js", import.meta.url), "utf8");

describe("Creature 3D view wiring", () => {
  it("loads three.js only by dynamic import, on use (#233)", () => {
    expect(src).not.toMatch(/^\s*import[^(]*from\s*["'][^"']*three/m);
    expect(src).toMatch(/await import\("\.\.\/vendor\/three\.module\.min\.js"\)/);
    expect(theatre).not.toMatch(/^\s*import[^(]*from\s*["']\.\/theatre\/creature3d/m);
  });
  it("uses the layout, the limb cap and the frame guard (#234), one InstancedMesh per shape", () => {
    expect(src).toContain("layoutCreature");
    expect(src).toMatch(/capLimbs\(all, MAX_LIMBS\)/);
    expect(src).toContain("isSlowDevice");
    expect(src).toContain("InstancedMesh");
  });
  it("keeps the 2D plate without WebGL and draws one still frame under reduced motion", () => {
    expect(src).toMatch(/!hasWebgl\(\)\) return/);
    expect(src).toMatch(/if \(!reduced\) raf = requestAnimationFrame/);
  });
});
