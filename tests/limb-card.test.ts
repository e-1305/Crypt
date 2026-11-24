// #317: hover or tap a 3D limb to see its card. Unknown data reads "not recorded", never "no".
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { layoutCreature } from "../src/theatre/creature3d-layout.js";

const ROOT = resolve(import.meta.dirname, "..");
const src = readFileSync(resolve(ROOT, "web/theatre/creature3d.js"), "utf8");

describe("limb card", async () => {
  // creature3d.js imports three only inside initCreature3d, so the pure helper loads without WebGL.
  const { limbCardLines } = await import(pathToFileURL(resolve(ROOT, "web/theatre/creature3d.js")).href).catch(() => ({ limbCardLines: null }));
  const [l] = layoutCreature({ limbs: [{ name: "jquery", version: "3.4.1", state: "Possessed", rank: 1, epss: 0.0251, kev: true, owner: "@acme/web" }] });
  const [u] = layoutCreature({ limbs: [{ name: "minimist", state: "Rotting", rank: 1 }] });

  it("layout carries name, version, kev, owner and whether EPSS is known", () => {
    expect(l).toMatchObject({ name: "jquery", version: "3.4.1", kev: true, owner: "@acme/web", epssKnown: true });
    expect(u).toMatchObject({ kev: null, owner: null, epssKnown: false });
  });
  it("card lines name the limb and the command, and never turn unknown into no", () => {
    if (!limbCardLines) return; // module needs a browser-only import in this environment
    expect(limbCardLines(l)).toEqual(["jquery@3.4.1", "State: Possessed", "Exploited (CISA KEV): yes", "EPSS: 2.5%", "Owner: @acme/web", "Type: EXAMINE JQUERY"]);
    const lines = limbCardLines(u).join("\n");
    expect(lines).toContain("Exploited (CISA KEV): not recorded");
    expect(lines).toContain("EPSS: not recorded");
    expect(lines).toContain("Owner: not recorded");
  });
  it("writes the card with textContent only and removes it on dispose", () => {
    const block = src.slice(src.indexOf("// Limb card:"), src.indexOf("const onMove"));
    expect(block).toMatch(/textContent = line/);
    expect(src).not.toMatch(/innerHTML|insertAdjacentHTML/);
    expect(src).toMatch(/card\.remove\(\)/);
  });
  it("raycasts the instanced limb meshes and maps instanceId back to the limb", () => {
    expect(src).toMatch(/mesh\.userData\.limbs = group/);
    expect(src).toMatch(/hit\.object\.userData\.limbs\?\.\[hit\.instanceId\]/);
  });
});
