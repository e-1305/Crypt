// 3D life cues (#309): eyes follow the pointer, flinch on graft, sigh on heal. Event driven, off under reduced motion, cleaned up on dispose.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(import.meta.dirname, "..", "web/theatre/creature3d.js"), "utf8");

describe("creature 3D life cues", () => {
  it("shares the existing onMove handler and listens for crypt:fx only when motion is allowed", () => {
    expect(src.match(/addEventListener\("pointermove"/g)).toHaveLength(1);
    expect(src).toMatch(/if \(!reduced\) \{ canvas\.addEventListener\("pointermove", onMove\)/);
    expect(src).toMatch(/if \(!reduced\) document\.addEventListener\("crypt:fx", onFx\)/);
    expect(src).toMatch(/const onMove = \(e\) => \{\s*hovering = true;[\s\S]*?look\.x =[\s\S]*?wake\(\);/);
    expect(src).toMatch(/d\.reduced === true \|\| reduced\) return/);
  });
  it("wakes the idle loop when a cue fires", () => {
    expect(src).toMatch(/const onFx = [\s\S]*?wake\(\);[\s\S]*?const stepLife/);
  });
  it("flinches for 0.3 s on graft and sighs on heal", () => {
    expect(src).toMatch(/FLINCH_MS = 300/);
    expect(src).toMatch(/d\.kind === "graft"/);
    expect(src).toMatch(/d\.kind === "heal"\) cue = \{ kind: "sigh"/);
  });
  it("removes every listener on dispose", () => {
    for (const l of [/canvas\.removeEventListener\("pointermove", onMove\)/, /canvas\.removeEventListener\("pointerleave", onLeave\)/, /document\.removeEventListener\("crypt:fx", onFx\)/]) expect(src).toMatch(l);
  });
  it("keeps the element ids and writes no HTML", () => {
    for (const id of ["creature3d-canvas", "creature3d-stage", "creature3d-labels", "creature3d-toggle", "creature3d-panel"]) expect(src).toContain(id);
    expect(src).not.toMatch(/innerHTML/);
  });
});
