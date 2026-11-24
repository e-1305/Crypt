// #318: keyboard on the 3D canvas. Arrows cycle limbs and show the card, Enter fills #cmd and focuses it. Nothing is sent.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const file = resolve(ROOT, "web/theatre/creature3d.js");
const src = readFileSync(file, "utf8");

describe("limb keyboard", async () => {
  // The module imports generated files (web/js) that exist only after a build, so the two pure helpers are lifted from the source.
  const grab = (name: string) => src.slice(src.indexOf(`export function ${name}`), src.indexOf("\n}\n", src.indexOf(`export function ${name}`)) + 3).replace("export ", "");
  const { limbCommand, stepLimbIndex } = new Function(`${grab("limbCommand")}\n${grab("stepLimbIndex")}\nreturn { limbCommand, stepLimbIndex };`)();

  it("builds the EXAMINE command from the limb name", () => {
    expect(limbCommand({ name: "jquery" })).toBe("EXAMINE JQUERY");
  });
  it("cycles forward and back, wraps, and starts at the ends", () => {
    expect(stepLimbIndex(-1, 3, "ArrowRight")).toBe(0);
    expect(stepLimbIndex(-1, 3, "ArrowLeft")).toBe(2);
    expect(stepLimbIndex(2, 3, "ArrowDown")).toBe(0);
    expect(stepLimbIndex(0, 3, "ArrowUp")).toBe(2);
    expect(stepLimbIndex(0, 0, "ArrowRight")).toBe(-1);
  });
  it("makes the canvas focusable with a visible focus ring and an honest label", () => {
    expect(src).toMatch(/canvas\.tabIndex = 0/);
    expect(src).toMatch(/outline = "3px solid/);
    expect(src).toMatch(/aria-label", "Creature 3D\./);
    expect(src).toMatch(/id = "creature3d-canvas"/);
  });
  it("Enter only fills #cmd and focuses it, and never submits", () => {
    const block = src.slice(src.indexOf("const onKey"), src.indexOf("const onFocus"));
    expect(block).toMatch(/getElementById\("cmd"\)/);
    expect(block).toMatch(/input\.value = limbCommand/);
    expect(block).toMatch(/input\.focus\(\)/);
    expect(block).not.toMatch(/submit|dispatchEvent|requestSubmit|fetch\(/);
  });
  it("removes its listeners on dispose", () => {
    for (const ev of ["keydown", "focus", "blur"]) expect(src).toContain(`removeEventListener("${ev}"`);
  });
});
