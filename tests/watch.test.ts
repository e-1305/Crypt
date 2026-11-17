import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { createWatcher } from "../src/bridge/watch.js";
import { makeEnv, markerFor, transcript } from "./helpers.js";

beforeAll(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

const envs: Array<{ cleanup: () => void }> = [];
afterEach(() => {
  envs.splice(0).forEach((e) => e.cleanup());
});
function env(o?: Parameters<typeof makeEnv>[0]) {
  const e = makeEnv(o);
  envs.push(e);
  return e;
}

const limb = fc.stringMatching(/^[A-Z]{1,32}$/);
const accepted = fc.oneof(
  fc.constant("SEAL CRYPT"),
  limb.map((l) => `EXAMINE ${l}`),
  limb.map((l) => `GRAFT ${l}`),
  fc.constant("GRAFT ARM"),
);
const garbage = fc.oneof(fc.string(), fc.string().map((s) => s.toLowerCase() + " ARM"), fc.constant("GRAFT ARM "));

describe("watcher", () => {
  it("acceptance session: 1 request, 4 audit lines, 1 rejected graft", () => {
    const e = env();
    createWatcher(e.ctx).processText(transcript(["EXAMINE ARM", "GRAFT ARM", "SEAL CRYPT", "GRAFT ARM"]));
    expect(e.requests()).toEqual(["graft-001-arm.json"]);
    expect(e.auditLines().map((l) => l.split("\t")[3])).toEqual([
      "OK",
      "REQUEST_WRITTEN",
      "SEALED",
      "REJECTED_SEALED",
    ]);
    expect(e.sealed()).toBe(true);
    const req = JSON.parse(readFileSync(`${e.ctx.requestsDir}/graft-001-arm.json`, "utf8"));
    expect(req).toMatchObject({ action: "GRAFT", limb: "ARM", command: "GRAFT ARM" });
  });

  it("audit lines have timestamp, command, limb, outcome and PR URL", () => {
    const e = env();
    createWatcher(e.ctx).processText(transcript(["GRAFT ARM"]));
    expect(e.auditLines()[0]).toBe("2026-01-01T00:00:00.000Z\tGRAFT ARM\tARM\tREQUEST_WRITTEN\t-");
  });

  it("GRAFT of another grammatical limb is audited but writes no request", () => {
    const e = env();
    createWatcher(e.ctx).processText(transcript(["GRAFT LEG"]));
    expect(e.requests()).toEqual([]);
    expect(e.auditLines()).toHaveLength(1);
  });

  it("ignores game output lines that are not commands", () => {
    const e = env();
    createWatcher(e.ctx).processText("GRAFT ARM\nThe surgeon begins the graft.\n >GRAFT ARM\n> GRAFT ARM\n");
    expect(e.requests()).toEqual([]);
    expect(e.auditLines()).toEqual([]);
  });

  it("property (rule 7): after SEAL no request is ever written", () => {
    fc.assert(
      fc.property(fc.array(accepted, { maxLength: 15 }), fc.array(fc.oneof(accepted, garbage), { maxLength: 15 }), (before, after) => {
        const e = makeEnv();
        try {
          const w = createWatcher(e.ctx);
          w.processText(transcript(before.filter((c) => c !== "SEAL CRYPT")));
          const n = e.requests().length;
          w.processLine(markerFor("SEAL CRYPT"));
          w.processText(transcript(after));
          expect(e.requests().length).toBe(n);
          expect(e.sealed()).toBe(true);
          // a fresh watcher on the same files must also refuse
          createWatcher(e.ctx).processText(transcript(["GRAFT ARM"]));
          expect(e.requests().length).toBe(n);
        } finally {
          e.cleanup();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("property (rule 1): parse errors write nothing", () => {
    fc.assert(
      fc.property(fc.array(garbage, { maxLength: 20 }), (cmds) => {
        const lines = cmds.filter((c) => !/^(EXAMINE|GRAFT) [A-Z]{1,32}$|^SEAL CRYPT$/.test(c));
        const e = makeEnv();
        try {
          createWatcher(e.ctx).processText(lines.map((c) => `> ${c}\n${markerFor(c)}`).join("\n"));
          expect(e.requests()).toEqual([]);
          expect(e.auditLines()).toEqual([]);
          expect(e.sealed()).toBe(false);
        } finally {
          e.cleanup();
        }
      }),
      { numRuns: 200 },
    );
  });

  it("property (rule 1): an unreadable seal state refuses GRAFT", () => {
    fc.assert(
      fc.property(fc.array(limb, { minLength: 1, maxLength: 5 }), (limbs) => {
        const e = makeEnv({
          pathState() {
            throw Object.assign(new Error("boom"), { code: "EACCES" });
          },
        });
        try {
          createWatcher(e.ctx).processText(transcript(limbs.map((l) => `GRAFT ${l}`)));
          expect(e.requests()).toEqual([]);
        } finally {
          e.cleanup();
        }
      }),
    );
  });

  it("property (rule 1): injected write failures never leave a request without an audit line", () => {
    fc.assert(
      fc.property(fc.constantFrom("createExclusive", "appendLine", "mkdirp"), (failing) => {
        const e = makeEnv({
          [failing]() {
            throw new Error("injected");
          },
        });
        try {
          createWatcher(e.ctx).processText(transcript(["GRAFT ARM"]));
          expect(e.requests()).toEqual([]);
        } finally {
          e.cleanup();
        }
      }),
    );
  });

  it("failure to create the seal file still seals the watcher", () => {
    const e = env({
      createExclusive(path, data) {
        if (path.endsWith(".crypt-seal")) throw new Error("injected");
        return nodeWrite(path, data);
      },
    });
    createWatcher(e.ctx).processText(transcript(["SEAL CRYPT", "GRAFT ARM"]));
    expect(e.requests()).toEqual([]);
  });

  it("property (rule 8): each accepted command yields exactly one audit line", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(accepted, garbage), { maxLength: 25 }), (cmds) => {
        const ok = /^\[\[CRYPT ((EXAMINE|GRAFT) [A-Z]{1,32}|SEAL)\]\]$/;
        const e = makeEnv();
        try {
          createWatcher(e.ctx).processText(transcript(cmds));
          expect(e.auditLines().length).toBe(cmds.filter((c) => ok.test(markerFor(c))).length);
        } finally {
          e.cleanup();
        }
      }),
      { numRuns: 200 },
    );
  });
});

import { writeFileSync } from "node:fs";
function nodeWrite(path: string, data: string) {
  writeFileSync(path, data, { flag: "wx" });
}
