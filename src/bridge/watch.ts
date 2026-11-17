// Transcript watcher. Acts on marker lines printed by the game ("[[CRYPT GRAFT ARM]]" etc.),
// found by parseGameOutput and gated by the strict grammar. "> COMMAND" input lines never trigger anything.
// Fail-safe: on any error, nothing further is changed and the command is treated as sealed.
// No network access. A grammatical GRAFT of a limb listed in out/limbs.json writes a request; ASSIGN of such a limb is audited only.
// Complete mediation: an unknown limb ID (or an unreadable table) writes nothing and is audited REJECTED_UNKNOWN_LIMB.
import * as nodeFs from "node:fs";
import { dirname, join } from "node:path";
import { parseGameOutput, type GameEvent } from "./parse-output.js";

export type PathState = "present" | "absent";

export interface Fs {
  /** Returns the state of a path. Throws on any error other than "not found". */
  pathState(path: string): PathState;
  mkdirp(dir: string): void;
  /** Creates a file; fails if it already exists. */
  createExclusive(path: string, data: string): void;
  appendLine(path: string, line: string): void;
  remove(path: string): void;
  /** Reads a UTF-8 text file. Throws on any error, including "not found". */
  readText(path: string): string;
}

export interface Ctx {
  fs: Fs;
  sealPath: string;
  auditPath: string;
  requestsDir: string;
  /** Lookup table written by raise: the only authority for valid limb IDs (complete mediation). */
  limbsPath: string;
  now: () => Date;
}

export const nodeFsOps: Fs = {
  pathState(path) {
    try {
      nodeFs.statSync(path);
      return "present";
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return "absent";
      throw e;
    }
  },
  mkdirp(dir) {
    nodeFs.mkdirSync(dir, { recursive: true });
  },
  createExclusive(path, data) {
    nodeFs.writeFileSync(path, data, { flag: "wx" });
  },
  appendLine(path, line) {
    nodeFs.appendFileSync(path, line + "\n");
  },
  remove(path) {
    nodeFs.rmSync(path, { force: true });
  },
  readText(path) {
    return nodeFs.readFileSync(path, "utf8");
  },
};

export function defaultCtx(cwd: string = process.cwd()): Ctx {
  return {
    fs: nodeFsOps,
    sealPath: join(cwd, ".crypt-seal"),
    auditPath: join(cwd, "crypt-audit.log"),
    requestsDir: join(cwd, "out", "requests"),
    limbsPath: join(cwd, "out", "limbs.json"),
    now: () => new Date(),
  };
}

export type Outcome = "OK" | "NO_ACTION" | "REQUEST_WRITTEN" | "SEALED" | "REJECTED_SEALED" | "REJECTED_UNKNOWN_LIMB" | "ERROR";

export interface Watcher {
  processLine(line: string): void;
  processText(text: string): void;
}

export function createWatcher(ctx: Ctx): Watcher {
  let sealedInMemory = false; // once sealed (or unsure), stay sealed for this process
  let seq = 0;

  function isSealed(): boolean {
    if (sealedInMemory) return true;
    try {
      return ctx.fs.pathState(ctx.sealPath) === "present";
    } catch {
      return true; // cannot determine: refuse (R7.2)
    }
  }

  function audit(command: string, limb: string, outcome: Outcome): void {
    ctx.fs.appendLine(ctx.auditPath, [ctx.now().toISOString(), command, limb, outcome, "-"].join("\t"));
  }

  /** True only when out/limbs.json is readable, valid, and has the ID as a key. Anything else: false (fail-safe). */
  function isKnownLimb(limb: string): boolean {
    try {
      const table: unknown = JSON.parse(ctx.fs.readText(ctx.limbsPath));
      if (typeof table !== "object" || table === null || Array.isArray(table)) return false;
      return Object.prototype.hasOwnProperty.call(table, limb);
    } catch {
      return false;
    }
  }

  function tryAuditError(command: string, limb: string): void {
    try {
      audit(command, limb, "ERROR");
    } catch {
      // nothing more can be done safely
    }
  }

  function handleGraft(command: string, limb: string): void {
    if (isSealed()) {
      audit(command, limb, "REJECTED_SEALED");
      return;
    }
    if (!isKnownLimb(limb)) {
      audit(command, limb, "REJECTED_UNKNOWN_LIMB");
      return;
    }
    seq += 1;
    const file = join(ctx.requestsDir, `graft-${String(seq).padStart(3, "0")}-${limb.toLowerCase()}.json`);
    const body = {
      version: 1,
      action: "GRAFT",
      limb,
      command,
      requestedAt: ctx.now().toISOString(),
    };
    ctx.fs.mkdirp(dirname(file));
    ctx.fs.createExclusive(file, JSON.stringify(body, null, 2) + "\n");
    try {
      audit(command, limb, "REQUEST_WRITTEN");
    } catch (e) {
      sealedInMemory = true; // an unaudited action is not allowed to stand
      try {
        ctx.fs.remove(file);
      } catch {
        // best effort
      }
      throw e;
    }
  }

  function handleEvent(ev: GameEvent): void {
    if (!ev.ok) {
      process.stderr.write(`watch: rejected marker at line ${ev.lineNo}: ${ev.reason}\n`);
      return; // writes nothing else
    }
    const { command, parsed } = ev;
    try {
      switch (parsed.verb) {
        case "EXAMINE":
          audit(command, parsed.limb, "OK");
          break;
        case "ASSIGN":
          if (!isKnownLimb(parsed.limb)) {
            audit(command, parsed.limb, "REJECTED_UNKNOWN_LIMB");
          } else {
            audit(command, parsed.limb, "OK");
          }
          break;
        case "SEAL":
          sealedInMemory = true; // sealed even if the file cannot be created
          try {
            ctx.fs.createExclusive(ctx.sealPath, ctx.now().toISOString() + "\n");
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          }
          audit(command, "-", "SEALED");
          break;
        case "GRAFT":
          handleGraft(command, parsed.limb);
          break;
      }
    } catch (e) {
      process.stderr.write(`watch: error handling ${command}: ${(e as Error).message}\n`);
      tryAuditError(command, parsed.limb);
    }
  }

  function processText(text: string): void {
    for (const ev of parseGameOutput(text)) handleEvent(ev);
  }

  return { processLine: processText, processText };
}

/** Polls a transcript and feeds complete lines to the watcher. Returns a stop function. */
export function tail(path: string, w: Watcher, intervalMs = 250, fromStart = false): () => void {
  // Default: start at end-of-file so a restart does not replay old commands (review issue 2).
  let offset = 0;
  if (!fromStart) {
    try {
      offset = nodeFs.statSync(path).size;
    } catch {
      offset = 0; // file not there yet: everything written later is new
    }
  }
  let partial = "";
  const timer = setInterval(() => {
    try {
      const size = nodeFs.statSync(path).size;
      if (size < offset) {
        offset = 0;
        partial = "";
      }
      if (size === offset) return;
      const fd = nodeFs.openSync(path, "r");
      try {
        const buf = Buffer.alloc(size - offset);
        nodeFs.readSync(fd, buf, 0, buf.length, offset);
        offset = size;
        const lines = (partial + buf.toString("utf8")).split("\n");
        partial = lines.pop() ?? "";
        for (const l of lines) w.processLine(l);
      } finally {
        nodeFs.closeSync(fd);
      }
    } catch {
      // file not there yet or unreadable: change nothing, try again
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

function main(): void {
  const args = process.argv.slice(2);
  const once = args.includes("--once");
  const path = args.find((a) => !a.startsWith("--")) ?? "transcript.txt";
  const w = createWatcher(defaultCtx());
  if (once) {
    w.processText(nodeFs.readFileSync(path, "utf8"));
  } else {
    tail(path, w, 250, args.includes("--from-start"));
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`watch: fatal: ${(e as Error).message}\n`);
    process.exitCode = 1; // nothing was changed beyond what was already handled
  }
}
