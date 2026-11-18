import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildTimeline, dayNumber, esc, isoOf, mergeDates, renderTimeline, specDates } from "../scripts/kiro-timeline.js";

const ROOT = resolve(import.meta.dirname, "..");
const tmp = mkdtempSync(join(tmpdir(), "kiro-timeline-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function git(args: string[], date?: string) {
  const env = { ...process.env, ...(date ? { GIT_AUTHOR_DATE: `${date}T12:00:00Z`, GIT_COMMITTER_DATE: `${date}T12:00:00Z` } : {}) };
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: tmp, env, stdio: "ignore" });
}
function commit(rel: string, subject: string, date: string) {
  const f = join(tmp, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, subject + date);
  git(["add", rel]);
  git(["commit", "-m", subject], date);
}

git(["init", "-q"]);
commit(".kiro/specs/alpha/requirements.md", "spec alpha", "2026-01-01");
commit(".kiro/specs/beta/requirements.md", "spec beta", "2026-01-03");
commit(".kiro/specs/alpha/tasks.md", "later alpha edit", "2026-01-05");
commit("x.txt", "Merge pull request #7 from a/b", "2026-01-04");
commit("y.txt", "Merge PR #8 (via tool)", "2026-01-06");
commit("z.txt", "fix thing (#9)", "2026-01-06");

describe("timeline from git", () => {
  it("takes the first commit date of each spec folder", () => {
    expect(specDates(tmp)).toEqual([
      { name: "alpha", date: "2026-01-01" },
      { name: "beta", date: "2026-01-03" },
    ]);
  });

  it("reads PR merge dates from landing subjects and ignores (#N) suffixes", () => {
    expect(mergeDates(["2026-01-04\tMerge pull request #7 from a/b", "2026-01-06\tMerge PR #8", "2026-01-06\tfix (#9)"])).toEqual([
      { pr: 7, date: "2026-01-04" },
      { pr: 8, date: "2026-01-06" },
    ]);
  });

  it("starts at the earliest spec and ends at HEAD, not at the wall clock", () => {
    const t = buildTimeline(tmp)!;
    expect(t.start).toBe("2026-01-01");
    expect(t.end).toBe("2026-01-06");
    expect(t.days).toBe(6);
    expect(t.merges.map((m) => m.pr)).toEqual([7, 8]);
  });

  it("renders the same bytes twice", () => {
    const t = buildTimeline(tmp)!;
    expect(renderTimeline(t)).toBe(renderTimeline(buildTimeline(tmp)!));
    expect(renderTimeline(t)).toContain("6 days, 2 specs, 2 merged PRs");
  });

  it("escapes XML in labels", () => {
    const svg = renderTimeline({ start: "2026-01-01", end: "2026-01-02", days: 2, specs: [{ name: `a<b>&"'c`, date: "2026-01-01" }], merges: [] });
    expect(svg).toContain("a&lt;b&gt;&amp;&quot;&apos;c");
    expect(svg).not.toContain("a<b>");
    expect(esc("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("converts days and dates both ways", () => {
    expect(isoOf(dayNumber("2026-11-17") + 8)).toBe("2026-11-25");
  });
});

describe("committed SVGs", () => {
  for (const rel of ["docs/img/architecture.svg", "docs/img/kiro-timeline.svg"]) {
    const svg = readFileSync(join(ROOT, rel), "utf8");
    it(`${rel} is self-contained and accessible`, () => {
      expect(svg).toMatch(/<svg[^>]*viewBox="[^"]+"/);
      expect(svg).toMatch(/<title[\s>]/);
      expect(svg).toMatch(/<desc[\s>]/);
      expect(svg).not.toMatch(/<script/i);
      expect(svg).not.toMatch(/@import/i);
      expect(svg).not.toMatch(/<foreignObject/i);
      const urls = [...svg.matchAll(/https?:\/\/[^"'\s)<]+/g)].map((m) => m[0]);
      expect(urls.filter((u) => u !== "http://www.w3.org/2000/svg")).toEqual([]);
      expect(svg).not.toMatch(/\bhref\s*=\s*["'](?!#)/);
      expect(svg).not.toMatch(/url\((?!#)/);
    });
  }
});
