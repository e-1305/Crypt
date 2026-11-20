import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

// FIX-6 (docs/SECURITY-AUDIT.md item 7): every `uses:` must name a 40 hex commit SHA.
// Local `./` actions are excepted.
//
// FIX-6 is scoped to ci.yml only. These files still carry unpinned references and are
// fixed by follow-up changes. Remove an entry when its file is pinned (the last test
// below fails if you forget). Never add ci.yml here.
const KNOWN_UNPINNED = new Set([
  ".github/workflows/action-selftest.yml",
  ".github/workflows/kiro-hooks.yml",
  ".github/workflows/live-raid.yml",
  ".github/workflows/pages.yml",
  ".github/workflows/release.yml",
  ".github/workflows/stats.yml",
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
