import { mkdtempSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeFsOps, type Ctx, type Fs } from "../src/bridge/watch.js";

export function makeEnv(fsOverride?: Partial<Fs>) {
  const dir = mkdtempSync(join(tmpdir(), "crypt-"));
  const ctx: Ctx = {
    fs: { ...nodeFsOps, ...fsOverride },
    sealPath: join(dir, ".crypt-seal"),
    auditPath: join(dir, "crypt-audit.log"),
    requestsDir: join(dir, "out", "requests"),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
  return {
    dir,
    ctx,
    requests: () => (existsSync(ctx.requestsDir) ? readdirSync(ctx.requestsDir) : []),
    auditLines: () =>
      existsSync(ctx.auditPath) ? readFileSync(ctx.auditPath, "utf8").split("\n").filter((l) => l !== "") : [],
    sealed: () => existsSync(ctx.sealPath),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** The marker line the game prints when it accepts a command. */
export const markerFor = (cmd: string) => `[[CRYPT ${cmd === "SEAL CRYPT" ? "SEAL" : cmd}]]`;

/** Realistic game output: input record, then a marker and a reply for each accepted command. */
export const transcript = (cmds: string[]) => cmds.map((c) => `> ${c}\n${markerFor(c)}\nsome game output\n`).join("");
