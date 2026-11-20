import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const WEB = join(__dirname, "..", "web");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "vendor") continue;
      out.push(...walk(p));
    } else if (/\.(js|mjs|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(WEB).map((p) => ({
  rel: relative(join(__dirname, ".."), p).split(sep).join("/"),
  text: readFileSync(p, "utf8"),
}));

// The only innerHTML writes are constant strings with no interpolation.
const INNER_HTML_ALLOWED: Record<string, number> = {
  "web/app.js": 1,
  "web/theatre/drawer.js": 1,
};

describe("web XSS guard", () => {
  it("scans the site files", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.rel === "web/app.js")).toBe(true);
    expect(files.some((f) => f.rel.startsWith("web/vendor/"))).toBe(false);
  });

  it("has no insertAdjacentHTML, document.write or eval outside web/vendor", () => {
    for (const f of files) {
      expect(f.text, f.rel).not.toMatch(/insertAdjacentHTML|document\.write\s*\(|\beval\s*\(/);
    }
  });

  it("uses innerHTML only at the two known constant sites", () => {
    for (const f of files) {
      const n = (f.text.match(/\binnerHTML\b/g) ?? []).length;
      expect(n, f.rel).toBe(INNER_HTML_ALLOWED[f.rel] ?? 0);
    }
  });
});
