import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WEB = join(import.meta.dirname, "..", "web");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const FILES = ["jetbrains-mono-latin-400-normal.woff2", "jetbrains-mono-latin-700-normal.woff2"];

describe("self-hosted monospace webfont (#60)", () => {
  it("ships woff2 files and the licence, each small", () => {
    for (const f of FILES) {
      const p = join(WEB, "fonts", f);
      expect(existsSync(p), f).toBe(true);
      expect(readFileSync(p).subarray(0, 4).toString("latin1")).toBe("wOF2");
      expect(statSync(p).size).toBeLessThan(40 * 1024);
    }
    expect(read("fonts/OFL.txt")).toContain("SIL Open Font License");
    expect(readdirSync(join(WEB, "fonts")).filter((f) => f.endsWith(".woff2")).sort()).toEqual(FILES);
  });

  it("declares both faces in style.css and records the font in ATTRIBUTION.md", () => {
    const css = read("style.css");
    for (const f of FILES) expect(css).toContain(`fonts/${f}`);
    expect(css).toMatch(/font-display:\s*swap/);
    expect(readFileSync(join(WEB, "..", "docs", "ATTRIBUTION.md"), "utf8")).toMatch(/JetBrains Mono[^|]*\|[^|]*\|[^|]*\|\s*OFL-1\.1/);
  });

  it("puts the webfont first in every stack and leaves no hand-written canvas stack", () => {
    expect(read("style.css")).toMatch(/font-family: "JetBrains Mono", /);
    expect(read("manual.css")).toMatch(/code \{ font-family: "JetBrains Mono", /);
    expect(read("theatre/font.js")).toMatch(/MONO = `"\$\{FONT_FAMILY\}", /);
    for (const f of ["board", "card-draw", "screen", "wall"]) {
      const src = read(`theatre/${f}.js`);
      expect(src, f).toContain('from "./font.js"');
      expect(src, f).not.toMatch(/DejaVu|ui-monospace/);
    }
  });

  it("waits for the fonts before the stage draws", () => {
    expect(read("theatre/stage.js")).toMatch(/await ensureFonts\(\)/);
  });
});
