import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { END, STATS_DOCS, checkDocStats, checkLinks, renderDocStats, spliceDocStats, countAgents, countHooks, countPropertyTests, countSpecs, countSteering, countTasks, hookRunsByHook, kiroCliCiRuns, kiroSessionRuns, manualRuns, manualRunsByHook, readHookRuns, collect, prNumbers, render, splice } from "../scripts/kiro-stats.js";

const ROOT = resolve(import.meta.dirname, "..");
const tmp = mkdtempSync(join(tmpdir(), "kiro-stats-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function put(rel: string, text = "") {
  const f = join(tmp, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, text);
}

describe("counting functions on a fixture directory", () => {
  put(".kiro/specs/a/tasks.md", "# T\n- [x] 1. one\n- [ ] 2. two\n  - [x] 3. nested\nnot a task\n");
  put(".kiro/specs/b/tasks.md", "- [ ] 1. open\n");
  put(".kiro/specs/c/design.md", "no tasks here");
  put(".kiro/hooks/h1.json", "{}");
  put(".kiro/hooks/h2.json", "{}");
  put(".kiro/hooks/readme.txt", "x");
  put(".kiro/agents/x.json", "{}");
  put(".kiro/steering/s.md", "x");
  // Assembled from parts so this file's own fixture text is not counted as property tests.
  const FA = "fc.ass" + "ert(";
  put("tests/p.test.ts", `${FA}fc.prop` + "erty(a, b));\n" + FA + "\n fc.asyncProp" + "erty(a, b));\n");
  put("tests/q.test.ts", "it('x', () => {});\n");

  it("counts specs, tasks, hooks, agents and steering files", () => {
    expect(countSpecs(tmp)).toEqual(["a", "b", "c"]);
    expect(countTasks(tmp)).toEqual({ done: 2, total: 4 });
    expect(countHooks(tmp)).toBe(2);
    expect(countAgents(tmp)).toBe(1);
    expect(countSteering(tmp)).toBe(1);
  });

  it("counts property test call sites and the files that hold them", () => {
    expect(countPropertyTests(tmp)).toEqual({ calls: 4, files: 1 });
  });

  it("reports zero for a missing directory instead of throwing", () => {
    expect(countHooks(join(tmp, "nothing"))).toBe(0);
    expect(countSpecs(join(tmp, "nothing"))).toEqual([]);
  });
});

describe("PR numbers from subjects", () => {
  it("deduplicates landing subjects and ignores (#N) issue suffixes", () => {
    const m = "Mer" + "ge";
    expect(prNumbers([`${m} pull request #4 from x/y`, `${m} PR #4: again`, "feat: thing (#7)", "feat: other (#7)", `${m} PR #12: z`, "chore: none"])).toEqual([4, 12]);
  });
});

describe("link check", () => {
  const ok = (sha: string) => sha === "abcdef1";
  it("accepts existing paths, links and resolvable commits", () => {
    expect(checkLinks(ROOT, "see [spec](../.kiro/specs/mcp-server/design.md), `src/mcp/core.ts` and `abcdef1`", ok)).toEqual([]);
  });
  it("reports a missing link, a missing path and an unknown commit", () => {
    const p = checkLinks(ROOT, "[x](../nope.md) `src/none.ts` `1234567` [ext](https://example.com/a)", ok);
    expect(p).toHaveLength(3);
  });
});

describe("docs/KIRO.md numbers block", () => {
  const doc = readFileSync(join(ROOT, "docs/KIRO.md"), "utf8");
  const block = doc.slice(doc.indexOf("<!-- kiro-stats:begin"), doc.indexOf(END));
  const value = (name: string) => new RegExp(`^\\| ${name} \\| ([^|]+) \\|`, "m").exec(block)?.[1]?.trim();

  it("has a dated block", () => {
    expect(block).toMatch(/Generated \d{4}-\d{2}-\d{2} \(UTC\)/);
  });

  // Only the stats workflow on main refreshes the block (issue #112), so a PR that adds a spec,
  // hook, steering file or agent must not have to match it. The counters are covered above.
  it("has numeric rows for specs, hooks, steering files and agents", () => {
    for (const name of ["Specs", "Hooks", "Steering files", "Custom agents"]) expect(value(name), name).toMatch(/^\d+$/);
  });

  it("the --write computation is idempotent on the real docs/KIRO.md", () => {
    const b = render(collect(ROOT, false), "2000-01-01");
    const once = splice(doc, b);
    expect(splice(once, b)).toBe(once);
  });

  it("splice appends a missing block once and is then idempotent", () => {
    const b = render([{ name: "Specs", value: "1", source: "x" }], "2000-01-01");
    const once = splice("# Title\n", b);
    expect(splice(once, b)).toBe(once);
  });

  it("splice replaces the block in place and is idempotent", () => {
    const b = render([{ name: "Specs", value: "1", source: "x" }], "2000-01-01");
    const once = splice(doc, b);
    expect(splice(once, b)).toBe(once);
    expect(once).toContain("Generated 2000-01-01");
  });
});

describe("stats blocks in DEVPOST.md and BLOG.md", () => {
  it("spliceDocStats rewrites every marker pair, leaves other text alone and is idempotent", () => {
    const doc = "a 248 -> 3 <!-- stats:start -->old<!-- stats:end --> b <!-- stats:start -->older<!-- stats:end --> c 95.2%";
    const once = spliceDocStats(doc, "NEW");
    expect(once).toBe("a 248 -> 3 <!-- stats:start -->NEW<!-- stats:end --> b <!-- stats:start -->NEW<!-- stats:end --> c 95.2%");
    expect(spliceDocStats(once!, "NEW")).toBe(once);
  });

  it("spliceDocStats returns null without a pair or with an unmatched marker", () => {
    expect(spliceDocStats("no markers", "x")).toBeNull();
    expect(spliceDocStats("<!-- stats:start --> never closed", "x")).toBeNull();
    expect(spliceDocStats("stray <!-- stats:end -->", "x")).toBeNull();
  });

  it("renderDocStats reflects the counts of the root it is given", () => {
    expect(renderDocStats(tmp, 7)).toContain("3 specs");
    expect(renderDocStats(tmp, 7)).toContain("2 hooks");
    expect(renderDocStats(tmp, 7)).toContain("7 tests");
  });

  it("checkDocStats flags a stale block and a missing marker, and passes a fresh one", () => {
    const fresh = "x <!-- stats:start -->T<!-- stats:end -->";
    const docs: Record<string, string> = { "docs/DEVPOST.md": fresh, "docs/BLOG.md": "x <!-- stats:start -->old<!-- stats:end -->" };
    expect(checkDocStats(tmp, "T", (rel) => docs[rel]!)).toEqual([expect.stringContaining("docs/BLOG.md: stats block is stale")]);
    docs["docs/BLOG.md"] = "no markers";
    expect(checkDocStats(tmp, "T", (rel) => docs[rel]!)).toEqual([expect.stringContaining("docs/BLOG.md: missing")]);
    docs["docs/BLOG.md"] = fresh;
    expect(checkDocStats(tmp, "T", (rel) => docs[rel]!)).toEqual([]);
  });

  // Counts are refreshed only on main by the stats workflow (issue #112), so PRs check the shape, not the numbers.
  it("the committed blocks carry a counts sentence", () => {
    for (const rel of STATS_DOCS) {
      const doc = readFileSync(join(ROOT, rel), "utf8");
      const texts = [...doc.matchAll(/<!-- stats:start -->(.*?)<!-- stats:end -->/g)].map((m) => m[1]!);
      expect(texts.length, rel).toBeGreaterThan(0);
      for (const t of texts) expect(t, rel).toMatch(/\d+ specs in `\.kiro\/specs\/`/);
    }
  });
});

describe("hook runs recorded in a Kiro session", () => {
  const line = (hook: string, trigger: string) => JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", hook, trigger, file: "", exit: 0, summary: "ok" });
  it("is null when the log is missing", () => {
    const d = mkdtempSync(join(tmpdir(), "kiro-stats-runs-"));
    try {
      expect(readHookRuns(d)).toBeNull();
      for (const p of ["Hook runs by hand", "Hook runs recorded", "of which Kiro CLI"]) expect(collect(d, false).find((s) => s.name.startsWith(p))?.value).toBe("unavailable");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
  it("counts only lines whose trigger is not manual and skips broken lines", () => {
    const d = mkdtempSync(join(tmpdir(), "kiro-stats-runs-"));
    try {
      mkdirSync(join(d, "docs", "evidence"), { recursive: true });
      writeFileSync(join(d, "docs", "evidence", "hook-runs.jsonl"), [line("b", "PostFileSave"), line("a", "manual"), line("a", "PostFileSave"), "{broken", "", line("b", "PostFileSave")].join("\n") + "\n");
      const runs = readHookRuns(d)!;
      expect(runs).toHaveLength(4);
      expect(kiroSessionRuns(runs)).toHaveLength(3);
      expect(hookRunsByHook(runs)).toEqual({ a: 1, b: 2 });
      expect(collect(d, false).find((s) => s.name.startsWith("Hook runs recorded"))?.value).toBe("3");
      expect(manualRunsByHook(runs)).toEqual({ a: 1 });
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
  it("separates manual, real Kiro and kiro-cli-ci runs, and never counts a manual line as real", () => {
    const d = mkdtempSync(join(tmpdir(), "kiro-stats-runs-"));
    try {
      mkdirSync(join(d, "docs", "evidence"), { recursive: true });
      const withSource = (hook: string, trigger: string, source: string) => JSON.stringify({ ...JSON.parse(line(hook, trigger)), source });
      writeFileSync(join(d, "docs", "evidence", "hook-runs.jsonl"), [line("a", "manual"), line("a", "manual"), line("a", "PostToolUse"), withSource("b", "Stop", "kiro-cli-ci"), withSource("b", "manual", "kiro-cli-ci")].join("\n") + "\n");
      const runs = readHookRuns(d)!;
      expect(manualRuns(runs)).toHaveLength(3);
      expect(kiroSessionRuns(runs)).toHaveLength(2);
      expect(kiroCliCiRuns(runs)).toHaveLength(1);
      const v = (prefix: string) => collect(d, false).find((s) => s.name.startsWith(prefix))?.value;
      expect([v("Hook runs by hand"), v("Hook runs recorded in a real"), v("of which Kiro CLI")]).toEqual(["3", "2", "1"]);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("stats regeneration happens only on main (issue #112)", () => {
  const wf = (name: string) => readFileSync(join(ROOT, ".github/workflows", name), "utf8");

  it("stats.yml runs on main and manual dispatch, writes contents, and skips its own commits", () => {
    const y = wf("stats.yml");
    expect(y).toMatch(/branches: \[main\]/);
    expect(y).toContain("workflow_dispatch");
    expect(y).toContain("contents: write");
    expect(y).toContain("startsWith(github.event.head_commit.message, 'chore(stats): regenerate')");
    expect(y).toContain("chore(stats): regenerate [skip ci]");
    expect(y).toContain("npm run kiro:stats -- --write");
    expect(y).toContain("npm run kiro:timeline");
  });

  it("ci.yml is read-only and has no stale-block check or write step", () => {
    const y = wf("ci.yml");
    expect(y).not.toContain("--check-docs");
    expect(y).not.toContain("contents: write");
    expect(y).not.toMatch(/kiro:stats -- --write|kiro:timeline/);
  });
});
