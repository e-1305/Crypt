import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dollyProgress } from "../src/theatre/polish.js";

const files = ["web/style.css", "web/war-room/war-room.css", "web/for-teams.css", "web/manual.css", "web/graveyard/graveyard.css"];
const css = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const LAYOUT = /\b(width|height|top|left|right|bottom|margin[\w-]*|padding[\w-]*|clip-path|box-shadow|text-shadow|color|background[\w-]*)\b/;

describe("motion system", () => {
  it("never transitions or animates layout properties", () => {
    for (const f of files) {
      const t = css(f);
      for (const m of t.matchAll(/transition(?:-property)?\s*:([^;}]*)/g)) {
        expect(m[1], `${f}: ${m[0]}`).not.toMatch(LAYOUT);
      }
      for (const m of t.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
        for (const d of m[1]!.matchAll(/\{([^}]*)\}/g)) {
          for (const decl of d[1]!.split(";")) {
            const prop = decl.split(":")[0]!.trim();
            if (prop) expect(["transform", "opacity"], `${f}: ${prop}`).toContain(prop);
          }
        }
      }
    }
  });

  it("uses motion tokens, no linear or steps() easing", () => {
    for (const f of files) {
      const t = css(f);
      expect(t, f).not.toMatch(/\bsteps\(|\blinear\b(?!-gradient)|ease-in\b(?!-out)/);
      for (const m of t.matchAll(/(?:^|[;{\s])(animation|transition)\s*:([^;}]*)/g)) {
        if (/^\s*none\b/.test(m[2]!)) continue;
        expect(m[2], `${f}: ${m[0]}`).toMatch(/var\(--(ease|dur)/);
      }
    }
  });

  it("disables every animation under reduced motion and high contrast", () => {
    for (const f of ["web/style.css", "web/war-room/war-room.css"]) {
      const t = css(f);
      if (!/@keyframes/.test(t)) continue;
      expect(t, f).toMatch(/prefers-reduced-motion:\s*reduce\)\s*\{[^}]*animation:\s*none\s*!important/);
    }
    expect(css("web/style.css")).toMatch(/body\.hc \*[^}]*animation: none !important[^}]*transition: none !important/);
  });

  it("keeps reveal durations within 200-320 ms", () => {
    const t = css("web/brand.css");
    for (const n of ["--dur-reveal", "--dur-reveal-long"]) {
      const ms = Number(new RegExp(n + ":\\s*(\\d+)ms").exec(t)![1]);
      expect(ms).toBeGreaterThanOrEqual(200);
      expect(ms).toBeLessThanOrEqual(320);
    }
  });

  it("dolly eases out: fast start, monotonic", () => {
    expect(dollyProgress(300, false)).toBeGreaterThan(300 / 1200);
    let prev = 0;
    for (let t = 0; t <= 1200; t += 50) { const v = dollyProgress(t, false); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
});
