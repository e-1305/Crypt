// Judge focus mode (#262): numbered captions and a spotlight on the element the demo acts on.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const J: any = await import(pathToFileURL(resolve(ROOT, "web/judge-mode.js")).href);
const html = readFileSync(resolve(ROOT, "web/index.html"), "utf8");
const css = readFileSync(resolve(ROOT, "web/style.css"), "utf8");

describe("judge focus mode", () => {
  const tl = J.buildTimeline();
  it("numbers every caption n/6 and keeps the SIMULATED label", () => {
    tl.forEach((s: { id: string; caption: string }, i: number) => {
      expect(J.numberedCaption(tl, s.id)).toBe(`${i + 1}/${tl.length} ${s.caption}`);
    });
    expect(J.numberedCaption(tl, "ci")).toMatch(/simulated/i);
    expect(J.numberedCaption(tl, "nope")).toBe("");
  });
  it("is off unless ?focus=1", () => {
    expect(J.focusEnabled("?focus=1")).toBe(true);
    expect(J.focusEnabled("?record=1&focus=1")).toBe(true);
    expect(J.focusEnabled("?judge=1")).toBe(false);
    expect(J.focusEnabled("")).toBe(false);
  });
  it("has a spotlight target for every step that exists on the page", () => {
    for (const s of tl) {
      expect(s.id in J.FOCUS_TARGET).toBe(true);
      const id = J.FOCUS_TARGET[s.id];
      if (id) expect(html).toContain(`id="${id}"`);
    }
  });
  it("keeps the caption above the spotlight and respects reduced motion", () => {
    const spotZ = Number(/\.judge-spot\s*\{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);
    const stageZ = Number(/\.judge-stage\s*\{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);
    expect(stageZ).toBeGreaterThan(spotZ);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.judge-spot\s*\{\s*transition:\s*none/);
  });
});
