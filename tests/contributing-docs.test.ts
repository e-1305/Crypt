import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

describe("CONTRIBUTING.md", () => {
  it("exists and covers setup, safety rules and lockfile parsers", () => {
    expect(existsSync("CONTRIBUTING.md")).toBe(true);
    const t = readFileSync("CONTRIBUTING.md", "utf8");
    for (const s of ["npm ci", "npx vitest run", "npm run build:site", ".kiro/steering", "never merges", "Dry run by default", "lockfile parser"]) {
      expect(t.toLowerCase(), s).toContain(s.toLowerCase());
    }
  });
  it("README links it", () => {
    expect(readFileSync("README.md", "utf8")).toMatch(/\]\(CONTRIBUTING\.md\)/);
  });
});
