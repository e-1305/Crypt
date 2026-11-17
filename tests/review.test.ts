import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { numRuns } from "./runs.js";
import fc from "fast-check";
import { appendFileSync, writeFileSync } from "node:fs";
import { createWatcher, tail } from "../src/bridge/watch.js";
import { parseGameOutput } from "../src/bridge/parse-output.js";
import { buildTranscript } from "../scripts/play.js";
import { KNOWN_LIMBS, makeEnv, transcript } from "./helpers.js";

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

const limb = fc.constantFrom(...KNOWN_LIMBS);
const line = fc.oneof(
  fc.constant("SEAL CRYPT"),
  fc.constant("GRAFT ARM"),
  limb.map((l) => `EXAMINE ${l}`),
  limb.map((l) => `GRAFT ${l}`),
  limb.map((l) => `ASSIGN ${l}`),
  fc.string(),
);
const lines = fc.array(line, { maxLength: 12 }).map((cs) => transcript(cs));

describe("failsafe rule 2 (least privilege): no network or merge call", () => {
  it("property: no fetch is ever made while processing any transcript", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    fc.assert(
      fc.property(lines, (t) => {
        const e = env();
        createWatcher(e.ctx).processText(t);
        e.cleanup();
        return f.mock.calls.length === 0;
      }),
      { numRuns: numRuns(50) },
    );
    vi.unstubAllGlobals();
  });
});

describe("failsafe rule 4 (economy of mechanism): deterministic", () => {
  it("property: the same transcript gives identical audit and requests", () => {
    fc.assert(
      fc.property(lines, (t) => {
        const a = env();
        const b = env();
        createWatcher(a.ctx).processText(t);
        createWatcher(b.ctx).processText(t);
        const same =
          JSON.stringify(a.auditLines()) === JSON.stringify(b.auditLines()) &&
          JSON.stringify(a.requests()) === JSON.stringify(b.requests());
        a.cleanup();
        b.cleanup();
        return same;
      }),
      { numRuns: numRuns(50) },
    );
  });
});

describe("failsafe rules 3 and 6 (invariants only, waiver in design.md)", () => {
  it("property: requests are only GRAFT requests, at most one per GRAFT marker line, and carry no verification or merge fields", () => {
    fc.assert(
      fc.property(lines, (t) => {
        const e = env();
        createWatcher(e.ctx).processText(t);
        const n = t.split("\n").filter((l) => /^\[\[CRYPT GRAFT [A-Z]{1,32}\]\]$/.test(l)).length;
        const ok = e.requests().length <= n && e.requests().every((r) => /^graft-\d{3}-[a-z]{1,32}\.json$/.test(r));
        e.cleanup();
        return ok;
      }),
      { numRuns: numRuns(50) },
    );
  });
});

describe("tail mode starts at end-of-file (review issue 2)", () => {
  it("does not replay existing GRAFT lines, handles new ones", async () => {
    const e = env();
    const path = `${e.dir}/transcript.txt`;
    writeFileSync(path, "> GRAFT ARM\n[[CRYPT GRAFT ARM]]\nout\n");
    const stop = tail(path, createWatcher(e.ctx), 10);
    await new Promise((r) => setTimeout(r, 60));
    expect(e.requests()).toEqual([]);
    appendFileSync(path, "> GRAFT ARM\n[[CRYPT GRAFT ARM]]\nout\n");
    await new Promise((r) => setTimeout(r, 80));
    stop();
    expect(e.requests().length).toBe(1);
  });
});

describe("play driver segmentation (review issue 5)", () => {
  it("throws when game output has a line starting with '> '", () => {
    const out = "intro\n> \nreply\n> weird\nmore\n> \nlast\n";
    expect(() => buildTranscript(["EXAMINE ARM", "GRAFT ARM"], out)).toThrow();
  });
  it("accepts the expected segment count", () => {
    expect(buildTranscript(["EXAMINE ARM"], "intro\n> \nA limb.\n")).toBe("> EXAMINE ARM\nA limb.\n");
  });
  it("keeps a marker line from dfrotz-style stdout in the transcript", () => {
    const out = "intro\n> \n[[CRYPT EXAMINE ARM]]\nA limb.\n> \n[[CRYPT GRAFT ARM]]\nThe surgeon begins the graft.\n> \n";
    const t = buildTranscript(["EXAMINE ARM", "GRAFT ARM"], out);
    expect(t).toBe(
      "> EXAMINE ARM\n[[CRYPT EXAMINE ARM]]\nA limb.\n> GRAFT ARM\n[[CRYPT GRAFT ARM]]\nThe surgeon begins the graft.\n",
    );
    expect(parseGameOutput(t).map((ev) => ev.ok && ev.command)).toEqual(["EXAMINE ARM", "GRAFT ARM"]);
  });
  it("a rejected command's output contains no marker", () => {
    const t = buildTranscript(["GRAFT FOO"], "intro\n> \nYou can't see any such thing.\n> \n");
    expect(t).toBe("> GRAFT FOO\nYou can't see any such thing.\n");
    expect(parseGameOutput(t)).toEqual([]);
  });
});
