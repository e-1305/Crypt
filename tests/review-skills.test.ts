import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("review skills", () => {
  for (const f of [
    ".kiro/steering/review-round-of-10s.md",
    ".kiro/steering/review-conseil-des-7.md",
  ]) {
    it(`${f} exists with manual inclusion`, () => {
      expect(existsSync(f)).toBe(true);
      expect(read(f)).toMatch(/^---\ninclusion: manual\n---\n/);
    });
  }

  it("reviewer.json parses and grants no write or shell tool", () => {
    const a = JSON.parse(read(".kiro/agents/reviewer.json"));
    expect(a.name).toBe("reviewer");
    for (const t of a.tools) expect(["write", "shell"]).not.toContain(t);
    expect(a.tools).not.toContain("*");
    expect(a.excludedTools).toEqual(expect.arrayContaining(["write", "shell"]));
    expect(a.prompt).toContain("review-round-of-10s.md");
    expect(a.prompt).toContain("review-conseil-des-7.md");
    for (const r of a.resources) expect(existsSync(r.replace("file://", ""))).toBe(true);
  });
});
