// STRUCTURAL: static wiring checks for the War Room page (Epic D4). They read source text, not a rendered page;
// scripts/ci/visual-qa.mjs loads the built page in Chromium.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const html = read("web/war-room/war-room.html");
const js = read("web/war-room/war-room.js");
const css = read("web/war-room/war-room.css");

describe("war room page", () => {
  it("imports only compiled modules that the web build produces", () => {
    const imports = [...js.matchAll(/from "\.\.\/(js\/[^"]+|theatre\/[^"]+)"/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(5);
    for (const i of imports) {
      if (i.startsWith("theatre/")) expect(existsSync(join(ROOT, "web", i)), i).toBe(true);
      else expect(existsSync(join(ROOT, "src", i.replace(/^js\//, "").replace(/\.js$/, ".ts"))), i).toBe(true);
    }
  });

  it("labels the simulated mode, names the human merge and has a language and title", () => {
    expect(html).toContain("SIMULATED:");
    expect(html).toContain("A human merges every pull request");
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toContain('aria-live="polite"');
    for (const id of ["scene", "bosses", "score", "countdown", "combo", "feed", "badges"]) expect(html).toContain(`id="${id}`);
  });

  it("keeps the token in a password field and in memory only", () => {
    expect(html).toMatch(/id="token-input"[^>]*type="password"[^>]*autocomplete="off"/);
    expect(html).toMatch(/<label for="token-input">/);
    expect(js).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB|console\./);
    expect(js).toMatch(/pagehide/);
    expect(js).not.toMatch(/location\.(search|hash|href)\s*=/);
  });

  it("only reads: GET requests, no merge string, no write methods", () => {
    const all = html + js + css;
    expect(all).not.toMatch(/\/merge\b|merge\(|"merge"|'merge'/i);
    expect(js).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/i);
    expect(js).toContain('method: "GET"');
  });

  it("honours reduced motion", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(js).toContain("prefers-reduced-motion: reduce");
  });

  it("is copied to the site by the build", () => {
    const b = read("scripts/build-site.ts");
    expect(b).toContain('join(outDir, "war-room.html")');
    expect(b).toContain('join(outDir, "war-room")');
    expect(html).toContain('href="war-room/war-room.css"');
    expect(html).toContain('src="war-room/war-room.js"');
  });
});
