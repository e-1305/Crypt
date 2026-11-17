import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { numRuns } from "./runs.js";

const ROOT = resolve(import.meta.dirname, "..");
const GUARD = join(ROOT, "scripts", "ci", "failsafe-guard.sh");

function guard(root: string) {
  return spawnSync("bash", [GUARD, root], { encoding: "utf8" });
}

function tree(files: Record<string, string>, gitignore?: string): string {
  const d = mkdtempSync(join(tmpdir(), "crypt-guard-"));
  spawnSync("git", ["init", "-q"], { cwd: d });
  for (const [p, c] of Object.entries({ "src/ok.ts": "export const x = 1;\n", "bin/ok.mjs": "// ok\n", ...files })) {
    mkdirSync(dirname(join(d, p)), { recursive: true });
    writeFileSync(join(d, p), c);
  }
  if (gitignore !== undefined) writeFileSync(join(d, ".gitignore"), gitignore);
  return d;
}

function check(files: Record<string, string>, gitignore?: string) {
  const d = tree(files, gitignore);
  try {
    return guard(d);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

describe("failsafe-guard.sh", () => {
  it("passes on a clean tree and allows the state label", () => {
    expect(check({ "src/s.ts": 'const state = "awaiting-human-merge";\n' }).status).toBe(0);
  });
  it("passes on the real repository", () => {
    const r = guard(ROOT);
    expect(r.status, r.stderr).toBe(0);
  });
  const violations: [string, Record<string, string>, string?][] = [
    ["merge endpoint in src/", { "src/a.ts": "const u = `/repos/o/r/pulls/5/merge`;\n" }],
    ["merge method in src/", { "src/a.ts": 'const b = {"merge_method": "squash"};\n' }],
    ["merge call in src/", { "src/a.ts": "await octo.mergePullRequest(5);\n" }],
    ["auto-merge in src/", { "src/a.ts": "enableAutoMerge(pr);\n" }],
    ["gh pr merge in bin/", { "bin/a.mjs": "run('gh pr merge 5');\n" }],
    ["git blame in src/", { "src/a.ts": "run('git blame file.ts');\n" }],
    ["git blame as spawn args in bin/", { "bin/a.mjs": 'spawn("git", ["x"]); spawn("git", "blame");\n' }],
    ["gitignored .kiro/", {}, ".kiro/\n"],
  ];
  for (const [name, files, ignore] of violations) {
    it(`fails on ${name}`, () => {
      const r = check(files, ignore);
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stderr).toContain("failsafe-guard:");
    });
  }
  it("fails on any planted merge word across random file names", () => {
    const names = ["a", "b", "deep/c"];
    for (let i = 0; i < Math.min(numRuns(6), 12); i++) {
      const n = names[i % names.length]!;
      const r = check({ [`src/${n}.ts`]: `x();\nclient.merge(${i});\n` });
      expect(r.status).toBe(1);
    }
  });
});
