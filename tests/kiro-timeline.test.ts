import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildTimeline, dayNumber, esc, isoOf, landingDates, renderTimeline, specDates } from "../scripts/kiro-timeline.js";

const ROOT = resolve(import.meta.dirname, "..");
const tmp = mkdtempSync(join(tmpdir(), "kiro-timeline-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function git(args: string[], date?: string) {
  const env = { ...process.env, ...(date ? { GIT_AUTHOR_DATE: `${date}Z`, GIT_COMMITTER_DATE: `${date}Z` } : {}) };
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
commit(".kiro/specs/alpha/requirements.md", "spec alpha", "2026-01-01T09:00:00");
commit(".kiro/specs/beta/requirements.md", "spec beta", "2026-01-01T15:00:00");
commit("x.txt", "Merge pull request #7 from a/b", "2026-01-02T04:00:00");
commit(".kiro/specs/alpha/tasks.md", "later alpha edit", "2026-01-03T10:00:00");
commit("y.txt", "Merge PR #8 (via tool)", "2026-01-03T18:00:00");
commit("z.txt", "fix thing (#9)", "2026-01-03T19:00:00");

describe("timeline from git", () => {
  it("takes the first and last commit time of each spec folder, in UTC", () => {
    expect(specDates(tmp)).toEqual([
      { name: "alpha", first: "2026-01-01T09:00:00Z", last: "2026-01-03T10:00:00Z" },
      { name: "beta", first: "2026-01-01T15:00:00Z", last: "2026-01-01T15:00:00Z" },
    ]);
  });

  it("reads PR merge times from landing subjects and ignores (#N) suffixes", () => {
    expect(landingDates(["2026-01-04T05:00:00+02:00\tMerge pull request #7 from a/b", "2026-01-06T10:00:00Z\tMerge PR #8", "2026-01-06T11:00:00Z\tfix (#9)"])).toEqual([
      { pr: 7, at: "2026-01-04T03:00:00Z" },
      { pr: 8, at: "2026-01-06T10:00:00Z" },
    ]);
  });

  it("starts at the earliest spec and ends at HEAD, not at the wall clock", () => {
    const t = buildTimeline(tmp)!;
    expect(t.start).toBe("2026-01-01T09:00:00Z");
    expect(t.end).toBe("2026-01-03T19:00:00Z");
    expect(t.days).toBe(3);
    expect(t.hours).toBe(58);
    expect(t.merges.map((m) => m.pr)).toEqual([7, 8]);
  });

  it("renders the same bytes twice", () => {
    const t = buildTimeline(tmp)!;
    expect(renderTimeline(t)).toBe(renderTimeline(buildTimeline(tmp)!));
    expect(renderTimeline(t)).toContain("3 days (58 hours), 2 specs, 2 merged PRs");
  });

  it("puts specs that start on the same day at distinct x positions", () => {
    const svg = renderTimeline(buildTimeline(tmp)!);
    const bars = [...svg.matchAll(/<rect class="bar" x="(\d+)"/g)].map((m) => Number(m[1]));
    expect(bars).toHaveLength(2);
    expect(bars[0]).not.toBe(bars[1]);
    expect(svg).toMatch(/>\d\d:00</);
  });

  it("escapes XML in labels", () => {
    const svg = renderTimeline({ start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", days: 2, hours: 24, specs: [{ name: `a<b>&"'c`, first: "2026-01-01T00:00:00Z", last: "2026-01-01T05:00:00Z" }], merges: [] });
    expect(svg).toContain("a&lt;b&gt;&amp;&quot;&apos;c");
    expect(svg).not.toContain("a<b>");
    expect(esc("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("keeps every bar and tick inside the viewBox with many specs", () => {
    const specs = Array.from({ length: 33 }, (_, i) => ({ name: `spec-number-${i}`, first: `2026-01-02T${String(i % 24).padStart(2, "0")}:00:00Z`, last: "2026-01-03T00:00:00Z" }));
    const svg = renderTimeline({ start: "2026-01-02T00:00:00Z", end: "2026-01-03T00:00:00Z", days: 2, hours: 24, specs, merges: [{ pr: 1, at: "2026-01-03T00:00:00Z" }] });
    const [w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!.slice(1).map(Number) as [number, number];
    for (const m of svg.matchAll(/<rect class="bar" x="(\d+)" y="(\d+)" width="(\d+)"/g)) {
      expect(Number(m[1]) + Number(m[3])).toBeLessThanOrEqual(w);
      expect(Number(m[2])).toBeLessThan(h);
    }
    for (const m of svg.matchAll(/ x1="(\d+)"/g)) expect(Number(m[1])).toBeLessThanOrEqual(w);
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
