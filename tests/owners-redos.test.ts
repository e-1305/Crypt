import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  MAX_PATTERN_LENGTH,
  MAX_RULES,
  matchPattern,
  ownerOf,
  parseCodeowners,
  patternToRegExp,
} from "../src/exhume/owners.js";

function timed(fn: () => unknown): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

describe("CODEOWNERS matching is bounded", () => {
  const path = "a".repeat(5000) + "/b";
  it.each(["*".repeat(40) + "z", "*a".repeat(30) + "z", "**/".repeat(40) + "z"])(
    "pathological pattern finishes quickly",
    (pattern) => {
      const rules = [{ pattern, owners: ["@x"] }];
      expect(timed(() => ownerOf(rules, path))).toBeLessThan(100);
      expect(ownerOf(rules, path)).toBe("unowned");
    },
  );

  it("drops oversized patterns and oversized files", () => {
    expect(parseCodeowners("a".repeat(MAX_PATTERN_LENGTH + 1) + " @x")).toEqual([]);
    const big = Array.from({ length: MAX_RULES + 10 }, (_, i) => `f${i} @x`).join("\n");
    expect(parseCodeowners(big)).toHaveLength(MAX_RULES);
  });

  it("agrees with the regex matcher on ordinary patterns", () => {
    const seg = fc.stringMatching(/^[a-c.]{1,3}$/);
    const part = fc.oneof(seg, fc.constant("*"), fc.constant("**"), fc.constant("?"));
    const pattern = fc
      .tuple(fc.boolean(), fc.array(part, { minLength: 1, maxLength: 4 }), fc.boolean())
      .map(([lead, parts, trail]) => (lead ? "/" : "") + parts.join("/") + (trail ? "/" : ""));
    const file = fc.array(seg, { minLength: 1, maxLength: 4 }).map((a) => a.join("/"));
    fc.assert(
      fc.property(pattern, file, (pat, f) => {
        expect(matchPattern(pat, f)).toBe(patternToRegExp(pat).test(f));
      }),
      { numRuns: 2000 },
    );
  });
});
