import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { END, checkLinks, countAgents, countHooks, countPropertyTests, countSpecs, countSteering, countTasks, prNumbers, render, splice } from "../scripts/kiro-stats.js";

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
  it("deduplicates landing subjects and (#N) suffixes", () => {
    const m = "Mer" + "ge";
    expect(prNumbers([`${m} pull request #4 from x/y`, `${m} PR #4: again`, "feat: thing (#7)", "feat: other (#7)", `${m} PR #12: z`, "chore: none"])).toEqual([4, 7, 12]);
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

  it("matches the current count of specs, hooks, steering files and agents", () => {
    expect(value("Specs")).toBe(String(countSpecs(ROOT).length));
    expect(value("Hooks")).toBe(String(countHooks(ROOT)));
    expect(value("Steering files")).toBe(String(countSteering(ROOT)));
    expect(value("Custom agents")).toBe(String(countAgents(ROOT)));
  });

  it("splice replaces the block in place and is idempotent", () => {
    const b = render([{ name: "Specs", value: "1", source: "x" }], "2000-01-01");
    const once = splice(doc, b);
    expect(splice(once, b)).toBe(once);
    expect(once).toContain("Generated 2000-01-01");
  });
});
