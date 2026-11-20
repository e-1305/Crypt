import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Audit item 5 (docs/SECURITY-AUDIT.md, FIX-2 and FIX-3): each page carries a CSP meta tag.
// Pages that load no ZVM need no 'unsafe-eval'.

interface Page {
  file: string;
  evalAllowed: boolean;
  connect: string[];
}

const PAGES: Page[] = [
  // 'unsafe-eval' is required only because web/vendor/zvm.min.js:2 compiles story code with
  // `new Function` (its JIT). An interpreter build without `new Function` would let this policy drop it.
  { file: "web/index.html", evalAllowed: true, connect: ["'self'", "https://raw.githubusercontent.com", "https://api.osv.dev"] },
  // The War Room does not load ZVM. connect-src is one host so a pasted token can only go to GitHub.
  { file: "web/war-room/war-room.html", evalAllowed: false, connect: ["'self'", "https://api.github.com"] },
];

function policyOf(html: string): Map<string, string[]> {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  expect(m, "CSP meta tag").not.toBeNull();
  const out = new Map<string, string[]>();
  for (const part of m![1].split(";")) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name) out.set(name, vals);
  }
  return out;
}

describe.each(PAGES)("CSP meta in $file", ({ file, evalAllowed, connect }) => {
  const html = readFileSync(file, "utf8");
  const policy = policyOf(html);

  it("sits in the head, before any script or stylesheet", () => {
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain("Content-Security-Policy");
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.search(/<(script|link)\b/));
  });
  it("starts from default-src 'none' and blocks base and form abuse", () => {
    expect(policy.get("default-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'none'"]);
  });
  it("has no unsafe-inline in script-src or style-src", () => {
    expect(policy.get("script-src")).not.toContain("'unsafe-inline'");
    expect(policy.get("style-src")).toEqual(["'self'"]);
  });
  it(evalAllowed ? "allows unsafe-eval only for the ZVM JIT" : "does not allow unsafe-eval", () => {
    const has = policy.get("script-src")!.includes("'unsafe-eval'");
    expect(has).toBe(evalAllowed);
    if (evalAllowed) expect(readFileSync("web/vendor/zvm.min.js", "utf8")).toContain("new Function");
  });
  it("pins connect-src to the expected hosts", () => {
    expect(policy.get("connect-src")).toEqual(connect);
  });
  it("has no inline script body, on* handler, style block or style attribute", () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(html).not.toMatch(/<script[^>]*>\s*[^\s<]/);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
  });
});
