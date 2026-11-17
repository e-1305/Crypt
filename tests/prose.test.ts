import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { numRuns } from "./runs.js";
import { parseCommand } from "../src/bridge/grammar.js";
import { parseGameOutput } from "../src/bridge/parse-output.js";
import { EGGS, HELP_TEXT, PERSONALITIES, describeLimb, describeRoom, personalityFor, randomEvent, type RotLevel } from "../src/raise/prose.js";

const limb = { ecosystem: "npm", name: "lodash", version: "4.17.15", epss: 0.2 };
const levels: RotLevel[] = ["Healthy", "Rotting", "Possessed"];

describe("prose: determinism and variety", () => {
  it("personalityFor is stable and covers several archetypes", () => {
    expect(personalityFor("npm", "lodash")).toBe(personalityFor("npm", "lodash"));
    const seen = new Set(["a", "bb", "ccc", "dddd", "eeeee", "ffffff", "g", "h", "i", "j", "k", "l", "m", "n"].map((n) => personalityFor("npm", n).id));
    expect(seen.size).toBeGreaterThan(3);
    expect(PERSONALITIES.length).toBeGreaterThanOrEqual(8);
  });

  it("describeLimb differs per rot level, and high EPSS adds a worse line", () => {
    const [h, r, p] = levels.map((l) => describeLimb(limb, l));
    expect(new Set([h, r, p]).size).toBe(3);
    expect(describeLimb({ ...limb, epss: 0.9 }, "Rotting")).not.toBe(describeLimb({ ...limb, epss: 0.01 }, "Rotting"));
    expect(describeLimb({ ...limb, epss: 0.9 }, "Healthy")).toBe(describeLimb({ ...limb, epss: 0.01 }, "Healthy"));
  });

  it("describeRoom changes with the worst rot level", () => {
    const texts = [[], ["Healthy"], ["Rotting"], ["Rotting", "Possessed"]].map((r) => describeRoom(r as RotLevel[], ""));
    expect(new Set(texts).size).toBe(4);
  });

  it("randomEvent is deterministic and total", () => {
    expect(randomEvent(7, 3)).toBe(randomEvent(7, 3));
    fc.assert(fc.property(fc.double(), fc.double(), (s, t) => {
      expect(randomEvent(s, t).length).toBeGreaterThan(0);
    }), { numRuns: numRuns(100) });
  });

  it("property: dynamic text is sanitized and fixed text is Inform-safe", () => {
    const fixed = [...PERSONALITIES.map((p) => p.title + p.voice), HELP_TEXT.replace(/\^/g, " "), ...EGGS.map((e) => e.text)];
    for (const t of fixed) {
      expect(t).toMatch(/^[\x20-\x7e]*$/);
      expect(t).not.toMatch(/["~@\[\]\\]/);
    }
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), fc.string(), fc.constantFrom(...levels), (name, ver, rot) => {
        const t = describeLimb({ ecosystem: "npm", name, version: ver, epss: 0.9 }, rot);
        expect(t).toMatch(/^[\x20-\x7e]*$/);
        expect(t).not.toMatch(/["~@\[\]\\]/);
      }),
      { numRuns: numRuns(300) },
    );
  });
});

describe("prose: new verbs never become bridge actions", () => {
  const verbs = ["HELP", "HINT", "HINTS", ...EGGS.map((e) => e.verb.toUpperCase())];
  it("the strict grammar rejects them", () => {
    fc.assert(
      fc.property(fc.constantFrom(...verbs), fc.string(), (v, rest) => {
        expect(parseCommand(v).ok).toBe(false);
        expect(parseCommand(`${v} ${rest}`).ok).toBe(false);
      }),
      { numRuns: numRuns(300) },
    );
  });

  it("their output yields no events", () => {
    for (const e of EGGS) expect(parseGameOutput(`> ${e.verb.toUpperCase()}\n${e.text}\n`)).toEqual([]);
    expect(parseGameOutput(`> HELP\n${HELP_TEXT.replace(/\^/g, "\n")}\n`)).toEqual([]);
  });
});
