import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DIR = "web/graveyard";
const html = readFileSync(join(DIR, "graveyard.html"), "utf8");
const js = readFileSync(join(DIR, "graveyard.js"), "utf8");
const css = readFileSync(join(DIR, "graveyard.css"), "utf8");

describe("graveyard.html", () => {
  it("has lang, one main landmark, a skip link, a title and a way back", () => {
    expect(html).toMatch(/<html lang="en">/);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toMatch(/class="skip" href="#main"/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toContain('href="../"');
  });
  it("has a screen reader table with caption and scoped headers, and a progressbar and live status", () => {
    expect(html).toMatch(/<table[^>]*>\s*<caption>[^<]+<\/caption>/);
    expect(html).toMatch(/<th scope="col">Repository<\/th>/);
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow/);
    expect(html).toMatch(/aria-live="polite"/);
  });
  it("has no inline script or handler, only a module script", () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).toMatch(/<script type="module" src="graveyard.js">/);
  });
  it("offers the three inputs, the views and recording mode", () => {
    for (const id of ["repos", "file", "load-census", "sort", "filter-sla", "filter-owner", "view-toggle", "record-on", "resume"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("No repo is ranked against another.");
  });
});

describe("graveyard.js", () => {
  it("writes data with textContent only", () => {
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
    expect(js).toContain("textContent");
  });
  it("never ranks or blames, never offers a merge", () => {
    for (const s of [js, html, css]) {
      expect(s).not.toMatch(/worst|blame|merge/i);
      expect(s).not.toContain("\u2014");
    }
  });
  it("has the dry run label, Escape handling, reduced motion and the queue", () => {
    expect(js).toMatch(/dryRunLabel/);
    expect(js).toMatch(/Escape/);
    expect(js).toMatch(/prefers-reduced-motion/);
    expect(js).toMatch(/createQueue/);
    expect(js).toMatch(/sessionStorage/);
  });
  it("imports files that exist in the compiled output (web/js) or in src", () => {
    for (const m of js.matchAll(/from "(\.\.\/js\/[^"]+)"/g)) {
      const rel = m[1]!.replace(/^\.\.\/js\//, "").replace(/\.js$/, ".ts");
      expect(existsSync(resolve("src", rel)), m[1]).toBe(true);
    }
    expect(dirname(DIR)).toBe("web");
  });
  it("fetches only relative files", () => {
    for (const m of js.matchAll(/fetch\(\s*"([^"]+)"/g)) expect(m[1]).not.toMatch(/^[a-z]+:|^\/\//i);
  });
});

describe("graveyard.js scan wiring", () => {
  it("restores a cached repo from the stored record and handles a rejected start()", () => {
    expect(js).not.toMatch(/c\.slugOf/);
    expect(js).toContain("slugOf(c.record.repo)");
    expect(js).toMatch(/S\.queue\.start\(\)\.catch\(/);
  });
  it("lists unreadable repositories as not scanned", () => {
    expect(html).toContain('id="not-scanned-list"');
    expect(js).toContain(": not scanned.");
  });
});

describe("graveyard.css", () => {
  it("keeps tap targets at 44px and respects reduced motion", () => {
    expect(css).toMatch(/min-height: 44px/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});
