import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { numRuns } from "./runs.js";
import { vi } from "vitest";
import { check as checkHookEvidence } from "../scripts/ci/hook-evidence-check.mjs";

// These properties spawn a shell per run: cap runs (even in CI) and allow a longer timeout.
vi.setConfig({ testTimeout: 120_000 });
import { BEGIN, END, parseTasks, renderSpec, splice, testOf } from "../scripts/hooks/kiro-trace.js";

const ROOT = resolve(import.meta.dirname, "..");
const HOOKS = join(ROOT, "scripts", "hooks");
// The M word is assembled so this test file never holds a merge call itself.
const M = "mer" + "ge";

function sh(script: string, args: string[], cwd: string, env: Record<string, string> = {}, input = "") {
  return spawnSync("bash", [join(cwd, "scripts", "hooks", script), ...args], { cwd, encoding: "utf8", input, env: { ...process.env, ...env } });
}

/** A temp copy of the repo scripts with the given extra files; hooks cd to their own repo root. */
function repo(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "crypt-hooks-"));
  mkdirSync(join(d, "scripts"), { recursive: true });
  cpSync(HOOKS, join(d, "scripts", "hooks"), { recursive: true });
  cpSync(join(ROOT, "scripts", "ci"), join(d, "scripts", "ci"), { recursive: true });
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(d, p)), { recursive: true });
    writeFileSync(join(d, p), c);
  }
  return d;
}

function run(script: string, files: Record<string, string>, args: string[], env: Record<string, string> = {}, input = "") {
  const d = repo(files);
  try {
    return { ...sh(script, args, d, env, input), dir: d };
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

const clean = "export const x = 1;\n";

describe("failsafe-check.sh (hook 2)", () => {
  it("passes on the real repository", () => {
    const r = sh("failsafe-check.sh", [], ROOT);
    expect(r.status, r.stderr).toBe(0);
  });
  it("passes on clean code and on the state label", () => {
    const r = run("failsafe-check.sh", { "src/mcp/a.ts": 'const s = "awaiting-human-merge";\n' }, ["src/mcp/a.ts"]);
    expect(r.status, r.stderr).toBe(0);
  });
  const bad: [string, string][] = [
    ["a merge call", `await client.${M}(5);\n`],
    ["a merge endpoint", "const u = `/repos/o/r/pulls/5/" + M + "`;\n"],
    ["a merge command", `run("gh pr ${M} 5");\n`],
    ["a token in console.log", "console.log(process.env.GITHUB_TOKEN);\n"],
    ["a token value in an audit call", 'audit("ghp_abcdefghijklmnopqrstuvwxyz0123456789");\n'],
    ["an Authorization header in a log", "logger.info(`Authorization: ${h}`);\n"],
    ["a token held in a variable then logged", "const h = process.env.GITHUB_TOKEN;\nconsole.log(h);\n"],
    ["a token in a multi-line log call", "console.log(\n  'x',\n  process.env.GITHUB_TOKEN,\n);\n"],
    ["a token held in a typed variable then audited", "const t: string = process.env.GITHUB_TOKEN ?? '';\nauditWrite(`got ${t}`);\n"],
    ["a git blame call", 'run("git blame f");\n'],
    ["a git blame call with -C", 'execFile("git", ["-C", d, "blame", f]);\n'],
    ["a quoted merge token in an argument array", 'spawn("gh", ["pr", "' + M + '", "5"]);\n'],
  ];
  for (const [name, line] of bad) {
    it(`fails on ${name}`, () => {
      const r = run("failsafe-check.sh", { "src/necromancer/a.ts": clean + line }, ["src/necromancer/a.ts"]);
      expect(r.status, r.stdout).toBe(1);
      expect(r.stderr).toContain("failsafe-check:");
    });
  }
  it("does not flag a variable that is logged but holds no secret", () => {
    const r = run("failsafe-check.sh", { "src/mcp/a.ts": "const h = 1;\nconsole.log(h);\nconst t = process.env.GITHUB_TOKEN;\nuse(t);\n" }, ["src/mcp/a.ts"]);
    expect(r.status, r.stderr).toBe(0);
  });
  it("reads the saved file from the Kiro event on STDIN", () => {
    const event = JSON.stringify({ hook_event_name: "PostFileSave", tool_input: { path: "src/inquisitor/a.ts" } });
    const r = run("failsafe-check.sh", { "src/inquisitor/a.ts": "console.error(GITHUB_TOKEN);\n" }, [], {}, event);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("src/inquisitor/a.ts");
  });
  it("ignores files outside necromancer, inquisitor and mcp", () => {
    const r = run("failsafe-check.sh", { "src/other/a.ts": `client.${M}(1);\n` }, ["src/other/a.ts"]);
    expect(r.status).toBe(0);
  });
  it("any line containing 'gh pr merge' is flagged", () => {
    const pad = fc.stringMatching(/^[a-z ]{0,10}$/);
    fc.assert(
      fc.property(pad, pad, (a, b) => {
        const r = run("failsafe-check.sh", { "src/mcp/p.ts": `${a} gh pr ${M} ${b}\n` }, ["src/mcp/p.ts"]);
        return r.status === 1;
      }),
      { numRuns: Math.min(numRuns(8), 40) },
    );
  });
});

describe("blameless-copy-check.sh (hook 5)", () => {
  it("passes on the real repository", () => {
    const r = sh("blameless-copy-check.sh", [], ROOT);
    expect(r.status, r.stderr).toBe(0);
  });
  it("passes praise and action copy", () => {
    const html = '<p>Healed by Ada. Update lodash to 4.17.21.</p>\n';
    const r = run("blameless-copy-check.sh", { "web/a.html": html }, ["web/a.html"]);
    expect(r.status, r.stderr).toBe(0);
  });
  const bad: [string, string, string][] = [
    ["blame", "src/raise/a.ts", 'out.push("It is the fault of @sam");\n'],
    ["'your fault'", "web/a.js", 'say("This is your fault");\n'],
    ["'broke it'", "web/a.js", "say('Sam broke it');\n"],
    ["'authored by'", "src/raise/a.ts", 'out.push("Rot authored by Sam");\n'],
    ["a prohibition in a string", "web/a.js", 'say("Don\'t paste a token here");\n'],
    ["'never' in HTML text", "web/a.html", "<p>Never close this tab</p>\n"],
  ];
  for (const [name, file, line] of bad) {
    it(`fails on ${name}`, () => {
      const r = run("blameless-copy-check.sh", { [file]: line }, [file]);
      expect(r.status, r.stdout).toBe(1);
      expect(r.stderr).toContain("blameless-copy-check:");
    });
  }
  it("ignores developer comments and vendored code", () => {
    const r = run(
      "blameless-copy-check.sh",
      { "src/raise/a.ts": "// never reuse an id\nconst a = 1;\n", "web/vendor/z.js": 'x("never");\n' },
      ["src/raise/a.ts", "web/vendor/z.js"],
    );
    expect(r.status, r.stderr).toBe(0);
  });
  it("any string naming a blame word is flagged", () => {
    const pad = fc.stringMatching(/^[a-z ]{0,10}$/);
    fc.assert(
      fc.property(pad, pad, fc.constantFrom("blame", "your fault", "broke it", "authored by"), (a, b, w) => {
        const r = run("blameless-copy-check.sh", { "web/p.js": `say("${a} ${w} ${b}");\n` }, ["web/p.js"]);
        return r.status === 1;
      }),
      { numRuns: Math.min(numRuns(8), 40) },
    );
  });
});

describe("deps-check.sh (hook 4 helper)", () => {
  const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) =>
    JSON.stringify({ name: "t", dependencies: deps, devDependencies: dev });
  it("passes on the real repository", () => {
    const r = sh("deps-check.sh", [], ROOT);
    expect(r.status, r.stderr).toBe(0);
  });
  it("reports a dependency missing from the attribution file", () => {
    const d = repo({ "package.json": pkg({ lodash: "1" }, { vitest: "1" }), "docs/ATTRIBUTION.md": "| vitest | MIT |\n" });
    try {
      const r = sh("deps-check.sh", [d], d);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("lodash");
      expect(r.stderr).not.toContain("vitest");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
  it("does not accept a longer package name as attribution", () => {
    const d = repo({ "package.json": pkg({ zod: "1" }), "docs/ATTRIBUTION.md": "| zod-to-json-schema | MIT |\n" });
    try {
      expect(sh("deps-check.sh", [d], d).status).toBe(1);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
  it("any dependency name absent from the attribution file is reported", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{3,12}$/), (name) => {
        const d = repo({ "package.json": pkg({ [name]: "1" }), "docs/ATTRIBUTION.md": "| nothing-here | MIT |\n" });
        try {
          const r = sh("deps-check.sh", [d], d);
          return name === "nothing" || (r.status === 1 && r.stderr.includes(name));
        } finally {
          rmSync(d, { recursive: true, force: true });
        }
      }),
      { numRuns: Math.min(numRuns(8), 40) },
    );
  });
});

describe("related-tests.sh (hook 1)", () => {
  it("passes the saved src file to vitest related", () => {
    const r = run("related-tests.sh", { "src/a/b.ts": clean }, ["src/a/b.ts"], { CRYPT_HOOK_VITEST: "echo vitest" });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("vitest related --run --passWithNoTests src/a/b.ts");
  });
  it("reads the saved file from STDIN and ignores non-src files", () => {
    const event = JSON.stringify({ file: "src/a/b.ts", other: "README.md" });
    const r = run("related-tests.sh", { "src/a/b.ts": clean, "README.md": "x" }, [], { CRYPT_HOOK_VITEST: "echo vitest" }, event);
    expect(r.stdout.trim()).toBe("vitest related --run --passWithNoTests src/a/b.ts");
  });
  it("does nothing for a file outside src", () => {
    const r = run("related-tests.sh", { "docs/a.ts": clean }, ["docs/a.ts"], { CRYPT_HOOK_VITEST: "echo vitest" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("nothing to run");
  });
  it("propagates a failing test run", () => {
    const r = run("related-tests.sh", { "src/a.ts": clean }, ["src/a.ts"], { CRYPT_HOOK_VITEST: "false" });
    expect(r.status).not.toBe(0);
  });
});

describe("kiro-trace.ts (hook 3)", () => {
  const md = "# T\n## A\n- [x] A1.1 Spec `docs/x.md`\n- [ ] A1.2 Tests `tests/y.test.ts`\n- [x] 3. Run `npm run spike` | pipe\n";
  it("parses checkbox state, ids and text", () => {
    expect(parseTasks(md).map((t) => [t.id, t.done])).toEqual([["A1.1", true], ["A1.2", false], ["3", true]]);
  });
  it("finds the test from the task text", () => {
    expect(testOf("x `tests/y.test.ts`")).toBe("`tests/y.test.ts`");
    expect(testOf("x `npm run spike`")).toBe("`npm run spike`");
    expect(testOf("x")).toBe("n/a");
  });
  it("renders open, uncommitted and committed tasks and escapes pipes", () => {
    const out = renderSpec("s", parseTasks(md), (t) => (t.id === "A1.1" ? "abc1234" : ""));
    expect(out).toContain("| A1.1 Spec docs/x.md | `abc1234` | n/a |");
    expect(out).toContain("| A1.2 Tests tests/y.test.ts | open | `tests/y.test.ts` |");
    expect(out).toContain("| 3 Run npm run spike \\| pipe | uncommitted | `npm run spike` |");
  });
  it("splice is idempotent and keeps the text around the block", () => {
    const block = `${BEGIN}\nrows\n${END}`;
    const once = splice("# Doc\n\nbefore\n", block);
    expect(splice(once, block)).toBe(once);
    const changed = splice(once.replace("rows", "old") + "after\n", block);
    expect(changed).toContain("before");
    expect(changed).toContain("after");
    expect(changed).toContain("rows");
    expect(changed).not.toContain("old");
  });
  it("splice never changes a document that already holds the same block, for any surrounding text", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z \n]{0,40}$/), fc.stringMatching(/^[a-z \n]{0,40}$/), (a, b) => {
        const block = `${BEGIN}\nrows\n${END}`;
        const doc = `${a}${block}${b}`;
        return splice(doc, block) === doc;
      }),
      { numRuns: Math.min(numRuns(50), 40) },
    );
  });
  it("running it twice on the repository prints the same table", () => {
    const run1 = spawnSync("npx", ["--no-install", "tsx", "scripts/hooks/kiro-trace.ts", "epic-a-production"], { cwd: ROOT, encoding: "utf8" });
    const run2 = spawnSync("npx", ["--no-install", "tsx", "scripts/hooks/kiro-trace.ts", "epic-a-production"], { cwd: ROOT, encoding: "utf8" });
    expect(run1.status, run1.stderr).toBe(0);
    expect(run1.stdout).toBe(run2.stdout);
    expect(run1.stdout).toContain("| Task | Commit | Test |");
  });
});

describe("hook definitions in .kiro/hooks", () => {
  const dir = join(ROOT, ".kiro", "hooks");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const hooks: Record<string, any>[] = files.flatMap((f) => {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    return (j.hooks as Record<string, any>[]).map((h) => ({ file: f, version: j.version, ...h }));
  });
  const byName = (re: RegExp) => hooks.find((h) => re.test(h.name))!;
  const matches = (h: Record<string, any>, path: string) => new RegExp(h.matcher).test(path);

  it("has at least five valid hooks in the documented format", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const h of hooks) {
      expect(h.version, h.file).toBe("v1");
      expect(typeof h.name, h.file).toBe("string");
      expect(["PostFileSave", "PostToolUse", "Stop", "SessionStart"], h.file).toContain(h.trigger);
      if (h.trigger === "PostFileSave") expect(() => new RegExp(h.matcher), h.file).not.toThrow();
      if (h.trigger === "PostToolUse") expect(h.matcher, h.file).toBe("write");
      expect(["command", "agent"], h.file).toContain(h.action.type);
      expect(h.action.type === "command" ? h.action.command : h.action.prompt, h.file).toBeTruthy();
    }
  });
  it("each PostToolUse twin filters on the same regex as its PostFileSave command hook", () => {
    const twins = hooks.filter((h) => h.trigger === "PostToolUse");
    expect(twins).toHaveLength(5);
    for (const t of twins) {
      const original = hooks.find((h) => h.file === t.file && h.trigger === "PostFileSave" && h.action.type === "command")!;
      const filter = /CRYPT_HOOK_FILTER='([^']*)'/.exec(t.action.command)![1]!;
      expect(filter, t.file).toBe(original.matcher);
      expect(t.action.command, t.file).toContain("CRYPT_HOOK_TRIGGER=PostToolUse");
    }
  });
  it("a Stop and a SessionStart hook exist and log with their trigger", () => {
    for (const [trigger, name] of [["Stop", "failsafe-guard-on-stop"], ["SessionStart", "session-start-log"]] as const) {
      const h = hooks.find((x) => x.trigger === trigger)!;
      expect(h.action.command).toContain(`CRYPT_HOOK_TRIGGER=${trigger}`);
      expect(h.action.command).toContain(`run-logged.sh ${name} `);
    }
  });
  it("every command hook runs a script that exists", () => {
    for (const h of hooks.filter((x) => x.action.type === "command")) {
      const script = /scripts\/(?:hooks|ci)\/\S+/.exec(h.action.command)![0];
      expect(readFileSync(join(ROOT, script), "utf8").length, h.file).toBeGreaterThan(0);
    }
  });
  it("hook 1 matches src/**/*.ts", () => {
    const h = byName(/Related tests/);
    expect(matches(h, "src/exhume/rank.ts")).toBe(true);
    expect(matches(h, "scripts/a.ts")).toBe(false);
    expect(matches(h, "src/a.md")).toBe(false);
  });
  it("hook 2 matches necromancer, inquisitor and mcp only", () => {
    const h = byName(/Failsafe guard/);
    for (const p of ["src/necromancer/index.ts", "src/inquisitor/index.ts", "src/mcp/core.ts"]) expect(matches(h, p), p).toBe(true);
    for (const p of ["src/raise/generate.ts", "src/bridge/watch.ts"]) expect(matches(h, p), p).toBe(false);
  });
  it("hook 3 matches spec tasks.md only", () => {
    const h = byName(/traceability.*\(agent\)/);
    expect(matches(h, ".kiro/specs/epic-a-production/tasks.md")).toBe(true);
    expect(matches(h, ".kiro/specs/epic-a-production/design.md")).toBe(false);
    expect(h.action.type).toBe("agent");
  });
  it("hook 4 matches package.json and asks the agent to update the attribution file", () => {
    const h = byName(/Attribution.*\(agent\)/);
    expect(matches(h, "package.json")).toBe(true);
    expect(matches(h, "fixtures/vulnerable-npm/package.json")).toBe(true);
    expect(matches(h, "package-lock.json")).toBe(false);
    expect(h.action.type).toBe("agent");
    expect(h.action.prompt).toContain("docs/ATTRIBUTION.md");
    expect(h.action.prompt).toContain("deps-check.sh");
  });
  it("hooks 3 and 4 also keep a command entry with the same matcher", () => {
    for (const [cmd, agent] of [[/tasks save$/, /traceability.*\(agent\)/], [/package\.json save$/, /Attribution.*\(agent\)/]] as const) {
      expect(byName(cmd).action.type).toBe("command");
      expect(byName(cmd).matcher).toBe(byName(agent).matcher);
    }
  });
  it("hook 5 matches src/raise and web copy", () => {
    const h = byName(/Blameless/);
    for (const p of ["src/raise/generate.ts", "web/app.js", "web/index.html"]) expect(matches(h, p), p).toBe(true);
    expect(matches(h, "src/exhume/rank.ts")).toBe(false);
  });
  it("no hook writes, commits or reaches the network", () => {
    for (const h of hooks.filter((x) => x.action.type === "command")) {
      expect(h.action.command, h.file).not.toMatch(/git (commit|push)|curl|wget|npm publish|>/);
    }
  });
});

describe("run-logged.sh and the hook evidence check", () => {
  const logOf = (d: string) => readFileSync(join(d, "docs", "evidence", "hook-runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);

  it("logs one valid line, keeps the exit code, and never stores the payload or a token", () => {
    const d = repo({ "src/mcp/a.ts": 'console.log(process.env.GITHUB_TOKEN);\n' });
    try {
      const payload = JSON.stringify({ trigger: "PostFileSave", path: join(d, "src/mcp/a.ts"), secret: "ghp_abcdefghijklmnop1234", author: "Jane Roe" });
      const r = spawnSync("bash", ["scripts/hooks/run-logged.sh", "failsafe-guard-on-save", "scripts/hooks/failsafe-check.sh"], { cwd: d, encoding: "utf8", input: payload });
      expect(r.status).toBe(1);
      const rows = logOf(d);
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]!)).toEqual(["ts", "hook", "trigger", "file", "exit", "summary"]);
      expect(rows[0]).toMatchObject({ hook: "failsafe-guard-on-save", trigger: "PostFileSave", file: "src/mcp/a.ts", exit: 1 });
      const raw = readFileSync(join(d, "docs", "evidence", "hook-runs.jsonl"), "utf8");
      expect(raw).not.toContain("ghp_");
      expect(raw).not.toContain("Jane");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("marks a run without an event as manual", () => {
    const d = repo({ "src/mcp/a.ts": clean });
    try {
      const r = spawnSync("bash", ["scripts/hooks/run-logged.sh", "failsafe-guard-on-save", "scripts/hooks/failsafe-check.sh", "src/mcp/a.ts"], { cwd: d, encoding: "utf8", input: "" });
      expect(r.status, r.stderr).toBe(0);
      expect(logOf(d)[0]).toMatchObject({ trigger: "manual", file: "src/mcp/a.ts", exit: 0 });
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("PostToolUse filter: logs a matching write with the PostToolUse trigger, skips a non-matching one", () => {
    const d = repo({ "src/mcp/a.ts": clean, "docs/x.md": "x\n" });
    try {
      const env = { ...process.env, CRYPT_HOOK_TRIGGER: "PostToolUse", CRYPT_HOOK_FILTER: "(^|/)src/(necromancer|inquisitor|mcp)/.*\\.ts$" };
      const run = (path: string) => spawnSync("bash", ["scripts/hooks/run-logged.sh", "failsafe-guard-on-save", "scripts/hooks/failsafe-check.sh"], { cwd: d, encoding: "utf8", env, input: JSON.stringify({ tool_name: "write", tool_input: { path } }) });
      expect(run(join(d, "docs/x.md")).status).toBe(0);
      expect(existsSync(join(d, "docs", "evidence", "hook-runs.jsonl"))).toBe(false);
      const r = run(join(d, "src/mcp/a.ts"));
      expect(r.status, r.stderr).toBe(0);
      expect(logOf(d)).toHaveLength(1);
      expect(logOf(d)[0]).toMatchObject({ hook: "failsafe-guard-on-save", trigger: "PostToolUse", file: "src/mcp/a.ts", exit: 0 });
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("Stop and SessionStart hooks log their trigger", () => {
    const d = repo({ "src/a.ts": clean });
    try {
      cpSync(join(ROOT, "scripts", "ci"), join(d, "scripts", "ci"), { recursive: true });
      const go = (hook: string, script: string, trigger: string) => spawnSync("bash", ["scripts/hooks/run-logged.sh", hook, script], { cwd: d, encoding: "utf8", env: { ...process.env, CRYPT_HOOK_TRIGGER: trigger }, input: "{}" });
      expect(go("session-start-log", "scripts/hooks/session-start.sh", "SessionStart").status).toBe(0);
      go("failsafe-guard-on-stop", "scripts/ci/failsafe-guard.sh", "Stop");
      expect(logOf(d).map((r) => [r.hook, r.trigger])).toEqual([["session-start-log", "SessionStart"], ["failsafe-guard-on-stop", "Stop"]]);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("logs the Kiro CLI V3 hook_event_name as the trigger, and manual without a payload", () => {
    const d = repo({ "src/mcp/a.ts": "export const a = 1;\n" });
    try {
      const go = (input: string) => spawnSync("bash", ["scripts/hooks/run-logged.sh", "failsafe-guard-on-save", "scripts/hooks/failsafe-check.sh"], { cwd: d, encoding: "utf8", input });
      go(JSON.stringify({ hook_event_name: "PostFileSave", cwd: d, session_id: "s" }));
      go("");
      expect(logOf(d).map((r) => r.trigger)).toEqual(["PostFileSave", "manual"]);
      expect(Object.keys(logOf(d)[0]!)).toEqual(["ts", "hook", "trigger", "file", "exit", "summary"]);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("accepts the optional source key only on real Kiro lines and does not require a run per hook", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-hev-"));
    try {
      mkdirSync(join(d, ".kiro", "hooks"), { recursive: true });
      mkdirSync(join(d, "docs", "evidence"), { recursive: true });
      for (const n of ["a", "b"]) {
        const base = { name: n, trigger: "Stop", action: { type: "command", command: `bash scripts/hooks/run-logged.sh ${n} x.sh` }, timeout: 5, enabled: true };
        writeFileSync(join(d, ".kiro", "hooks", `${n}.json`), JSON.stringify({ hooks: [base] }));
      }
      const line = (extra: Record<string, unknown>, trigger = "Stop") => JSON.stringify({ ts: new Date().toISOString(), hook: "a", trigger, file: "", exit: 0, summary: "s", ...extra });
      const log = (...l: string[]) => writeFileSync(join(d, "docs", "evidence", "hook-runs.jsonl"), l.join("\n") + "\n");
      log(line({}, "manual"), line({ source: "kiro-cli-ci" }));
      expect(checkHookEvidence(d)).toEqual([]);
      log(line({ source: "kiro-cli-ci" }, "manual"));
      expect(checkHookEvidence(d).join("\n")).toContain("cannot have trigger manual");
      log(line({ source: "elsewhere" }));
      expect(checkHookEvidence(d).join("\n")).toContain("source must be one of kiro-cli-ci");
      log(line({ other: 1 }));
      expect(checkHookEvidence(d).join("\n")).toContain("keys must be");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("requires a PostToolUse twin for a PostFileSave command hook", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-hev-"));
    try {
      mkdirSync(join(d, ".kiro", "hooks"), { recursive: true });
      mkdirSync(join(d, "docs", "evidence"), { recursive: true });
      const hook = (n: string, twin: boolean) => {
        const base = { name: n, trigger: "PostFileSave", action: { type: "command", command: `bash scripts/hooks/run-logged.sh ${n} x.sh` }, timeout: 5, enabled: true };
        const t = { ...base, trigger: "PostToolUse", matcher: "write", action: { type: "command", command: `CRYPT_HOOK_FILTER='x' bash scripts/hooks/run-logged.sh ${n} x.sh` } };
        writeFileSync(join(d, ".kiro", "hooks", `${n}.json`), JSON.stringify({ hooks: twin ? [base, t] : [base] }));
      };
      hook("a", true);
      hook("b", false);
      const line = (hook: string, trigger: string) => JSON.stringify({ ts: new Date().toISOString(), hook, trigger, file: "", exit: 0, summary: "s" });
      writeFileSync(join(d, "docs", "evidence", "hook-runs.jsonl"), [line("a", "manual"), line("b", "manual")].join("\n") + "\n");
      expect(checkHookEvidence(d).join("\n")).toContain("b.json: a PostFileSave command hook needs a PostToolUse");
      writeFileSync(join(d, "docs", "evidence", "hook-runs.jsonl"), [line("a", "manual"), line("b", "PostToolUse")].join("\n") + "\n");
      expect(checkHookEvidence(d).join("\n")).not.toContain("no non-manual line");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("the repository hooks all log, and the log is valid", () => {
    expect(checkHookEvidence(ROOT)).toEqual([]);
  });

  it("flags a hook without a command action, timeout or enabled", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-hev-"));
    try {
      mkdirSync(join(d, ".kiro", "hooks"), { recursive: true });
      writeFileSync(join(d, ".kiro", "hooks", "a.json"), JSON.stringify({ hooks: [{ name: "a", action: { type: "agent", prompt: "x" } }] }));
      writeFileSync(join(d, ".kiro", "hooks", "b.json"), JSON.stringify({ hooks: [{ name: "b", action: { type: "command", command: "bash scripts/hooks/run-logged.sh b scripts/hooks/x.sh" } }] }));
      const p = checkHookEvidence(d).join("\n");
      expect(p).toContain("a.json: no command action");
      expect(p).toContain("b.json: the command hook needs an explicit timeout");
      expect(p).toContain("b.json: \"b\" needs enabled: true");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
