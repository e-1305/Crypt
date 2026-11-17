import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { numRuns } from "./runs.js";
import fc from "fast-check";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWatcher } from "../src/bridge/watch.js";
import { KNOWN_LIMBS, makeEnv, markerFor, transcript } from "./helpers.js";

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

const anyLimb = fc.stringMatching(/^[A-Z]{1,32}$/);
const limb = fc.constantFrom(...KNOWN_LIMBS);
const unknownLimb = anyLimb.filter((l) => !KNOWN_LIMBS.includes(l));
const accepted = fc.oneof(
  fc.constant("SEAL CRYPT"),
  fc.constant("RAID"),
  limb.map((l) => `EXAMINE ${l}`),
  limb.map((l) => `GRAFT ${l}`),
  limb.map((l) => `ASSIGN ${l}`),
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

  it("RAID is audited as NO_ACTION and writes no request, even after a seal", () => {
    const e = env();
    createWatcher(e.ctx).processText(transcript(["RAID", "SEAL CRYPT", "RAID"]));
    expect(e.requests()).toEqual([]);
    expect(e.auditLines().map((l) => l.split("\t").slice(1).join("|"))).toEqual(["RAID|-|NO_ACTION|-", "SEAL CRYPT|-|SEALED|-", "RAID|-|NO_ACTION|-"]);
  });

  it("audit lines have timestamp, command, limb, outcome and PR URL", () => {
    const e = env();
    createWatcher(e.ctx).processText(transcript(["GRAFT ARM"]));
    expect(e.auditLines()[0]).toBe("2026-01-01T00:00:00.000Z\tGRAFT ARM\tARM\tREQUEST_WRITTEN\t-");
  });

  it("GRAFT of any grammatical limb writes a request named for the limb", () => {
    const e = env();
    createWatcher(e.ctx).processText(transcript(["GRAFT JQUERY", "GRAFT LODASH"]));
    expect(e.requests()).toEqual(["graft-001-jquery.json", "graft-002-lodash.json"]);
    expect(e.auditLines()).toHaveLength(2);
  });

  it("ASSIGN is audited OK and writes no request", () => {
    const e = env();
    createWatcher(e.ctx).processText(transcript(["ASSIGN JQUERY"]));
    expect(e.requests()).toEqual([]);
    expect(e.auditLines().map((l) => l.split("\t").slice(1).join("\t"))).toEqual(["ASSIGN JQUERY\tJQUERY\tOK\t-"]);
  });

  it("GRAFT of an unknown limb writes nothing and is audited REJECTED_UNKNOWN_LIMB", () => {
    const e = env();
    createWatcher(e.ctx).processText(transcript(["GRAFT NOSUCH"]));
    expect(e.requests()).toEqual([]);
    expect(e.auditLines()).toEqual(["2026-01-01T00:00:00.000Z\tGRAFT NOSUCH\tNOSUCH\tREJECTED_UNKNOWN_LIMB\t-"]);
  });

  it("ASSIGN of an unknown limb is audited REJECTED_UNKNOWN_LIMB; a known one stays OK", () => {
    const e = env();
    createWatcher(e.ctx).processText(transcript(["ASSIGN NOSUCH", "ASSIGN JQUERY"]));
    expect(e.auditLines().map((l) => l.split("\t")[3])).toEqual(["REJECTED_UNKNOWN_LIMB", "OK"]);
  });

  it("a missing, unparseable or wrongly shaped out/limbs.json rejects every GRAFT and ASSIGN", () => {
    const bad = [null, "not json", "[]", "null", "42", '"ARM"'];
    for (const content of bad) {
      const e = makeEnv(undefined, null);
      envs.push(e);
      if (content !== null) {
        mkdirSync(join(e.dir, "out"), { recursive: true });
        writeFileSync(e.ctx.limbsPath, content);
      }
      createWatcher(e.ctx).processText(transcript(["GRAFT ARM", "ASSIGN ARM"]));
      expect(e.requests()).toEqual([]);
      expect(e.auditLines().map((l) => l.split("\t")[3])).toEqual(["REJECTED_UNKNOWN_LIMB", "REJECTED_UNKNOWN_LIMB"]);
    }
  });

  it("an ID that is only an inherited property name is unknown", () => {
    const e = env();
    createWatcher(e.ctx).processText(transcript(["GRAFT CONSTRUCTOR"]));
    expect(e.requests()).toEqual([]);
  });

  it("property (complete mediation): unknown IDs never write a request and every rejection is audited", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(unknownLimb.map((l) => `GRAFT ${l}`), unknownLimb.map((l) => `ASSIGN ${l}`)), { minLength: 1, maxLength: 15 }), (cmds) => {
        const e = makeEnv();
        try {
          createWatcher(e.ctx).processText(transcript(cmds));
          expect(e.requests()).toEqual([]);
          const lines = e.auditLines().map((l) => l.split("\t"));
          expect(lines.map((f) => f[3])).toEqual(cmds.map(() => "REJECTED_UNKNOWN_LIMB"));
          expect(lines.map((f) => f[1])).toEqual(cmds);
        } finally {
          e.cleanup();
        }
      }),
      { numRuns: numRuns(150) },
    );
  });

  it("property (complete mediation): an unusable limbs.json rejects all GRAFTs, with one audit line each", () => {
    fc.assert(
      fc.property(fc.array(anyLimb.map((l) => `GRAFT ${l}`), { minLength: 1, maxLength: 8 }), fc.constantFrom("missing", "garbage", "array"), (cmds, kind) => {
        const e = makeEnv(undefined, null);
        try {
          if (kind !== "missing") {
            mkdirSync(join(e.dir, "out"), { recursive: true });
            writeFileSync(e.ctx.limbsPath, kind === "garbage" ? "{{" : "[]");
          }
          createWatcher(e.ctx).processText(transcript(cmds));
          expect(e.requests()).toEqual([]);
          expect(e.auditLines().map((l) => l.split("\t")[3])).toEqual(cmds.map(() => "REJECTED_UNKNOWN_LIMB"));
        } finally {
          e.cleanup();
        }
      }),
      { numRuns: numRuns(100) },
    );
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
      { numRuns: numRuns(100) },
    );
  });

  it("property (rule 1): parse errors write nothing", () => {
    fc.assert(
      fc.property(fc.array(garbage, { maxLength: 20 }), (cmds) => {
        const lines = cmds.filter((c) => !/^(EXAMINE|ASSIGN|GRAFT) [A-Z]{1,32}$|^SEAL CRYPT$|^RAID$/.test(c));
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
      { numRuns: numRuns(200) },
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
        const ok = /^\[\[CRYPT ((EXAMINE|ASSIGN|GRAFT) [A-Z]{1,32}|SEAL|RAID)\]\]$/;
        const e = makeEnv();
        try {
          createWatcher(e.ctx).processText(transcript(cmds));
          expect(e.auditLines().length).toBe(cmds.filter((c) => ok.test(markerFor(c))).length);
        } finally {
          e.cleanup();
        }
      }),
      { numRuns: numRuns(200) },
    );
  });
});

function nodeWrite(path: string, data: string) {
  writeFileSync(path, data, { flag: "wx" });
}
