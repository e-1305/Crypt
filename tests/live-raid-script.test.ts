import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts", "ci", "live-raid.sh");
const TOKEN = "github_pat_SECRET0123456789";
const URL = "https://github.com/e-1305/crypt-demo";

// A stand-in for crypt: records its arguments, and prints what the real commands print.
const STUB = `#!/usr/bin/env bash
echo "$*" >> "$STUB_CALLS"
case "$1" in
  exhume) mkdir -p out; echo '{}' > out/creature.json ;;
  raise) mkdir -p out; echo '{}' > out/limbs.json ;;
  graft)
    mkdir -p out/prs
    echo '{"branch":"crypt/graft-lodash-4.18.0","limb":"'"$2"'","name":"lodash","from":"4.17.15","to":"4.18.0","url":"https://github.com/e-1305/crypt-demo/pull/7"}' > out/prs/crypt-graft-lodash-4.18.0.json
    echo "$2: PR_OPENED"; echo "Pull request: https://github.com/e-1305/crypt-demo/pull/7" ;;
  inquisit) echo "$2: \${STUB_OUTCOME:-AWAITING_HUMAN_MERGE}" ;;
  reraise) echo "healed: \${STUB_HEALED:-none}"; echo; echo "PLATE LINE lodash HEALED" ;;
  *) exit 9 ;;
esac
exit \${STUB_EXIT:-0}
`;

function run(args: string[], env: Record<string, string> = {}) {
  const d = mkdtempSync(join(tmpdir(), "crypt-liveraid-"));
  const stub = join(d, "stub.sh");
  writeFileSync(stub, STUB);
  chmodSync(stub, 0o755);
  const calls = join(d, "calls.txt");
  const summary = join(d, "summary.md");
  const r = spawnSync("bash", [SCRIPT, ...args], {
    cwd: d,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", CRYPT_CMD: stub, STUB_CALLS: calls, GITHUB_STEP_SUMMARY: summary, GITHUB_TOKEN: TOKEN, ...env },
  });
  const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");
  return { r, d, calls: read(calls), summary: read(summary), out: `${r.stdout}${r.stderr}` };
}

describe("live-raid.sh argument handling", () => {
  it.each([
    [["pillage", "LODASH", "false"], /unknown mode/],
    [["graft", "REACT", "false"], /unknown limb/],
    [["graft", "lodash", "false"], /unknown limb/],
    [["graft", "LODASH", "yes"], /sabotage must be true or false/],
    [["graft", "LODASH"], /expected 3 arguments/],
    [["graft", "LODASH", "false", "extra"], /expected 3 arguments/],
    [[], /expected 3 arguments/],
    [["inquisit", "JQUERY", "true"], /only goes with mode graft/],
    [["reraise", "LODASH", "true"], /only goes with mode graft/],
  ])("rejects %j with exit 2 and runs nothing", (args, msg) => {
    const x = run(args);
    expect(x.r.status).toBe(2);
    expect(x.out).toMatch(msg);
    expect(x.calls).toBe("");
    expect(x.summary).toBe("");
  });

  it("graft without sabotage never passes the demo flags", () => {
    const x = run(["graft", "LODASH", "false"]);
    expect(x.r.status).toBe(0);
    expect(x.calls).toContain(`graft LODASH --live --target ${URL}`);
    expect(x.calls).not.toMatch(/sabotage|i-know-this-is-a-demo/);
  });

  it("graft builds the limb table first when there is none", () => {
    const x = run(["graft", "JQUERY", "false"]);
    expect(x.calls.split("\n").filter(Boolean)).toEqual([`exhume ${URL}`, "raise out/creature.json", `graft JQUERY --live --target ${URL}`]);
  });

  it("sabotage=true passes both confirmation flags and says SABOTAGE", () => {
    const x = run(["graft", "JQUERY", "true"]);
    expect(x.r.status).toBe(0);
    expect(x.calls).toContain("graft JQUERY --live --target " + URL + " --sabotage --i-know-this-is-a-demo");
    expect(x.summary).toContain("SABOTAGE");
  });

  it("writes the summary: limb, from to, PR link, verdict", () => {
    const x = run(["graft", "LODASH", "false"]);
    expect(x.summary).toContain("Limb: LODASH");
    expect(x.summary).toContain("4.17.15 to 4.18.0");
    expect(x.summary).toContain("https://github.com/e-1305/crypt-demo/pull/7");
    expect(x.summary).toContain("Verdict:");
    expect(x.summary).not.toContain("SABOTAGE");
  });

  it("inquisit uses --live and the fixed repository, and prints the verdict", () => {
    const green = run(["inquisit", "LODASH", "false"]);
    expect(green.calls).toContain("inquisit LODASH --live --repo e-1305/crypt-demo");
    expect(green.summary).toContain("GREEN");
    const red = run(["inquisit", "JQUERY", "false"], { STUB_OUTCOME: "GRAFT_REJECTED The graft was rejected." });
    expect(red.summary).toContain("REJECTED");
  });

  it("reraise prints the plate in a code block and saves it for the artifact", () => {
    const x = run(["reraise", "LODASH", "false"], { STUB_HEALED: "LODASH" });
    expect(x.calls).toContain("reraise --live --repo e-1305/crypt-demo");
    expect(x.summary).toContain("LODASH HEALED");
    expect(x.summary).toMatch(/```\nPLATE LINE lodash HEALED\n```/);
    expect(readFileSync(join(x.d, "out", "plate.txt"), "utf8")).toContain("PLATE LINE");
  });

  it("a failing crypt command fails the script and the summary says so", () => {
    const x = run(["inquisit", "LODASH", "false"], { STUB_EXIT: "1" });
    expect(x.r.status).not.toBe(0);
    expect(x.summary).toContain("FAILED");
  });

  it("never prints the token, on any path", () => {
    for (const args of [["graft", "LODASH", "false"], ["graft", "JQUERY", "true"], ["inquisit", "LODASH", "false"], ["reraise", "LODASH", "false"], ["nope", "LODASH", "false"]]) {
      const x = run(args);
      expect(x.out).not.toContain(TOKEN);
      expect(x.summary).not.toContain(TOKEN);
    }
  });
});

describe("live-raid.yml", () => {
  const wf = readFileSync(join(ROOT, ".github", "workflows", "live-raid.yml"), "utf8");
  it("is dispatch only, read-only, serialized, and the token is on one step", () => {
    expect(wf).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(wf).not.toMatch(/^ {2}(push|pull_request|schedule):/m);
    expect(wf).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(wf).toMatch(/group: live-raid/);
    expect(wf.match(/secrets\.CRYPT_DEMO_TOKEN/g)).toHaveLength(1);
    expect(wf).toContain("::add-mask::");
    expect(wf).not.toMatch(/\/merge|gh pr merge/);
  });
});
