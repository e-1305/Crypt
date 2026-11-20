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

describe("3D-c framing and body source guards", () => {
  it("frames the camera from the layout bounds on build and resize, draws body and bones, labels only Possessed and Rotting", () => {
    expect(src).toContain("layoutBounds(");
    expect(src.match(/frameCamera\(\)/g)!.length).toBeGreaterThanOrEqual(2);
    // Flesh pass: a skull sized from BODY.head, a lathe torso, and every limb a tube from its anchor.
    expect(src).toMatch(/SphereGeometry\(hr, /);
    expect(src).toMatch(/hr = BODY\.head\.r/);
    expect(src).toContain("LatheGeometry(");
    expect(src).toContain("TubeGeometry(");
    expect(src).toContain("anchorOf(l)");
    expect(src).toMatch(/l\.state === "Possessed" \|\| l\.state === "Rotting"/);
  });
});
