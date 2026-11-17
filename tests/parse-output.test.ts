import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { numRuns } from "./runs.js";
import fc from "fast-check";
import { parseGameOutput } from "../src/bridge/parse-output.js";
import { createWatcher } from "../src/bridge/watch.js";
import { makeEnv, markerFor, transcript } from "./helpers.js";

beforeAll(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
const envs: Array<{ cleanup: () => void }> = [];
afterEach(() => envs.splice(0).forEach((e) => e.cleanup()));
function env() {
  const e = makeEnv();
  envs.push(e);
  return e;
}
const commandsOf = (text: string) => parseGameOutput(text).flatMap((ev) => (ev.ok ? [ev.command] : []));

const validMarker = fc.constantFrom("[[CRYPT GRAFT ARM]]", "[[CRYPT EXAMINE ARM]]", "[[CRYPT ASSIGN ARM]]", "[[CRYPT SEAL]]");
const markerLooking = fc.oneof(
  validMarker,
  fc.string().map((s) => `[[CRYPT ${s}]]`),
  fc.stringMatching(/^[A-Z]{1,8}( [A-Z]{1,8}){0,2}$/).map((s) => `[[CRYPT ${s}]]`),
);
// Game output that is not a marker and not an input line.
const plainLine = fc.string().filter((l) => !l.startsWith("[[CRYPT ") && !l.startsWith("> ") && !l.includes("\n"));

describe("parseGameOutput examples", () => {
  it("reads markers in order and skips intro and input lines", () => {
    const text = [
      "You wake in the dark.",
      "> EXAMINE ARM",
      "[[CRYPT EXAMINE ARM]]",
      "A rotting limb.",
      "> GRAFT ARM",
      "[[CRYPT GRAFT ARM]]",
      "The surgeon begins the graft.",
      "> SEAL CRYPT",
      "[[CRYPT SEAL]]",
      "",
    ].join("\n");
    expect(commandsOf(text)).toEqual(["EXAMINE ARM", "GRAFT ARM", "SEAL CRYPT"]);
    expect(parseGameOutput(text)[2]).toMatchObject({ ok: true, lineNo: 9, parsed: { verb: "SEAL", limb: "-" } });
  });

  it("tolerates CRLF line endings", () => {
    expect(commandsOf("[[CRYPT GRAFT ARM]]\r\n[[CRYPT SEAL]]\r\n")).toEqual(["GRAFT ARM", "SEAL CRYPT"]);
  });

  it.each([
    "[[CRYPT GRAFT arm]]",
    "[[CRYPT GRAFT ARM EXTRA]]",
    "[[CRYPT ]]",
    "[[CRYPT SEAL CRYPT]]",
    "x [[CRYPT GRAFT ARM]]",
    "[[CRYPT GRAFT ARM]] x",
    " [[CRYPT GRAFT ARM]]",
    "[[CRYPT GRAFT ARM]] ",
    "[[CRYPT  GRAFT ARM]]",
    "[[CRYPT GRAFT]]",
    "[[CRYPT GRAFT ARM ]]",
  ])("rejects %j: no event, writes nothing", (line) => {
    expect(commandsOf(line)).toEqual([]);
    const e = env();
    createWatcher(e.ctx).processText(line + "\n");
    expect(e.requests()).toEqual([]);
    expect(e.auditLines()).toEqual([]);
    expect(e.sealed()).toBe(false);
  });
});

describe("parseGameOutput properties", () => {
  it("is deterministic and never throws on arbitrary strings", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (s) => {
        expect(parseGameOutput(s)).toEqual(parseGameOutput(s));
      }),
      { numRuns: numRuns(300) },
    );
  });

  it("every event comes from a whole-line marker that passes the grammar", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(markerLooking, plainLine), { maxLength: 15 }), (ls) => {
        const evs = parseGameOutput(ls.join("\n"));
        for (const ev of evs) {
          if (ev.ok) expect(ls[ev.lineNo - 1]).toBe(markerFor(ev.command));
        }
      }),
    );
  });
});

describe("spoofing (V4)", () => {
  it("property: marker-looking player input lines never act", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(markerLooking, fc.array(plainLine, { maxLength: 3 })), { maxLength: 12 }), (items) => {
        const text = items.map(([m, out]) => [`> ${m}`, ...out].join("\n")).join("\n") + "\n";
        expect(parseGameOutput(text)).toEqual([]);
        const e = makeEnv();
        try {
          createWatcher(e.ctx).processText(text);
          expect(e.requests()).toEqual([]);
          expect(e.auditLines()).toEqual([]);
          expect(e.sealed()).toBe(false);
        } finally {
          e.cleanup();
        }
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("property: a valid marker in game output yields exactly the expected request and audit", () => {
    fc.assert(
      fc.property(fc.array(plainLine, { maxLength: 4 }), fc.array(plainLine, { maxLength: 4 }), (before, after) => {
        const e = makeEnv();
        try {
          createWatcher(e.ctx).processText([...before, "[[CRYPT GRAFT ARM]]", ...after].join("\n") + "\n");
          expect(e.requests()).toEqual(["graft-001-arm.json"]);
          expect(e.auditLines().map((l) => l.split("\t").slice(1).join("\t"))).toEqual(["GRAFT ARM\tARM\tREQUEST_WRITTEN\t-"]);
        } finally {
          e.cleanup();
        }
      }),
    );
  });

  it("a '> GRAFT ARM' input line with no marker produces nothing", () => {
    const e = env();
    createWatcher(e.ctx).processText("> GRAFT ARM\nThe surgeon begins the graft.\n");
    expect(e.requests()).toEqual([]);
    expect(e.auditLines()).toEqual([]);
  });

  it("property: inserting arbitrary input lines never changes audit or requests", () => {
    const cmds = fc.array(fc.constantFrom("EXAMINE ARM", "GRAFT ARM", "GRAFT LEG", "SEAL CRYPT"), { maxLength: 10 });
    fc.assert(
      fc.property(cmds, fc.array(fc.string().filter((s) => !s.includes("\n")), { maxLength: 10 }), fc.nat(), (cs, extra, at) => {
        const base = transcript(cs);
        const lines = base.split("\n");
        const k = at % (lines.length + 1);
        lines.splice(k, 0, ...extra.map((x) => `> ${x}`));
        const a = makeEnv();
        const b = makeEnv();
        try {
          createWatcher(a.ctx).processText(base);
          createWatcher(b.ctx).processText(lines.join("\n"));
          expect(b.auditLines()).toEqual(a.auditLines());
          expect(b.requests()).toEqual(a.requests());
          expect(b.sealed()).toBe(a.sealed());
        } finally {
          a.cleanup();
          b.cleanup();
        }
      }),
      { numRuns: numRuns(200) },
    );
  });
});
