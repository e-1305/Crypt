import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_TOKENS, STYLE } from "../src/report/template.js";

const ROOT = resolve(import.meta.dirname, "..");
const read = (f: string) => readFileSync(resolve(ROOT, f), "utf8");
const HEX = /(?<=[:\s,(])#[0-9a-fA-F]{3,8}(?![\w-])/g;
const brand = read("web/brand.css");

/** Declarations of the first :root block of a stylesheet, as a name to value map. */
function rootVars(css: string): Map<string, string> {
  const block = css.match(/:root\s*\{([^}]*)\}/)![1];
  return new Map([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);?/g)].map((m) => [m[1], m[2].trim()]));
}

describe("brand tokens on the pages (issue #334)", () => {
  it("has no hex colour in the War Room and Graveyard styles", () => {
    for (const f of ["web/war-room/war-room.css", "web/graveyard/graveyard.css"]) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css.match(HEX) ?? [], f).toEqual([]);
    }
  });

  it("no longer redeclares :root tokens in war-room.css", () => {
    expect(read("web/war-room/war-room.css")).not.toMatch(/:root/);
  });

  it("links brand.css first, right after the CSP meta", () => {
    for (const f of ["web/war-room/war-room.html", "web/graveyard/graveyard.html"]) {
      const html = read(f);
      const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
      expect(links[0], f).toMatch(/brand\.css$/);
    }
  });

  it("autopsy carries the brand.css values and uses them, with no hex outside the tokens and the print block", () => {
    const inline = rootVars(BRAND_TOKENS);
    const file = rootVars(brand);
    for (const [k, v] of inline) {
      expect(v.replace(/\s+/g, ""), k).toBe(file.get(k)?.replace(/\s+/g, ""));
    }
    const screen = STYLE.split("@media print")[0].replace(/:root\{--line[^}]*\}/, "");
    const rest = screen.replace(BRAND_TOKENS, "");
    // The one named exception is the report body text colour --text, which is not a brand token.
    expect(rest.match(HEX) ?? []).toEqual([]);
    expect(STYLE).toContain("var(--font-mono)");
  });

  it("keeps every animation off the new styles", () => {
    expect(STYLE).not.toMatch(/@keyframes|animation\s*:/);
  });
});
