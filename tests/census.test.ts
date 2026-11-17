import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type RepoCounts,
  aggregate,
  leaksProjectName,
  median,
  parseRepos,
  renderResults,
} from "../scripts/census/aggregate.js";

const meta = { scanDate: "2026-01-02", kevDate: "2026-01-01", epssDate: "2026-01-02" };
const row = (o: Partial<RepoCounts> = {}): RepoCounts => ({
  limbs: 10, findings: 4, exorcised: 3, spawned: 1, unresolved: 0, possessed: 0, unknown: 0, unowned: 10, ...o,
});

describe("repos.md", () => {
  const repos = parseRepos(readFileSync("docs/census/repos.md", "utf8"));
  it("lists 10 npm and 10 PyPI repositories with full SHAs, no duplicates", () => {
    expect(repos.filter((r) => r.ecosystem === "npm")).toHaveLength(10);
    expect(repos.filter((r) => r.ecosystem === "PyPI")).toHaveLength(10);
    expect(new Set(repos.map((r) => r.repo)).size).toBe(20);
    for (const r of repos) expect(r.sha).toMatch(/^[0-9a-f]{40}$/);
  });
  it("ignores rows that are not a complete table row", () => {
    expect(parseRepos("| npm | a/b | abc |\n| Ecosystem | Repository | Commit SHA |\n|---|---|---|")).toEqual([]);
  });
});

describe("median", () => {
  it("odd, even and empty", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBe(0);
  });
  it("lies between min and max and ignores input order", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(1000), { minLength: 1 }), (xs) => {
        const md = median(xs);
        expect(md).toBeGreaterThanOrEqual(Math.min(...xs));
        expect(md).toBeLessThanOrEqual(Math.max(...xs));
        expect(median([...xs].reverse())).toBe(md);
      }),
    );
  });
});

describe("aggregate", () => {
  it("sums counts and computes percentages and medians", () => {
    const a = aggregate([
      row({ limbs: 100, findings: 20, exorcised: 15, spawned: 4, unresolved: 1, possessed: 2, unowned: 100 }),
      row({ limbs: 100, findings: 10, exorcised: 8, spawned: 2, unowned: 0 }),
      row({ limbs: 200, findings: 0, exorcised: 0, spawned: 0, unowned: 100 }),
    ]);
    expect(a).toMatchObject({ repos: 3, limbs: 400, findings: 30, exorcised: 23, spawned: 6, unresolved: 1, possessed: 2, unowned: 200 });
    expect(a.pctFindings).toBeCloseTo(7.5);
    expect(a.pctExorcised).toBeCloseTo((100 * 23) / 30);
    expect(a.pctUnowned).toBeCloseTo(50);
    expect(a.medianBefore).toBe(10);
    expect(a.medianAfter).toBe(2);
  });
  it("never divides by zero", () => {
    const a = aggregate([row({ limbs: 0, findings: 0, exorcised: 0, spawned: 0, unowned: 0 })]);
    expect(a.pctFindings).toBe(0);
    expect(a.pctExorcised).toBe(0);
  });
});

describe("renderResults (blameless publication)", () => {
  const repos = parseRepos(readFileSync("docs/census/repos.md", "utf8"));
  const a = aggregate([row({ limbs: 1234, findings: 400, exorcised: 380, spawned: 20, possessed: 3 })]);
  const text = renderResults(a, meta);
  it("starts with 3 headline sentences carrying the numbers", () => {
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/^# /);
    const bullets = lines.slice(1, 8).filter((l) => l.startsWith("- "));
    expect(bullets).toHaveLength(3);
    expect(bullets[0]).toContain("cut 400 findings to 20 monsters");
    expect(bullets[2]).toContain("3 limbs were possessed");
  });
  it("states dates and limitations", () => {
    expect(text).toContain("2026-01-02");
    expect(text).toContain("2026-01-01");
    expect(text).toMatch(/Lockfile only/);
    expect(text).toMatch(/No reachability/);
  });
  it("has no per-repo table and names no project", () => {
    expect(leaksProjectName(text, repos)).toBe(false);
    expect(text.match(/^\|/gm)?.length).toBeLessThan(20);
  });
  it("leak check catches a planted project name", () => {
    expect(leaksProjectName(`found in ${repos[0]!.repo.toUpperCase()}`, repos)).toBe(true);
  });
  it("the committed RESULTS.md, when present, names no project", () => {
    let committed: string;
    try {
      committed = readFileSync("docs/census/RESULTS.md", "utf8");
    } catch {
      return;
    }
    expect(leaksProjectName(committed, repos)).toBe(false);
  });
});
