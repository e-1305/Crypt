import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { existsSync, readFileSync } from "node:fs";
import { createOutputHook, type HookResult } from "../src/web/output-hook.js";
import type { ZvmLike } from "../src/web/glk-shim.js";
import { startPlayer } from "../src/web/player.js";
import { parseGameOutput } from "../src/bridge/parse-output.js";

const GRAFT = "[[CRYPT GRAFT ARM]]";

function runFeeds(chunks: string[]) {
  const hook = createOutputHook();
  const results: HookResult[] = chunks.map((c) => hook.feed(c));
  results.push(hook.flush());
  return { lines: results.flatMap((r) => r.lines), events: results.flatMap((r) => r.events) };
}

describe("output hook: lines and events (W2)", () => {
  it("emits an event for a marker line with its absolute line number", () => {
    const hook = createOutputHook();
    hook.feed("one\ntwo\n");
    const r = hook.feed(`${GRAFT}\n`);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ ok: true, command: "GRAFT ARM", lineNo: 3 });
  });
  it("finds a marker split across chunks exactly once", () => {
    const { events } = runFeeds(["[[CRYPT GR", "AFT ARM]", "]\n"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ ok: true, command: "GRAFT ARM", lineNo: 1 });
  });
  it("holds a partial line until its newline or flush", () => {
    const hook = createOutputHook();
    expect(hook.feed(GRAFT)).toEqual({ lines: [], events: [] });
    expect(hook.flush().events).toHaveLength(1);
  });
  it("accepts CRLF, including a split CR and LF", () => {
    const { events, lines } = runFeeds([`${GRAFT}\r`, "\nplain\r\n"]);
    expect(lines).toEqual([GRAFT, "plain"]);
    expect(events).toHaveLength(1);
  });
  it("reports a rejected marker as an ok:false event", () => {
    const { events } = runFeeds(["[[CRYPT MERGE PR]]\n"]);
    expect(events).toEqual([{ ok: false, lineNo: 1, reason: "marker fails the grammar" }]);
  });
});

describe("output hook: input never triggers (W4)", () => {
  it("typing GRAFT ARM then the game marker yields one event", () => {
    const hook = createOutputHook();
    expect(hook.input("GRAFT ARM").events).toEqual([]);
    expect(hook.feed(`${GRAFT}\nThe surgeon begins the graft.\n`).events).toHaveLength(1);
  });
  it("typing the marker yields no event", () => {
    const hook = createOutputHook();
    const r = hook.input(GRAFT);
    expect(r.lines).toEqual([`> ${GRAFT}`]);
    expect(r.events).toEqual([]);
  });
  it("newlines in typed input cannot make a second line", () => {
    const hook = createOutputHook();
    const r = hook.input(`x\n${GRAFT}\r\n${GRAFT}`);
    expect(r.lines).toHaveLength(1);
    expect(r.events).toEqual([]);
  });
  it("a prompt left unfinished is flushed as game output before the input line", () => {
    const hook = createOutputHook();
    hook.feed(">");
    expect(hook.input("look").lines).toEqual([">", "> look"]);
  });
  it("property: for any input and any interpreter output, input lines yield no events", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), fc.array(fc.string()), fc.string(), (typed, outLines, marker) => {
        const hook = createOutputHook();
        outLines.forEach((l) => hook.feed(l.replaceAll("\n", " ") + "\n"));
        for (const t of [typed, `${GRAFT}${typed}`, `[[CRYPT ${marker}]]`, GRAFT]) {
          const r = hook.input(t);
          expect(r.lines).toHaveLength(1);
          expect(r.lines[0].startsWith("> ")).toBe(true);
          expect(r.lines[0]).not.toMatch(/[\r\n]/);
          expect(r.events).toEqual([]);
        }
      }),
    );
  });
  it("property: input after a clean prompt never yields events", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (typed) => {
        const hook = createOutputHook();
        hook.feed("text\n>");
        expect(hook.input(typed).events).toEqual([]);
        expect(hook.input(`${GRAFT}${typed}`).events).toEqual([]);
      }),
    );
  });
});

describe("output hook: chunking (W2.2)", () => {
  const text = fc.array(
    fc.oneof(fc.constantFrom(GRAFT, "[[CRYPT SEAL]]", "[[CRYPT EXAMINE ARM]]", "[[CRYPT BOGUS]]", "> x", "plain"), fc.string()),
    { maxLength: 8 },
  );
  it("property: any chunk split yields the same lines and events as the whole text", () => {
    fc.assert(
      fc.property(text, fc.array(fc.nat(), { maxLength: 6 }), (parts, cuts) => {
        const whole = parts.join("\n") + "\n";
        const points = [...new Set(cuts.map((c) => c % (whole.length + 1)))].sort((a, b) => a - b);
        const chunks: string[] = [];
        let prev = 0;
        for (const p of points) {
          chunks.push(whole.slice(prev, p));
          prev = p;
        }
        chunks.push(whole.slice(prev));
        const split = runFeeds(chunks);
        const one = runFeeds([whole]);
        expect(split).toEqual(one);
        expect(split.events).toEqual(parseGameOutput(whole));
      }),
    );
  });
});

const story = "spike.z5";
describe.skipIf(!existsSync(story))("real interpreter plays spike.z5 in Node (integration)", () => {
  function play(commands: string[]) {
    // The vendored UMD file is loaded as CommonJS, whatever the package "type" says.
    const mod: { exports: new () => ZvmLike } = { exports: undefined as never };
    new Function("module", "exports", readFileSync("web/vendor/zvm.min.js", "utf8"))(mod, {});
    const ZVM = mod.exports;
    const events: HookResult["events"] = [];
    const errors: string[] = [];
    const p = startPlayer(new ZVM(), new Uint8Array(readFileSync(story)), {
      onResult: (r) => events.push(...r.events),
      onExit: () => {},
      onError: (m) => errors.push(m),
    });
    for (const c of commands) p.submit(c);
    return { events, errors };
  }
  it("GRAFT ARM shows [[CRYPT GRAFT ARM]] as detected", () => {
    const { events, errors } = play(["graft arm"]);
    expect(errors).toEqual([]);
    expect(events.map((e) => (e.ok ? e.command : e.reason))).toEqual(["GRAFT ARM"]);
  });
  it("typing the marker as input shows nothing", () => {
    expect(play([GRAFT, "[[CRYPT SEAL]]"]).events).toEqual([]);
  });
  it("accepted actions log in order", () => {
    const { events } = play(["examine arm", "graft arm", "seal crypt"]);
    expect(events.map((e) => e.ok && e.command)).toEqual(["EXAMINE ARM", "GRAFT ARM", "SEAL CRYPT"]);
  });
});
