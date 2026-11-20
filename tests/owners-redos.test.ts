// FIX-11 (docs/SECURITY-AUDIT.md item 10): CODEOWNERS matching is linear time and bounded.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MAX_PATTERN_LENGTH, MAX_RULES, UNOWNED, compileGlob, globMatch, ownerOf, parseCodeowners, patternToRegExp } from "../src/exhume/owners.js";

const timed = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t; };

describe("CODEOWNERS ReDoS", () => {
  it("returns fast on the 41-byte hostile line from the audit", () => {
    const rules = parseCodeowners("*".repeat(40) + "z @evil");
    expect(timed(() => expect(ownerOf(rules, "package-lock.json")).toBe(UNOWNED))).toBeLessThan(100);
  });
  it("returns fast on *a repeated against a long path", () => {
    const rules = parseCodeowners("*a".repeat(30) + "z @evil");
    expect(timed(() => ownerOf(rules, "a".repeat(3000)))).toBeLessThan(100);
  });
  it("returns fast on nested **/ against a deep path", () => {
    const rules = parseCodeowners("**/".repeat(10) + "z @evil");
    expect(timed(() => ownerOf(rules, Array(30).fill("d").join("/") + "/package-lock.json"))).toBeLessThan(100);
  });
  it("ignores over-long patterns and rules past the cap (fail-safe: unowned)", () => {
    expect(ownerOf([{ pattern: "*".repeat(MAX_PATTERN_LENGTH + 1), owners: ["@x"] }], "a")).toBe(UNOWNED);
    const many = Array.from({ length: MAX_RULES }, () => ({ pattern: "nomatch", owners: ["@a"] }));
    expect(ownerOf([...many, { pattern: "*", owners: ["@late"] }], "package-lock.json")).toBe(UNOWNED);
  });
  it("keeps last-match-wins on ordinary files", () => {
    const rules = parseCodeowners("* @all\n/package-lock.json @deps\ndocs/ @docs");
    expect(ownerOf(rules, "package-lock.json")).toBe("@deps");
    expect(ownerOf(rules, "requirements.txt")).toBe("@all");
    expect(ownerOf(rules, "docs/a.md")).toBe("@docs");
  });
  it("agrees with the old regex on ordinary patterns", () => {
    const seg = fc.stringMatching(/^[a-z.]{1,4}$/);
    const pat = fc.array(fc.oneof(seg, fc.constantFrom("*", "**", "?", "*.json")), { minLength: 1, maxLength: 4 })
      .chain((parts) => fc.tuple(fc.boolean(), fc.boolean()).map(([lead, trail]) => (lead ? "/" : "") + parts.join("/") + (trail ? "/" : "")));
    const path = fc.array(fc.oneof(seg, fc.constant("package-lock.json")), { minLength: 1, maxLength: 5 }).map((p) => p.join("/"));
    fc.assert(fc.property(pat, path, (p, f) => globMatch(compileGlob(p), f) === patternToRegExp(p).test(f)), { numRuns: 2000 });
  });
});
