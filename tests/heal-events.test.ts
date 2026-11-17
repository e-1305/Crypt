import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  REJECTION_LINE, SIMULATED_LABEL, applyHealEvent, demoPayload, parseHealEvent, simulateFromPayload,
  type PlateLimbState,
} from "../src/theatre/heal-events.js";
import { REJECTED_TEXT } from "../src/common/agent.js";

const states: Record<string, PlateLimbState> = {
  "npm:lodash": "Rotting", "npm:ms": "Healthy", "npm:jquery": "Possessed", "npm:done": "Healed",
};

describe("rejection line", () => {
  it("is exactly the line the Inquisitor prints", () => expect(REJECTION_LINE).toBe(REJECTED_TEXT));
});

describe("parseHealEvent", () => {
  it("accepts the three known types", () => {
    for (const type of ["healed", "ci-red", "ci-green"]) expect(parseHealEvent({ type, limb: "npm:lodash" })).toEqual({ type, limb: "npm:lodash" });
  });
  it("rejects unknown types and bad limbs", () => {
    for (const bad of [null, undefined, 3, "healed", [], {}, { type: "boom", limb: "npm:a" }, { type: "healed" }, { type: "healed", limb: "" }, { type: "healed", limb: "no-colon" }, { type: "healed", limb: "npm:" + "x".repeat(41) }]) {
      expect(parseHealEvent(bad)).toBeNull();
    }
  });
  it("never throws on arbitrary input", () => {
    fc.assert(fc.property(fc.anything(), (x) => { parseHealEvent(x); }));
  });
});

describe("applyHealEvent", () => {
  it("heals a rotting or possessed limb on a healed event", () => {
    expect(applyHealEvent(states, { type: "healed", limb: "npm:lodash" }).states["npm:lodash"]).toBe("Healed");
    expect(applyHealEvent(states, { type: "healed", limb: "npm:jquery" }).effect).toEqual({ kind: "heal", limb: "npm:jquery" });
  });
  it("red CI convulses with the rejection line and changes no state", () => {
    const r = applyHealEvent(states, { type: "ci-red", limb: "npm:lodash" });
    expect(r.states).toEqual(states);
    expect(r.effect).toEqual({ kind: "convulse", limb: "npm:lodash", line: REJECTED_TEXT });
  });
  it("green CI alone does not heal", () => {
    const r = applyHealEvent(states, { type: "ci-green", limb: "npm:lodash" });
    expect(r.states["npm:lodash"]).toBe("Rotting");
    expect(r.effect?.kind).toBe("ci-green");
  });
  it("ignores unknown limbs, healthy limbs and prototype keys", () => {
    for (const limb of ["npm:nope", "npm:ms", "npm:done", "x:__proto__"]) {
      const r = applyHealEvent(states, { type: "healed", limb });
      expect(r.states).toEqual(states);
      expect(r.effect).toBeNull();
    }
  });
  it("arbitrary input never throws and never heals a limb it should not", () => {
    fc.assert(fc.property(fc.anything(), (x) => {
      const r = applyHealEvent(states, x);
      for (const k of Object.keys(states)) {
        if (r.states[k] !== states[k]) {
          expect(states[k] === "Rotting" || states[k] === "Possessed").toBe(true);
          expect(r.states[k]).toBe("Healed");
          expect(parseHealEvent(x)).toEqual({ type: "healed", limb: k });
        }
      }
    }));
  });
  it("arbitrary event objects on a random state map: only a well-formed healed event on a sick limb heals", () => {
    const ev = fc.record({ type: fc.string(), limb: fc.string() });
    fc.assert(fc.property(ev, (e) => {
      const r = applyHealEvent(states, e);
      if (e.type !== "healed") expect(r.states).toEqual(states);
    }));
  });
  it("does not change its input", () => {
    const copy = { ...states };
    applyHealEvent(states, { type: "healed", limb: "npm:lodash" });
    expect(states).toEqual(copy);
  });
});

describe("simulateFromPayload", () => {
  const payload = { ecosystem: "npm", name: "lodash", from: "4.17.15", to: "4.17.21" };
  it("green: graft, ci-green, healed, every line labelled", () => {
    const s = simulateFromPayload(payload, "green");
    expect(s.map((x) => x.event?.type)).toEqual([undefined, "ci-green", "healed"]);
    for (const x of s) expect(x.text).toContain(SIMULATED_LABEL);
    expect(s.map((x) => x.atMs)).toEqual([...s.map((x) => x.atMs)].sort((a, b) => a - b));
  });
  it("red: graft then ci-red with the rejection line, no healed event", () => {
    const s = simulateFromPayload(payload, "red");
    expect(s.map((x) => x.event?.type)).toEqual([undefined, "ci-red"]);
    expect(s[1].text).toContain(REJECTED_TEXT);
  });
  it("pending or unknown verdict never heals", () => {
    fc.assert(fc.property(fc.anything(), (v) => {
      fc.pre(v !== "green" && v !== "red");
      expect(simulateFromPayload(payload, v).some((x) => x.event)).toBe(false);
    }));
  });
  it("arbitrary payloads never throw and never emit an event for an invalid limb", () => {
    fc.assert(fc.property(fc.anything(), fc.constantFrom("green", "red", "pending"), (p, v) => {
      for (const s of simulateFromPayload(p, v)) if (s.event) expect(parseHealEvent(s.event)).not.toBeNull();
    }));
  });
  it("empty for a payload without a limb", () => {
    expect(simulateFromPayload({}, "green")).toEqual([]);
    expect(simulateFromPayload(null, "green")).toEqual([]);
  });
  it("running the steps through applyHealEvent heals only on green", () => {
    const run = (v: string) => simulateFromPayload(payload, v).reduce((st, s) => (s.event ? applyHealEvent(st, s.event).states : st), { "npm:lodash": "Rotting" } as Record<string, PlateLimbState>)["npm:lodash"];
    expect(run("green")).toBe("Healed");
    expect(run("red")).toBe("Rotting");
    expect(run("pending")).toBe("Rotting");
  });
});

describe("demoPayload", () => {
  it("picks the first sick limb", () => {
    expect(demoPayload([{ ecosystem: "npm", name: "ms", state: "Healthy" }, { ecosystem: "npm", name: "lodash", state: "Rotting" }])).toMatchObject({ name: "lodash" });
  });
  it("is null with nothing sick or on junk", () => {
    expect(demoPayload([])).toBeNull();
    fc.assert(fc.property(fc.anything(), (x) => { demoPayload(x); }));
  });
});
