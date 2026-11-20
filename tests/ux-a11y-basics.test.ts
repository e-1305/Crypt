// UX-a (issue #247): keyboard and screen-reader basics on the game page, checked statically.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("game page keyboard and a11y basics", () => {
  const html = read("web/index.html");
  const css = read("web/style.css");
  const onboarding = read("web/onboarding.js");

  it("shows a focus ring on every focusable control", () => {
    expect(css).toMatch(/(^|\n)\s*:focus-visible\s*\{[^}]*outline:\s*2px solid/);
    // The one place that drops the outline (the command input) draws its own focus cue instead.
    const dropped = css.match(/outline:\s*(none|0)\b/g) ?? [];
    expect(dropped.length).toBeLessThanOrEqual(1);
    if (dropped.length) expect(css).toMatch(/\.input-row input:focus-visible\s*\{[^}]*border-bottom-color/);
  });

  it("announces state changes through polite live regions", () => {
    expect(html).toMatch(/id="transcript"[^>]*aria-live="polite"/);
    expect(html).toMatch(/id="tutorial-hint"[^>]*aria-live="polite"/);
  });

  it("keeps the getting-started strip skippable, remembered, and closable with Escape", () => {
    expect(html).toMatch(/id="tutorial-skip"/);
    expect(html).toMatch(/id="tutorial-hide"/);
    expect(onboarding).toMatch(/ev\.key !== "Escape"/);
    expect(onboarding).toMatch(/store\.set\("crypt\.tutorial\.skipped", true\)/);
  });

  it("keeps the getting-started strip to at most 3 steps", async () => {
    const { tutorialSteps } = await import("../src/theatre/onboarding.js");
    expect(tutorialSteps.length).toBeGreaterThan(0);
    expect(tutorialSteps.length).toBeLessThanOrEqual(3);
  });
});
