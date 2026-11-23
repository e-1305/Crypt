// Judges' ask (simple, focused): the first screen has exactly one filled call to action, "Scan your repo".
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const css = readFileSync(resolve(ROOT, "web/style.css"), "utf8");
const html = readFileSync(resolve(ROOT, "web/index.html"), "utf8");

describe("landing: one primary action", () => {
  it("fills only #hero-scan among the hero calls to action and puts it first", () => {
    const filled = [...css.matchAll(/([^{}]*#hero-(\w+)[^{}]*)\{[^}]*background:\s*var\(--fg\)[^}]*\}/g)].map((m) => m[2]);
    expect(filled).toEqual(["scan"]);
    expect(css).toMatch(/\.hero-actions #hero-scan \{ order: -2;/);
    expect(css).toMatch(/\.hero-actions #hero-watch \{ order: -1; \}/);
  });
  it("keeps every hero control in the page (tests and judge mode use them)", () => {
    for (const id of ["hero-scan", "hero-watch", "hero-play", "hero-teams", "views-nav", "hc-toggle", "manual-link"]) expect(html).toContain(`id="${id}"`);
  });
  it("keeps the filled button readable in high-contrast mode", () => {
    expect(css).toMatch(/body\.hc \.hero-actions #hero-scan \{ background: #fff; color: #000;/);
  });
});
