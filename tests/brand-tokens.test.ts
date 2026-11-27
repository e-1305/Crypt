import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const read = (f: string) => readFileSync(resolve(ROOT, f), "utf8");
const brand = read("web/brand.css");
const doc = read("docs/BRAND.md");

describe("brand tokens", () => {
  it("defines every token listed in BRAND.md", () => {
    const names = [...new Set([...doc.matchAll(/`(--[a-z0-9-]+)`/g)].map((m) => m[1]))];
    expect(names.length).toBeGreaterThan(30);
    for (const n of names) expect(brand, n).toMatch(new RegExp(`${n}\\s*:`));
  });

  it("is loaded before every other stylesheet", () => {
    for (const [f, href] of [["web/index.html", "brand.css"], ["web/for-teams.html", "brand.css"], ["web/graveyard/graveyard.html", "../brand.css"], ["web/war-room/war-room.html", "brand.css"]]) {
      const html = read(f);
      const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
      expect(links[0], f).toBe(href);
      expect(html.indexOf("Content-Security-Policy"), f).toBeLessThan(html.indexOf(href));
    }
    const html = read("web/index.html");
    expect(html.indexOf('href="brand.css"')).toBeLessThan(html.indexOf('href="style.css"'));
  });

  it("has no em dash, animation or keyframes", () => {
    expect(doc).not.toContain("\u2014");
    expect(brand).not.toContain("\u2014");
    expect(brand).not.toMatch(/@keyframes|animation\s*:|transition\s*:/);
  });
});
