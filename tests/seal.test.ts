import { describe, expect, it } from "vitest";
import { createSealGate, refusalMessage } from "../src/web/seal.js";

const ev = (verb: string, ok = true) => ({ ok, parsed: { verb, limb: "-" } });

describe("seal gate", () => {
  it("allows graft and raid before a seal", () => {
    const g = createSealGate();
    const r = g.apply([ev("GRAFT"), ev("RAID")]);
    expect(r.allowed).toHaveLength(2);
    expect(r.refused).toHaveLength(0);
    expect(g.sealed).toBe(false);
  });
  it("refuses graft and raid after SEAL, across results", () => {
    const g = createSealGate();
    expect(g.apply([ev("SEAL")]).allowed).toHaveLength(1);
    expect(g.sealed).toBe(true);
    const r = g.apply([ev("EXAMINE"), ev("GRAFT"), ev("RAID")]);
    expect(r.allowed.map((e) => e.parsed?.verb)).toEqual(["EXAMINE"]);
    expect(r.refused.map((e) => e.parsed?.verb)).toEqual(["GRAFT", "RAID"]);
  });
  it("judges events in order within one result", () => {
    const r = createSealGate().apply([ev("GRAFT"), ev("SEAL"), ev("GRAFT")]);
    expect(r.allowed).toHaveLength(2);
    expect(r.refused).toHaveLength(1);
  });
  it("ignores rejected events and says so in plain words", () => {
    const g = createSealGate();
    g.apply([{ ok: false }]);
    expect(g.sealed).toBe(false);
    expect(refusalMessage(ev("GRAFT"))).toMatch(/sealed.*rejected/);
    expect(refusalMessage(ev("RAID"))).toMatch(/sealed.*raid does not start/);
  });
});
