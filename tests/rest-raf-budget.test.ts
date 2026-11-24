// STRUCTURAL: reads scripts/ci/visual-qa.mjs and .github/workflows/ci.yml source. The measurement itself runs in Chromium in the visual-qa CI job.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const qa = readFileSync(resolve(root, "scripts/ci/visual-qa.mjs"), "utf8");
const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");

describe("landing page idle animation budget (#316)", () => {
  it("injects a requestAnimationFrame counter before the page loads", () => {
    const init = qa.indexOf("page.addInitScript", qa.indexOf("async function checkRestRaf"));
    const goto = qa.indexOf("page.goto(base)", init);
    expect(init).toBeGreaterThan(-1);
    expect(goto).toBeGreaterThan(init);
    expect(qa).toMatch(/window\.requestAnimationFrame = /);
  });
  it("waits 8 s, then counts over 5 s and allows at most 2 per second", () => {
    expect(qa).toMatch(/const REST_SETTLE_MS = 8000;/);
    expect(qa).toMatch(/const REST_WINDOW_MS = 5000;/);
    expect(qa).toMatch(/const REST_RAF_MAX_PER_SEC = 2;/);
    expect(qa).toMatch(/perSec > REST_RAF_MAX_PER_SEC\) fail\(/);
  });
  it("sends no input between the settle wait and the count", () => {
    const body = qa.slice(qa.indexOf("async function checkRestRaf"), qa.indexOf("let browser;"));
    expect(body).not.toMatch(/\.(click|hover|type|press|mouse)\b/);
  });
  it("runs from the main sequence, which the visual-qa CI step executes", () => {
    expect(qa).toMatch(/await checkRestRaf\(browser, /);
    expect(ci).toMatch(/run: npm run test:visual/);
    expect(ci).toMatch(/idle animation budget/);
  });
});
