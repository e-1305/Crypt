// STRUCTURAL: reads web/style.css text. The rendered fit at 390 and 1440 px is checked in a real browser.
// Issue #362: the 80 column plate must scale down on phones so the creature is not clipped.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dirname, "..", "web", "style.css"), "utf8");

describe("plate font size on phones", () => {
  it("scales the plate with the viewport at max-width 480px", () => {
    const m = css.match(/@media \(max-width: 480px\) \{\s*\.plate \{ font-size: min\(var\(--text-14\), ([\d.]+)vw\); \}\s*\}/);
    expect(m).not.toBeNull();
    // 80 columns * .6em per column * vw must fit 390px minus 2rem of margins (358px = 91.8vw).
    expect(80 * 0.6 * Number(m![1])).toBeLessThanOrEqual(91);
  });

  it("keeps the 13px desktop size outside the phone query", () => {
    expect(css).toMatch(/\.plate \{ margin: 0; overflow-x: auto; font: inherit; font-size: 13px;/);
  });
});
