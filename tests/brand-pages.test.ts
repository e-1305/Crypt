import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_TOKENS, STYLE } from "../src/report/template.js";
import { renderManual } from "../src/site/manual.js";

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

describe("brand tokens on For teams and the manual (issue #335)", () => {
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const manualHtml = renderManual("# T\n\nintro", {
    sourcePath: "docs/USER_MANUAL.md",
    repoBlobBase: "https://github.com/e-1305/Crypt/blob/main/",
    repoHas: () => false,
    siteHas: () => false,
    siteBase: "https://e-1305.github.io/Crypt/",
  });

  it("has no hex colour in for-teams.css", () => {
    expect(strip(read("web/for-teams.css")).match(HEX) ?? []).toEqual([]);
  });

  it("has hex colours in manual.css only inside the single :root block", () => {
    const css = strip(read("web/manual.css"));
    expect(css.match(/:root\s*\{/g)).toHaveLength(1);
    expect(css.replace(/:root\s*\{[^}]*\}/, "").match(HEX) ?? []).toEqual([]);
  });

  it("does not redeclare brand tokens in :root", () => {
    const names = new Set(rootVars(brand).keys());
    for (const f of ["web/for-teams.css", "web/manual.css"]) {
      const css = strip(read(f));
      const block = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
      for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:/g)) expect(names.has(m[1]), `${f} ${m[1]}`).toBe(false);
    }
  });

  it("links brand.css first, right after the CSP meta", () => {
    for (const [f, html] of [["for-teams.html", read("web/for-teams.html")], ["manual", manualHtml]]) {
      const csp = html.match(/<meta http-equiv="Content-Security-Policy"[^>]*>\n/)!;
      const after = html.slice(html.indexOf(csp[0]) + csp[0].length);
      expect(after.startsWith('<link rel="stylesheet" href="brand.css">'), f).toBe(true);
      expect(html.match(/<link rel="stylesheet" href="([^"]+)"/)![1], f).toBe("brand.css");
    }
  });

  it("adds no animation to either stylesheet", () => {
    for (const f of ["web/for-teams.css", "web/manual.css"]) {
      expect(strip(read(f)), f).not.toMatch(/@keyframes|animation\s*:|transition\s*:/);
    }
  });
});
