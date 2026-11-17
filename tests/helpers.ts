import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeFsOps, type Ctx, type Fs } from "../src/bridge/watch.js";

/** Limb IDs known to the default test environment. */
export const KNOWN_LIMBS = ["ARM", "LEG", "JQUERY", "LODASH"];

/**
 * `limbs`: IDs written to out/limbs.json (default KNOWN_LIMBS); `null` writes no lookup table.
 */
export function makeEnv(fsOverride?: Partial<Fs>, limbs: readonly string[] | null = KNOWN_LIMBS) {
  const dir = mkdtempSync(join(tmpdir(), "crypt-"));
  if (limbs !== null) {
    mkdirSync(join(dir, "out"), { recursive: true });
    const table = Object.fromEntries(limbs.map((l) => [l, { ecosystem: "npm", name: l.toLowerCase(), version: "1.0.0" }]));
    writeFileSync(join(dir, "out", "limbs.json"), JSON.stringify(table));
  }
  const ctx: Ctx = {
    fs: { ...nodeFsOps, ...fsOverride },
    sealPath: join(dir, ".crypt-seal"),
    auditPath: join(dir, "crypt-audit.log"),
    requestsDir: join(dir, "out", "requests"),
    limbsPath: join(dir, "out", "limbs.json"),
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
