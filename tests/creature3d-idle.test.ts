// 3D fan guard: 30 fps cap, 8 s idle stop, wake rules, off-screen pause and the pixel ratio cap. Static checks on the source.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(import.meta.dirname, "..", "web/theatre/creature3d.js"), "utf8");

describe("creature 3D idle rule", () => {
  it("caps the loop at 30 fps", () => {
    expect(src).toMatch(/const FRAME_MS = 1000 \/ 30;/);
    expect(src).toMatch(/now - last < FRAME_MS - 1\) return/);
  });
  it("stops after 8 s without pointer, burst or data update", () => {
    expect(src).toMatch(/const IDLE_MS = 8000;/);
    expect(src).toMatch(/bursts\.length === 0 && !hovering && now - lastActive > IDLE_MS/);
  });
  it("restarts on pointer move, on plate updates (build) and while a burst runs", () => {
    expect(src).toMatch(/addEventListener\("pointermove", onMove\)/);
    expect(src).toMatch(/draw\(\);\s*wakeLoop\(\);/);
    expect(src).toMatch(/document\.addEventListener\("crypt:plate", \(\) => view\?\.update\(\)\)/);
    expect(src).toMatch(/bursts\.length === 0 &&/);
  });
  it("pauses off screen and when the tab is hidden, and disconnects on dispose", () => {
    expect(src).toContain("new IntersectionObserver");
    expect(src).toMatch(/if \(onScreen\) wake\(\); else pause\(\)/);
    expect(src).toMatch(/io\?\.disconnect\(\)/);
    expect(src).toMatch(/removeEventListener\("pointermove", onMove\)/);
  });
  it("caps the pixel ratio at 1.5", () => {
    expect(src).toMatch(/const MAX_DPR = 1\.5;/);
    expect(src).toMatch(/setPixelRatio\(Math\.min\(window\.devicePixelRatio \|\| 1, MAX_DPR\)\)/);
  });
  it("keeps reduced motion as one still frame and every id", () => {
    expect(src).toMatch(/if \(!reduced\) raf = requestAnimationFrame/);
    for (const id of ["creature3d-toggle", "creature3d-panel", "creature3d-legend", "creature3d-canvas", "creature3d-stage", "creature3d-labels"]) expect(src).toContain(id);
  });
});
