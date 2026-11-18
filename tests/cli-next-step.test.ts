import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nextLine, outcomeReason, readRaidContext, writeRaidContext } from "../scripts/cli/context.js";

const ROOT = resolve(".");
const BIN = join(ROOT, "bin", "crypt.mjs");
const FIXTURE = join(ROOT, "fixtures", "vulnerable-npm");
const dirs: string[] = [];
const work = (): string => {
  const d = mkdtempSync(join(tmpdir(), "crypt-next-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const crypt = (cwd: string, args: string[], input: string) =>
  spawnSync("node", [BIN, ...args], { cwd, input, encoding: "utf8", timeout: 60_000 });
const payloads = (cwd: string): string[] => (existsSync(join(cwd, "out", "prs")) ? readdirSync(join(cwd, "out", "prs")) : []);

describe("crypt raid next step", () => {
  it("names the first limb on stderr when not interactive", () => {
    const cwd = work();
    const r = crypt(cwd, ["raid", FIXTURE, "--offline"], "LOOK\n");
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("Next: type GRAFT JQUERY at the prompt");
  }, 90_000);

  it("plain next lines", () => {
    expect(nextLine("JQUERY")).toBe("Next: type GRAFT JQUERY at the prompt");
    expect(nextLine(null)).toMatch(/no limb needs a graft/);
  });
});

describe("crypt play after raid", () => {
  it("grafts the first limb with no flags, using the raid context", () => {
    const cwd = work();
    expect(crypt(cwd, ["raid", FIXTURE, "--offline"], "LOOK\n").status).toBe(0);
    const r = crypt(cwd, ["play"], "GRAFT JQUERY\n");
    expect(r.stdout).toContain("dry-run payload written");
    expect(payloads(cwd)).toHaveLength(1);
  }, 120_000);

  it("round-trips the context and ignores unreadable files", () => {
    const cwd = work();
    expect(readRaidContext(cwd)).toBeNull();
    writeRaidContext(cwd, { version: 1, target: "/x", advisories: { kind: "folder", dir: "/y" }, firstLimb: "A" });
    expect(readRaidContext(cwd)).toEqual({ version: 1, target: "/x", advisories: { kind: "folder", dir: "/y" }, firstLimb: "A" });
    writeFileSync(join(cwd, "out", "raid-context.json"), "{nope");
    expect(readRaidContext(cwd)).toBeNull();
  });

  it("gives each failing outcome a one-line reason", () => {
    for (const o of ["NO_FIX_AVAILABLE", "ERROR"]) {
      const s = outcomeReason(o);
      expect(s.length).toBeGreaterThan(20);
      expect(s).not.toContain("\n");
    }
  });
});

describe("crypt raid with a stale .crypt-seal", () => {
  it("says so on the first line and writes no payload", () => {
    const cwd = work();
    writeFileSync(join(cwd, ".crypt-seal"), "x\n");
    const r = crypt(cwd, ["raid", FIXTURE, "--offline"], "GRAFT JQUERY\n");
    expect(r.stderr.split("\n")[0]).toBe("The crypt is sealed (found .crypt-seal). Run 'crypt unseal' to lift it.");
    expect(r.stderr.match(/crypt is sealed \(found/g)).toHaveLength(1);
    expect(payloads(cwd)).toHaveLength(0);
  }, 90_000);
});
