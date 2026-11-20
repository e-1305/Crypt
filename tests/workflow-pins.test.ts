import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

// FIX-6 (docs/SECURITY-AUDIT.md item 7): every `uses:` must name a 40 hex commit SHA.
// Local `./` actions are excepted.
//
// FIX-6 pinned ci.yml and FIX-7 pinned release, stats and kiro-hooks. These files still carry unpinned references and are
// fixed by follow-up changes. Remove an entry when its file is pinned (the last test
// below fails if you forget). Never add ci.yml here.
const KNOWN_UNPINNED = new Set([
  ".github/workflows/action-selftest.yml",
  ".github/workflows/live-raid.yml",
  ".github/workflows/pages.yml",
  "action.yml",
]);

const SHA = /^[0-9a-f]{40}$/;

function files(): string[] {
  const wf = readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => `.github/workflows/${f}`);
  return [...wf, "action.yml"];
}

function unpinned(rel: string): string[] {
  const bad: string[] = [];
  readFileSync(join(ROOT, rel), "utf8").split("\n").forEach((line, i) => {
    const m = /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(line);
    if (!m) return;
    const ref = m[1].replace(/^["']|["']$/g, "");
    if (ref.startsWith("./")) return;
    const at = ref.lastIndexOf("@");
    if (at < 0 || !SHA.test(ref.slice(at + 1))) bad.push(`${rel}:${i + 1} ${ref}`);
  });
  return bad;
}

describe("workflow action pins (FIX-6)", () => {
  it("never allowlists ci.yml", () => {
    expect(KNOWN_UNPINNED.has(".github/workflows/ci.yml")).toBe(false);
  });

  it("pins every uses: in ci.yml to a 40 hex SHA", () => {
    expect(unpinned(".github/workflows/ci.yml")).toEqual([]);
  });

  it("pins every uses: outside the known-unpinned list", () => {
    const bad = files().filter((f) => !KNOWN_UNPINNED.has(f)).flatMap(unpinned);
    expect(bad).toEqual([]);
  });

  it("keeps the known-unpinned list honest", () => {
    const stale = [...KNOWN_UNPINNED].filter((f) => unpinned(f).length === 0);
    expect(stale).toEqual([]);
  });

  it("sets persist-credentials: false on every checkout in ci.yml", () => {
    const text = readFileSync(join(WORKFLOWS, "ci.yml"), "utf8");
    const checkouts = text.match(/uses: actions\/checkout@/g)?.length ?? 0;
    const hardened = text.match(/persist-credentials: false/g)?.length ?? 0;
    expect(checkouts).toBeGreaterThan(0);
    expect(hardened).toBe(checkouts);
  });
});

describe("narrow write permissions (FIX-7)", () => {
  const top = (text: string) => /^permissions:\n((?:  .*\n)+)/m.exec(text)?.[1] ?? "";
  for (const [name, writes] of [
    ["release.yml", ["id-token: write"]],
    ["stats.yml", ["contents: write"]],
    ["kiro-hooks.yml", ["contents: write", "pull-requests: write"]],
  ] as const) {
    it(`${name}: workflow default is contents: read, writes only on the job`, () => {
      const text = readFileSync(join(WORKFLOWS, name), "utf8");
      expect(top(text).trim()).toBe("contents: read");
      const jobs = text.slice(text.indexOf("\njobs:"));
      for (const w of writes) expect(jobs).toContain(`      ${w}`);
    });
  }

  it("stats.yml runs only on push to main or manual dispatch", () => {
    const text = readFileSync(join(WORKFLOWS, "stats.yml"), "utf8");
    expect(text).toMatch(/push:\n\s+branches: \[main\]/);
    expect(text).not.toContain("pull_request");
  });
});
