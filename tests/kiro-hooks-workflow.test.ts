import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const y = readFileSync(join(ROOT, ".github", "workflows", "kiro-hooks.yml"), "utf8");

describe("kiro-hooks.yml", () => {
  it("triggers only on workflow_dispatch", () => {
    const on = y.slice(y.indexOf("\non:"), y.indexOf("\npermissions:"));
    expect(on.trim()).toBe("on:\n  workflow_dispatch:");
  });

  it("names the secret only as secrets.KIRO_API_KEY, in the two steps that need it", () => {
    expect(y.match(/secrets\.KIRO_API_KEY/g)).toHaveLength(2);
    expect(y).not.toMatch(/echo[^\n]*\$\{?KIRO_API_KEY/);
    expect(y).not.toMatch(/KIRO_API_KEY\s*[:=]\s*(?!\$\{\{ secrets\.KIRO_API_KEY \}\})\S/);
  });

  it("has no merge call and never pushes to the default branch", () => {
    expect(y).not.toMatch(/merge/i);
    expect(y).not.toMatch(/git push[^\n]*\b(main|master)\b/);
    expect(y).not.toMatch(/git push origin HEAD/);
    expect(y).toContain('git push origin "$BRANCH"');
  });

  it("records only what the collector marks, and fails when nothing fired", () => {
    expect(y).toContain("scripts/ci/kiro-hooks-collect.mjs");
    expect(y).not.toMatch(/>>\s*docs\/evidence/);
    expect(y).toContain("kiro-cli chat --v3 --no-interactive");
  });
});
