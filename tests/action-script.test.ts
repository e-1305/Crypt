import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts", "ci", "action.sh");
const TOKEN = "github_pat_SECRET0123456789";
const COUNTS = { limbs: 2, findings: 9, spawned: 2, exorcised: 7, unresolved: 0, possessed: 0, rotting: 2, healthy: 5, unknown: 0 };

// A stand-in for crypt: records its arguments and writes what the real commands write.
const STUB = `#!/usr/bin/env bash
echo "$*|token=\${GITHUB_TOKEN:-}" >> "$STUB_CALLS"
case "$1" in
  exhume)
    if [ -n "\${STUB_EXHUME_FAIL:-}" ]; then exit 4; fi
    mkdir -p out
    if [ -n "\${STUB_BAD_JSON:-}" ]; then echo 'not json' > out/creature.json; else echo "$STUB_CREATURE" > out/creature.json; fi ;;
  autopsy) mkdir -p out; echo '<html></html>' > out/autopsy.html; echo "Autopsy report written" ;;
  raise) echo '{}' > out/limbs.json ;;
  alerts)
    if [ "$3" = "sarif" ]; then
      if [ -n "\${STUB_SARIF_FAIL:-}" ]; then exit 4; fi
      mkdir -p out; echo '{}' > out/alerts.sarif; echo "Wrote SARIF"; exit 0
    fi
    echo "[CRYPT] KEV: lodash 4.17.15"; echo "crypt graft LODASH --live --repo <owner/name>" ;;
  graft) mkdir -p out/prs; echo "$2: PR_OPENED" ;;
  *) exit 9 ;;
esac
`;

function run(args: string[], env: Record<string, string> = {}, counts: unknown = COUNTS) {
  const d = mkdtempSync(join(tmpdir(), "crypt-action-"));
  const stub = join(d, "stub.sh");
  writeFileSync(stub, STUB);
  chmodSync(stub, 0o755);
  const plate = join(d, "plate.sh");
  writeFileSync(plate, '#!/usr/bin/env bash\necho "PLATE LINE lodash"\n');
  chmodSync(plate, 0o755);
  const target = join(d, "repo");
  mkdirSync(target);
  writeFileSync(join(target, "package-lock.json"), "{}");
  const work = join(d, "work");
  const calls = join(d, "calls.txt");
  const summary = join(d, "summary.md");
  const r = spawnSync("bash", [SCRIPT, ...args], {
    cwd: d,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      CRYPT_CMD: stub,
      CRYPT_FEEDS_CMD: "true",
      CRYPT_PLATE_CMD: plate,
      CRYPT_TARGET: target,
      CRYPT_OUT_DIR: work,
      STUB_CALLS: calls,
      STUB_CREATURE: JSON.stringify({ counts }),
      GITHUB_STEP_SUMMARY: summary,
      ...env,
    },
  });
  const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");
  return { r, d, target, work, calls: read(calls), summary: read(summary), out: `${r.stdout}${r.stderr}` };
}

describe("action.sh input validation", () => {
  it.each([
    [["pillage"], /mode must be report or graft/],
    [[], /expected 1 to 3 arguments/],
    [["report", "REACT"], /limb must be LODASH or JQUERY/],
    [["graft", "LODASH", "yes"], /sabotage must be true or false/],
    [["report", "LODASH", "true"], /sabotage only goes with mode graft/],
  ])("rejects %j with exit 2, a summary and no crypt call", (args, msg) => {
    const x = run(args, { GITHUB_TOKEN: TOKEN });
    expect(x.r.status).toBe(2);
    expect(x.out).toMatch(msg);
    expect(x.calls).toBe("");
    expect(x.summary).toMatch(/CRYPT action FAILED: bad input/);
  });

  it("graft without a token fails and runs nothing", () => {
    const x = run(["graft", "LODASH", "false"]);
    expect(x.r.status).toBe(2);
    expect(x.out).toMatch(/needs a token/);
    expect(x.calls).toBe("");
  });

  it("report mode never hands a token to crypt", () => {
    const x = run(["report"], { GITHUB_TOKEN: TOKEN });
    expect(x.r.status).toBe(0);
    expect(x.calls).not.toContain(TOKEN);
  });
});

describe("action.sh upload-sarif input", () => {
  it("defaults to false and does not run crypt alerts", () => {
    const x = run(["report"]);
    expect(x.calls).not.toContain("sarif");
  });
  it("true writes the SARIF and sets the sarif step output", () => {
    const o = join(mkdtempSync(join(tmpdir(), "crypt-gho-")), "out.txt");
    writeFileSync(o, "");
    const x = run(["report"], { INPUT_UPLOAD_SARIF: "true", GITHUB_OUTPUT: o });
    expect(x.r.status).toBe(0);
    expect(x.calls).toContain("alerts --format sarif|token=\n");
    expect(readFileSync(o, "utf8")).toMatch(/^sarif=.*\/out\/alerts\.sarif$/m);
  });
  it("passes the scanned subdirectory as --base", () => {
    const o = join(mkdtempSync(join(tmpdir(), "crypt-gho-")), "out.txt");
    writeFileSync(o, "");
    const x = run(["report"], { INPUT_UPLOAD_SARIF: "true", GITHUB_OUTPUT: o, GITHUB_WORKSPACE: realpathSync(tmpdir()) });
    expect(x.r.status).toBe(0);
    expect(x.calls).toMatch(/alerts --format sarif --base crypt-action-[^/ ]+\/repo\|/);
  });
  it("fails and sets no sarif output when the SARIF cannot be built", () => {
    const o = join(mkdtempSync(join(tmpdir(), "crypt-gho-")), "out.txt");
    writeFileSync(o, "");
    const x = run(["report"], { INPUT_UPLOAD_SARIF: "true", STUB_SARIF_FAIL: "1", GITHUB_OUTPUT: o });
    expect(x.r.status).toBe(1);
    expect(readFileSync(o, "utf8")).not.toContain("sarif=");
  });
  it("rejects a bad value", () => {
    expect(run(["report"], { INPUT_UPLOAD_SARIF: "maybe" }).r.status).toBe(2);
  });
});

describe("action.sh alerts input", () => {
  it("defaults to none and does not run crypt alerts", () => {
    const x = run(["report"]);
    expect(x.r.status).toBe(0);
    expect(x.calls).not.toContain("alerts");
    expect(x.summary).not.toContain("CRYPT alerts");
  });
  it("issues prints the dry-run and never hands over a token", () => {
    const x = run(["report"], { INPUT_ALERTS: "issues", GITHUB_TOKEN: TOKEN });
    expect(x.r.status).toBe(0);
    expect(x.calls).toContain("alerts --format issues|token=\n");
    expect(x.summary).toContain("[CRYPT] KEV: lodash 4.17.15");
    expect(x.summary).toContain("--repo <owner/name>");
  });
  it("rejects other values with exit 2", () => {
    const x = run(["report"], { INPUT_ALERTS: "all" });
    expect(x.r.status).toBe(2);
    expect(x.out).toMatch(/alerts must be none or issues/);
    expect(x.calls).toBe("");
  });
  it("action.yml declares the input with default none", () => {
    const y = readFileSync(join(ROOT, "action.yml"), "utf8");
    expect(y).toMatch(/\n  alerts:\n[\s\S]*?default: none\n/);
    expect(y).toContain("INPUT_ALERTS: ${{ inputs.alerts }}");
  });
});

describe("action.sh report mode", () => {
  it("writes the funnel and the plate to the summary and the artifacts to the work dir", () => {
    const x = run(["report"]);
    expect(x.r.status).toBe(0);
    expect(x.summary).toContain("## CRYPT report");
    expect(x.summary).toContain("| 9 | 7 | 2 |");
    expect(x.summary).toContain("9 findings, 7 exorcised as noise, 2 monsters left to fight.");
    expect(x.summary).toContain("PLATE LINE lodash");
    expect(x.summary).not.toMatch(/FAILED/);
    expect(existsSync(join(x.work, "out", "creature.json"))).toBe(true);
    expect(existsSync(join(x.work, "out", "autopsy.html"))).toBe(true);
  });

  it("exhumes the target, never writes to it, and has no merge call", () => {
    const x = run(["report"]);
    expect(x.calls).toContain(`exhume ${x.target}`);
    expect(readdirSync(x.target)).toEqual(["package-lock.json"]);
    expect(readFileSync(SCRIPT, "utf8")).not.toMatch(/merge[sd]?\b.*(api|PUT|--auto)|\/merge/i);
  });

  it("fails with a FAILED summary when crypt exhume fails", () => {
    const x = run(["report"], { STUB_EXHUME_FAIL: "1" });
    expect(x.r.status).toBe(1);
    expect(x.summary).toMatch(/CRYPT action FAILED \(report\)/);
    expect(x.summary).not.toMatch(/## CRYPT report/);
  });

  it("fails when the feed update fails", () => {
    const x = run(["report"], { CRYPT_FEEDS_CMD: "false" });
    expect(x.r.status).toBe(1);
    expect(x.summary).toMatch(/Feed update failed/);
    expect(x.calls).toBe("");
  });

  it("fails on an unparseable creature.json", () => {
    const x = run(["report"], { STUB_BAD_JSON: "1" });
    expect(x.r.status).toBe(1);
    expect(x.summary).toMatch(/unreadable or has no valid counts/);
    expect(x.summary).not.toMatch(/## CRYPT report/);
  });

  it.each([[{ findings: 1 }], [{ ...COUNTS, spawned: "2" }], [null]])("fails on incomplete counts %j", (counts) => {
    const x = run(["report"], {}, counts);
    expect(x.r.status).toBe(1);
    expect(x.summary).toMatch(/FAILED/);
  });

  it("fails, never green, when findings are unresolved or unknown", () => {
    for (const counts of [{ ...COUNTS, unresolved: 3 }, { ...COUNTS, unknown: 1 }]) {
      const x = run(["report"], {}, counts);
      expect(x.r.status).toBe(1);
      expect(x.summary).toMatch(/cannot be trusted as clean/);
    }
  });
});

describe("action.sh against the real CLI surface", () => {
  it("only uses crypt subcommands that scripts/cli/main.ts dispatches, and a plate script that exists", () => {
    const main = readFileSync(join(ROOT, "scripts", "cli", "main.ts"), "utf8");
    const sh = readFileSync(SCRIPT, "utf8");
    const used = [...sh.matchAll(/\$CRYPT (\w+)/g)].map((m) => m[1]);
    expect(used).toEqual(expect.arrayContaining(["exhume", "autopsy"]));
    for (const c of used) expect(main).toContain(`case "${c}"`);
    expect(sh).not.toMatch(/\$CRYPT plate/);
    expect(existsSync(join(ROOT, "scripts", "plate.ts"))).toBe(true);
  });

  it("the real exhume output renders with the default plate command", () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-plate-"));
    const ex = spawnSync("node", [join(ROOT, "bin", "crypt.mjs"), "exhume", join(ROOT, "fixtures", "vulnerable-npm")], { cwd: d, encoding: "utf8" });
    expect(ex.status).toBe(0);
    const r = spawnSync(join(ROOT, "node_modules", ".bin", "tsx"), [join(ROOT, "scripts", "plate.ts"), join(d, "out", "creature.json")], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(20);
  }, 60000);
});

describe("action.sh graft mode", () => {
  it("delegates to live-raid graft with the token and opens a pull request", () => {
    const x = run(["graft", "LODASH", "false"], { GITHUB_TOKEN: TOKEN });
    expect(x.r.status).toBe(0);
    expect(x.calls).toContain("graft LODASH --live --target https://github.com/e-1305/crypt-demo");
    expect(x.calls).toContain("raise out/creature.json");
    expect(x.summary).toMatch(/Live raid: graft LODASH/);
  });
});
