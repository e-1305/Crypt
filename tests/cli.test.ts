import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { numRuns } from "./runs.js";
import { CliError, EXIT, EXIT_CODES, EXIT_TABLE, TargetError, ToolchainError, UsageError, exitCodeFor } from "../src/cli/exit.js";
import { helpText, versionText } from "../src/cli/help.js";
import { deriveRepoName } from "../src/cli/name.js";
import { COMMANDS, SPECS, parseCli } from "../src/cli/parse.js";
import { cliToolchainDir } from "../src/cli/paths.js";
import { GITHUB_BASE, parseGithubUrl } from "../src/cli/url.js";
import { seal, unseal } from "../scripts/cli/seal.js";
import { dfrotzPath, inform6Path, toolchainDir } from "../scripts/toolchain-dir.js";

const ROOT = resolve(".");
const BIN = join(ROOT, "bin", "crypt.mjs");
const FIXTURE = join(ROOT, "fixtures", "vulnerable-npm");

describe("parseCli: exhume --from", () => {
  it("accepts each import format", () => {
    for (const f of ["sarif", "dependabot", "trivy", "grype", "snyk"]) {
      expect(parseCli(["exhume", "scan.json", "--from", f]).flags).toEqual({ from: f });
    }
  });
  it("rejects an unknown format, a URL, and other commands", () => {
    expect(() => parseCli(["exhume", "scan.json", "--from", "bogus"])).toThrow(UsageError);
    expect(() => parseCli(["exhume", "https://github.com/a/b", "--from", "sarif"])).toThrow(UsageError);
    expect(() => parseCli(["raid", "scan.json", "--from", "sarif"])).toThrow(UsageError);
    expect(() => parseCli(["exhume", "scan.json", "--from"])).toThrow(UsageError);
  });
});

describe("parseCli: commands and flags", () => {
  it("parses exhume with every flag", () => {
    const p = parseCli(["exhume", "some/dir", "--out", "o.json", "--feeds", "f", "--cache", "c", "--offline"]);
    expect(p).toEqual({ command: "exhume", args: ["some/dir"], flags: { out: "o.json", feeds: "f", cache: "c", offline: true } });
  });
  it("accepts --flag=value", () => {
    expect(parseCli(["raise", "--out=build"]).flags).toEqual({ out: "build" });
  });
  it("parses raise, play, reraise, seal, unseal", () => {
    expect(parseCli(["raise"])).toEqual({ command: "raise", args: [], flags: {} });
    expect(parseCli(["raise", "c.json", "--out", "x"]).args).toEqual(["c.json"]);
    expect(parseCli(["play", "--story", "s.z8", "--target", "t", "--advisories", "a"]).flags).toEqual({ story: "s.z8", target: "t", advisories: "a" });
    expect(parseCli(["reraise", "--dry-run", "--repo", "o/n"]).flags).toEqual({ "dry-run": true, repo: "o/n" });
    expect(parseCli(["seal"]).command).toBe("seal");
    expect(parseCli(["unseal"]).command).toBe("unseal");
  });
  it("parses graft, inquisit and raid; limb IDs are upper-cased", () => {
    expect(parseCli(["graft", "jquery"])).toEqual({ command: "graft", args: ["JQUERY"], flags: {} });
    expect(parseCli(["inquisit", "LODASH", "--dry-run"]).flags).toEqual({ "dry-run": true });
    expect(parseCli(["raid", "fixtures/vulnerable-npm", "--offline", "--feeds", "f", "--cache", "c"]).flags).toEqual({ offline: true, feeds: "f", cache: "c" });
    expect(parseCli(["raid", `${GITHUB_BASE}/a/b`]).args).toEqual([`${GITHUB_BASE}/a/b`]);
  });
  it("maps --help, -h, help, --version, -V, version", () => {
    for (const a of [["--help"], ["-h"], ["help"], ["raid", "--help"]]) expect(parseCli(a).command).toBe("help");
    for (const a of [["--version"], ["-V"], ["version"]]) expect(parseCli(a).command).toBe("version");
  });
  it("rejects no command, unknown command and unknown flags", () => {
    expect(() => parseCli([])).toThrow(UsageError);
    expect(() => parseCli(["dance"])).toThrow(UsageError);
    expect(() => parseCli(["seal", "--force"])).toThrow(UsageError);
    expect(() => parseCli(["exhume", "x", "--live"])).toThrow(UsageError);
    expect(() => parseCli(["exhume", "x", "-z"])).toThrow(UsageError);
    expect(() => parseCli(["exhume", "x", "--constructor"])).toThrow(UsageError);
    expect(() => parseCli(["exhume", "x", "--offline=yes"])).toThrow(UsageError);
  });
  it("rejects a missing target, a missing flag value and extra arguments", () => {
    expect(() => parseCli(["exhume"])).toThrow(/target/);
    expect(() => parseCli(["raid"])).toThrow(UsageError);
    expect(() => parseCli(["graft"])).toThrow(UsageError);
    expect(() => parseCli(["exhume", "x", "--out"])).toThrow(/needs a value/);
    expect(() => parseCli(["exhume", "x", "y"])).toThrow(/unexpected argument/);
    expect(() => parseCli(["seal", "now"])).toThrow(UsageError);
  });
  it("rejects bad limb IDs, bad --repo and non-GitHub remote targets", () => {
    expect(() => parseCli(["graft", "j-query"])).toThrow(/limb/);
    expect(() => parseCli(["inquisit", "../x"])).toThrow(UsageError);
    expect(() => parseCli(["reraise", "--repo", "nonsense"])).toThrow(/owner\/name/);
    expect(() => parseCli(["raid", "https://example.com/a/b"])).toThrow(/GitHub/);
    expect(() => parseCli(["exhume", "git@github.com:a/b.git"])).toThrow(UsageError);
    expect(() => parseCli(["exhume", `${GITHUB_BASE}/a/b/extra`])).toThrow(UsageError);
  });
  it("graft --target takes a GitHub URL only with --live and without a different --repo", () => {
    const url = "https://github.com/e-1305/crypt-demo";
    const env = { GITHUB_TOKEN: "t" };
    expect(parseCli(["graft", "LODASH", "--live", "--target", url], env).flags).toEqual({ live: true, target: url });
    expect(parseCli(["graft", "LODASH", "--live", "--target", url, "--repo", "e-1305/crypt-demo"], env).flags.repo).toBe("e-1305/crypt-demo");
    expect(() => parseCli(["graft", "LODASH", "--target", url], env)).toThrow(/needs --live/);
    expect(() => parseCli(["graft", "LODASH", "--live", "--target", url, "--repo", "o/n"], env)).toThrow(/different repositories/);
    expect(() => parseCli(["graft", "LODASH", "--live", "--target", "https://example.com/a/b"], env)).toThrow(/not a GitHub repository URL/);
  });

  it("graft --live needs GITHUB_TOKEN; --repo may come from out/target.json (resolved by the command)", () => {
    expect(() => parseCli(["graft", "JQUERY", "--live", "--repo", "o/n"], {})).toThrow(/GITHUB_TOKEN/);
    expect(parseCli(["graft", "JQUERY", "--live"], { GITHUB_TOKEN: "t" }).flags).toEqual({ live: true });
    expect(parseCli(["graft", "JQUERY", "--live", "--repo", "o/n"], { GITHUB_TOKEN: "t" }).flags).toEqual({ live: true, repo: "o/n" });
    expect(parseCli(["graft", "JQUERY"], {}).flags).toEqual({});
  });
});

describe("parseCli: properties", () => {
  const tokens = fc.oneof(
    fc.string(),
    fc.constantFrom(...COMMANDS, "--offline", "--live", "--repo", "--out", "--feeds", "--cache", "--dry-run", "o/n", "JQUERY", "-", "--", "=", "--out=", `${GITHUB_BASE}/a/b`),
  );
  it("throws nothing but UsageError, and any thrown error maps to a documented exit code", () => {
    fc.assert(
      fc.property(fc.array(tokens, { maxLength: 8 }), fc.boolean(), (argv, token) => {
        try {
          const p = parseCli(argv, token ? { GITHUB_TOKEN: "t" } : {});
          expect(["help", "version", ...COMMANDS]).toContain(p.command);
        } catch (e) {
          expect(e).toBeInstanceOf(UsageError);
          expect(exitCodeFor(e)).toBe(EXIT.USAGE);
        }
      }),
      { numRuns: numRuns(500) },
    );
  });
  it("a parsed command only carries flags its command declares and the right argument count", () => {
    fc.assert(
      fc.property(fc.array(tokens, { maxLength: 8 }), (argv) => {
        let p;
        try {
          p = parseCli(argv);
        } catch {
          return;
        }
        if (p.command === "help" || p.command === "version") return;
        const spec = SPECS[p.command];
        for (const f of Object.keys(p.flags)) expect(Object.keys(spec.flags)).toContain(f);
        expect(p.args.length).toBeGreaterThanOrEqual(spec.positional.filter((x) => x.required).length);
        expect(p.args.length).toBeLessThanOrEqual(spec.positional.length);
      }),
      { numRuns: numRuns(500) },
    );
  });
  it("exitCodeFor always gives a documented code", () => {
    fc.assert(
      fc.property(fc.anything(), (e) => {
        expect(EXIT_CODES).toContain(exitCodeFor(e));
      }),
    );
    expect(exitCodeFor(new UsageError("x"))).toBe(2);
    expect(exitCodeFor(new ToolchainError("x"))).toBe(3);
    expect(exitCodeFor(new TargetError("x"))).toBe(4);
    expect(exitCodeFor(new CliError("x"))).toBe(1);
    expect(exitCodeFor(new Error("x"))).toBe(1);
  });
});

describe("parseGithubUrl", () => {
  const seg = fc.stringMatching(/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,20}$/).filter((s) => !/^\.+$/.test(s));
  it("accepts https github URLs with optional .git and trailing slash", () => {
    expect(parseGithubUrl(`${GITHUB_BASE}/e-1305/Crypt`)).toEqual({ owner: "e-1305", repo: "Crypt" });
    expect(parseGithubUrl(`${GITHUB_BASE}/e-1305/Crypt.git`)).toEqual({ owner: "e-1305", repo: "Crypt" });
    expect(parseGithubUrl(`${GITHUB_BASE}/e-1305/Crypt/`)).toEqual({ owner: "e-1305", repo: "Crypt" });
    fc.assert(
      fc.property(seg, seg, (o, r) => {
        const got = parseGithubUrl(`${GITHUB_BASE}/${o}/${r}`);
        expect(got?.owner).toBe(o);
        expect(got?.repo).toBe(r.endsWith(".git") ? r.slice(0, -4) : r);
      }),
    );
  });
  it("rejects option-like input, other hosts, extra paths and dot segments", () => {
    for (const bad of [
      "--upload-pack=touch /tmp/x",
      "-c",
      `${GITHUB_BASE}/-x/y`,
      `${GITHUB_BASE}/x/-y`,
      "http://github.com/a/b",
      "https://gitlab.com/a/b",
      "https://github.com.evil.example/a/b",
      "https://evil.example/https://github.com/a/b",
      `${GITHUB_BASE}/a`,
      `${GITHUB_BASE}/a/b/c`,
      `${GITHUB_BASE}/a/b?x=1`,
      `${GITHUB_BASE}/a/b#frag`,
      `${GITHUB_BASE}/../b`,
      `${GITHUB_BASE}/a/..`,
      `${GITHUB_BASE}/a/b\n`,
      "",
    ]) {
      expect(parseGithubUrl(bad), bad).toBeNull();
    }
  });
  it("rejects whitespace and shell metacharacters anywhere in owner or repo", () => {
    fc.assert(
      fc.property(seg, fc.constantFrom(" ", "\t", "\n", ";", "&", "|", "$", "`", "(", ")", "<", ">", "'", '"', "\\", "*", "!", "~", "%", "?", "#", "@", ":", "/"), fc.boolean(), (s, ch, inOwner) => {
        const url = inOwner ? `${GITHUB_BASE}/${s}${ch}x/repo` : `${GITHUB_BASE}/owner/${s}${ch}x`;
        const got = parseGithubUrl(url);
        // "/" in the repo part is an extra path segment: also rejected.
        expect(got, url).toBeNull();
      }),
    );
  });
  it("never accepts text that does not start with the exact base", () => {
    fc.assert(fc.property(fc.string(), (s) => {
      const got = parseGithubUrl(s);
      if (got) expect(s.startsWith(`${GITHUB_BASE}/${got.owner}/${got.repo}`)).toBe(true);
    }));
  });
});

describe("creature name and toolchain location", () => {
  it("uses the repo segment for a GitHub URL", () => {
    expect(deriveRepoName({ url: `${GITHUB_BASE}/o/widget.git`, packageName: "ignored", path: "/tmp/x" })).toBe("widget");
  });
  it("uses the package name without scope, else the directory name, else unknown", () => {
    expect(deriveRepoName({ packageName: "@scope/pkg", path: "/a/b" })).toBe("pkg");
    expect(deriveRepoName({ packageName: "plain", path: "/a/b" })).toBe("plain");
    expect(deriveRepoName({ packageName: "", path: "/a/b/" })).toBe("b");
    expect(deriveRepoName({ packageName: null, path: "/" })).toBe("unknown");
  });
  it("cliToolchainDir: CRYPT_TOOLCHAIN_DIR, then XDG_CACHE_HOME, then ~/.cache", () => {
    expect(cliToolchainDir({ CRYPT_TOOLCHAIN_DIR: "/t", XDG_CACHE_HOME: "/x" }, "/h")).toBe("/t");
    expect(cliToolchainDir({ XDG_CACHE_HOME: "/x/" }, "/h")).toBe("/x/crypt/toolchain");
    expect(cliToolchainDir({ XDG_CACHE_HOME: "rel" }, "/h")).toBe("/h/.cache/crypt/toolchain");
    expect(cliToolchainDir({}, "/h")).toBe("/h/.cache/crypt/toolchain");
  });
  it("toolchainDir keeps the repo .toolchain by default and honours CRYPT_TOOLCHAIN_DIR", () => {
    expect(toolchainDir({})).toBe(join(ROOT, ".toolchain"));
    expect(toolchainDir({ CRYPT_TOOLCHAIN_DIR: "/opt/tc" })).toBe("/opt/tc");
    expect(inform6Path({ CRYPT_TOOLCHAIN_DIR: "/opt/tc" })).toBe("/opt/tc/Inform6/inform6");
    expect(dfrotzPath({ CRYPT_TOOLCHAIN_DIR: "/opt/tc" })).toBe("/opt/tc/frotz/dfrotz");
  });
});

describe("help text", () => {
  it("lists every command, flag and exit code", () => {
    const h = helpText();
    for (const c of COMMANDS) expect(h).toContain(c);
    for (const s of Object.values(SPECS)) for (const f of Object.keys(s.flags)) expect(h).toContain(`--${f}`);
    for (const [code, meaning] of EXIT_TABLE) {
      expect(h).toContain(String(code));
      expect(h).toContain(meaning);
    }
    expect(versionText()).toMatch(/^crypt \d+\.\d+\.\d+\n$/);
  });
  it("has no em dashes", () => {
    expect(helpText()).not.toContain("\u2014");
  });
});

describe("seal and unseal", () => {
  it("seal writes .crypt-seal and audits SEALED; unseal removes it and audits UNSEALED", () => {
    const cwd = mkdtempSync(join(tmpdir(), "crypt-seal-"));
    try {
      expect(seal(cwd)).toMatch(/sealed/);
      expect(existsSync(join(cwd, ".crypt-seal"))).toBe(true);
      expect(seal(cwd)).toMatch(/already/);
      expect(unseal(cwd)).toMatch(/lifted/);
      expect(existsSync(join(cwd, ".crypt-seal"))).toBe(false);
      expect(unseal(cwd)).toMatch(/not sealed/);
      const outcomes = readFileSync(join(cwd, "crypt-audit.log"), "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")[3]);
      expect(outcomes).toEqual(["SEALED", "UNSEALED"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

function crypt(args: string[], opts: { cwd?: string; input?: string; env?: Record<string, string> } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: opts.cwd ?? ROOT,
    input: opts.input ?? "",
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, ...opts.env },
  });
}

describe("bin/crypt.mjs exit codes", () => {
  it("--help exits 0 and mentions every command and every exit code", () => {
    const r = crypt(["--help"]);
    expect(r.status).toBe(0);
    for (const c of COMMANDS) expect(r.stdout).toContain(c);
    for (const [code] of EXIT_TABLE) expect(r.stdout).toContain(String(code));
  });
  it("--version exits 0", () => {
    const r = crypt(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(versionText());
  });
  it("an unknown command exits 2 with one line and no stack", () => {
    const r = crypt(["dance"]);
    expect(r.status).toBe(2);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
    expect(r.stderr).toMatch(/^crypt: unknown command/);
  });
  it("a missing target exits 2", () => {
    expect(crypt(["exhume"]).status).toBe(2);
  });
  it("exhume of a nonexistent path exits 4 without a stack trace", () => {
    const r = crypt(["exhume", join(tmpdir(), "crypt-does-not-exist-xyz")]);
    expect(r.status).toBe(4);
    expect(r.stderr).not.toMatch(/^\s+at /m);
    expect(r.stderr).toMatch(/^crypt: /);
  });
  it("a directory without a manifest exits 4", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-empty-"));
    try {
      const r = crypt(["exhume", d]);
      expect(r.status).toBe(4);
      expect(r.stderr).toMatch(/package-lock\.json/);
      expect(r.stderr).not.toMatch(/^\s+at /m);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
  it("a non-GitHub URL exits 2 before any process starts", () => {
    const r = crypt(["exhume", "https://example.com/a/b"]);
    expect(r.status).toBe(2);
  });
  it("graft --live without GITHUB_TOKEN exits 2", () => {
    const env = { GITHUB_TOKEN: "" };
    const r = crypt(["graft", "JQUERY", "--live", "--repo", "o/n"], { env });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/GITHUB_TOKEN/);
  });
  it("seal and unseal work from any directory", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-cwd-"));
    try {
      expect(crypt(["seal"], { cwd: d }).status).toBe(0);
      expect(existsSync(join(d, ".crypt-seal"))).toBe(true);
      expect(crypt(["unseal"], { cwd: d }).status).toBe(0);
      expect(existsSync(join(d, ".crypt-seal"))).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
  it("exhume of the fixture works from a scratch directory", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-cwd-"));
    try {
      const r = crypt(["exhume", FIXTURE, "--offline"], { cwd: d });
      expect(r.status).toBe(0);
      const c = JSON.parse(readFileSync(join(d, "out", "creature.json"), "utf8"));
      expect(c.limbs.length).toBeGreaterThan(0);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
  it("a missing toolchain exits 3 with the fix, not a stack", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-cwd-"));
    try {
      // PATH without git, make or cc makes the preflight fail before any build starts.
      const empty = join(d, "bin");
      mkdirSync(empty);
      const r = spawnSync(process.execPath, [BIN, "raise"], {
        cwd: d,
        encoding: "utf8",
        env: { ...process.env, PATH: empty, CRYPT_TOOLCHAIN_DIR: join(d, "tc") },
      });
      expect(r.status).toBe(3);
      expect(r.stderr).toMatch(/not found\. Install build tools/);
      expect(r.stderr).not.toMatch(/^\s+at /m);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

const haveToolchain =
  existsSync(join(toolchainDir(), "Inform6", "inform6")) && existsSync(join(toolchainDir(), "frotz", "dfrotz")) && existsSync(join(toolchainDir(), "inc", "Parser.h"));

describe("raid end to end", () => {
  it.skipIf(!haveToolchain)("GRAFT JQUERY writes one payload; SEAL CRYPT then GRAFT LODASH writes nothing more", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-raid-"));
    try {
      const env = { CRYPT_TOOLCHAIN_DIR: toolchainDir() };
      const r = crypt(["raid", FIXTURE, "--offline"], { cwd: d, input: "GRAFT JQUERY\nSEAL CRYPT\nGRAFT LODASH\n", env });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("PLATE I.");
      const prs = readdirSync(join(d, "out", "prs"));
      expect(prs).toEqual(["crypt-graft-jquery-3.5.0.json"]);
      const pay = JSON.parse(readFileSync(join(d, "out", "prs", prs[0]!), "utf8"));
      expect([pay.name, pay.from, pay.to]).toEqual(["jquery", "3.4.1", "3.5.0"]);
      expect(r.stdout).toContain("dry-run payload written to out/prs/crypt-graft-jquery-3.5.0.json");
      const outcomes = readFileSync(join(d, "crypt-audit.log"), "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")[3]);
      expect(outcomes).toEqual(["REQUEST_WRITTEN", "DRYRUN_WRITTEN", "SEALED", "REJECTED_SEALED"]);
      expect(existsSync(join(d, ".crypt-seal"))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }, 120_000);

  it.skipIf(!haveToolchain)("typing RAID prints the marker, is audited as NO_ACTION and opens no PR", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-raid-"));
    try {
      const r = crypt(["raid", FIXTURE, "--offline"], { cwd: d, input: "RAID\nraid\nRAID JQUERY\n", env: { CRYPT_TOOLCHAIN_DIR: toolchainDir() } });
      expect(r.status, r.stderr).toBe(0);
      const lines = readFileSync(join(d, "crypt-audit.log"), "utf8").split("\n").filter(Boolean).map((l) => l.split("\t"));
      expect(lines.map((l) => [l[1], l[3]])).toEqual([["RAID", "NO_ACTION"], ["RAID", "NO_ACTION"]]); // the story ignores case, like graft; "RAID JQUERY" is a parser error
      expect(existsSync(join(d, "out", "prs"))).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }, 120_000);

  it.skipIf(!haveToolchain)("a sealed crypt stays sealed at the start of a raid", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-raid-"));
    try {
      writeFileSync(join(d, ".crypt-seal"), "x\n");
      const r = crypt(["raid", FIXTURE, "--offline"], { cwd: d, input: "GRAFT JQUERY\n", env: { CRYPT_TOOLCHAIN_DIR: toolchainDir() } });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stderr).toContain("crypt unseal");
      expect(existsSync(join(d, "out", "prs"))).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }, 120_000);
});
