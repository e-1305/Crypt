import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseCommand } from "../src/bridge/grammar.js";

const limb = fc.stringMatching(/^[A-Z]{1,32}$/);
const GRAMMAR = /^((EXAMINE|GRAFT) [A-Z]{1,32}|SEAL CRYPT)$/;

describe("grammar (failsafe 5, complete mediation)", () => {
  it("accepts the documented commands", () => {
    expect(parseCommand("EXAMINE ARM")).toEqual({ ok: true, verb: "EXAMINE", limb: "ARM" });
    expect(parseCommand("GRAFT ARM")).toEqual({ ok: true, verb: "GRAFT", limb: "ARM" });
    expect(parseCommand("SEAL CRYPT")).toEqual({ ok: true, verb: "SEAL", limb: "-" });
  });

  it("property: rejects every string outside the grammar", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: "binary" }), fc.string({ unit: "grapheme" })), (s) => {
        fc.pre(!GRAMMAR.test(s));
        expect(parseCommand(s)).toEqual({ ok: false });
      }),
      { numRuns: 2000 },
    );
  });

  it("property: rejects near misses (case, whitespace, newline, length, wrong verb)", () => {
    const mutate = fc.tuple(
      fc.constantFrom("EXAMINE", "GRAFT", "SEAL"),
      limb,
      fc.constantFrom(
        (s: string) => s.toLowerCase(),
        (s: string) => " " + s,
        (s: string) => s + " ",
        (s: string) => s + "\n",
        (s: string) => s + "\r",
        (s: string) => s.replace(" ", "  "),
        (s: string) => s.replace(" ", "\t"),
        (s: string) => s + "; MERGE",
        (s: string) => s + "0",
      ),
    );
    fc.assert(
      fc.property(mutate, ([verb, l, f]) => {
        const base = verb === "SEAL" ? "SEAL CRYPT" : `${verb} ${l}`;
        expect(parseCommand(f(base))).toEqual({ ok: false });
      }),
    );
    expect(parseCommand("GRAFT " + "A".repeat(33))).toEqual({ ok: false });
    expect(parseCommand("SEAL ARM")).toEqual({ ok: false });
    expect(parseCommand("MERGE ARM")).toEqual({ ok: false });
    expect(parseCommand(undefined)).toEqual({ ok: false });
  });

  it("property: accepts every in-grammar string", () => {
    fc.assert(
      fc.property(fc.constantFrom("EXAMINE", "GRAFT"), limb, (verb, l) => {
        expect(parseCommand(`${verb} ${l}`)).toEqual({ ok: true, verb, limb: l });
      }),
    );
  });
});
