import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// FIX-12 (#269): first-party browser code must not use HTML or code injection sinks.
// web/vendor/ is third-party (zvm.min.js uses new Function for its JIT; see docs/SECURITY-AUDIT.md).

const ROOT = "web";
const EXT = /\.(js|mjs|html)$/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (p === join(ROOT, "vendor")) continue;
      out.push(...walk(p));
    } else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT).map((p) => p.split("\\").join("/"));
const read = (p: string): string => readFileSync(p, "utf8");

// The only innerHTML writes allowed: one constant string each, no interpolation.
const ALLOWED_INNER_HTML: Record<string, { line: number; constant: RegExp }> = {
  "web/app.js": { line: 219, constant: /^\s*el\.innerHTML = '[^'`]*(?:\\'[^'`]*)*';\s*$/ },
  "web/theatre/drawer.js": { line: 17, constant: /^\s*root\.innerHTML =\s*$/ },
};

describe("web/** XSS guard", () => {
  it("scans first-party files and skips web/vendor", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.startsWith("web/vendor/"))).toBe(false);
    expect(files).toContain("web/app.js");
    expect(files).toContain("web/theatre/drawer.js");
  });

  it("has no insertAdjacentHTML, document.write, eval or new Function", () => {
    const bad = /\binsertAdjacentHTML\b|\bdocument\s*\.\s*write(ln)?\s*\(|\beval\s*\(|\bnew\s+Function\b|\bouterHTML\s*=/;
    const hits = files.filter((f) => bad.test(read(f)));
    expect(hits).toEqual([]);
  });

  it("uses innerHTML only at the two known constant sites", () => {
    const found: string[] = [];
    for (const f of files) {
      read(f).split("\n").forEach((text, i) => {
        if (/\binnerHTML\b/.test(text)) found.push(`${f}:${i + 1}`);
      });
    }
    expect(found.sort()).toEqual(Object.entries(ALLOWED_INNER_HTML).map(([f, a]) => `${f}:${a.line}`).sort());
  });

  it("keeps each allowed innerHTML a constant string with no interpolation", () => {
    for (const [f, a] of Object.entries(ALLOWED_INNER_HTML)) {
      const lines = read(f).split("\n");
      expect(lines[a.line - 1]).toMatch(a.constant);
    }
    // app.js: a single-line constant
    const app = read("web/app.js").split("\n")[218]!;
    expect(app).not.toMatch(/\$\{|`|'\s*\+\s*[A-Za-z_(]/);
    // drawer.js: the whole assignment is string literals joined by +, ending at the first semicolon
    const drawer = read("web/theatre/drawer.js").split("\n");
    const stmt: string[] = [];
    for (let i = 16; i < drawer.length; i++) {
      stmt.push(drawer[i]!);
      if (/;\s*$/.test(drawer[i]!)) break;
    }
    const body = stmt.slice(1).join("\n");
    expect(body).not.toMatch(/\$\{|`/);
    for (const line of stmt.slice(1)) {
      expect(line.trim()).toMatch(/^(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(?:\+|;)$/);
    }
  });
});
