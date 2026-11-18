// STRUCTURAL: reads web/index.html and docs/PROOF.md source. The rendered layout is checked by scripts/ci/visual-qa.mjs.
// Issue #135: the real evidence chain on the page and in docs/PROOF.md.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(import.meta.dirname, "..", f), "utf8");
const html = read("web/index.html");
const proofDoc = read("docs/PROOF.md");
const section = html.slice(html.indexOf('<section id="proof"'), html.indexOf("</section>", html.indexOf('<section id="proof"')));

const URLS = [
  "https://github.com/e-1305/Crypt/actions/runs/44369138370",
  "https://github.com/e-1305/Crypt/actions/runs/44374815473",
  "https://github.com/e-1305/crypt-demo/pull/1",
  "https://github.com/e-1305/crypt-demo/actions/runs/44369232555/job/135031172852",
  "https://github.com/e-1305/Crypt/actions/runs/44373819785",
  "https://github.com/e-1305/crypt-demo/pull/2",
  "https://github.com/e-1305/crypt-demo/actions/runs/44374944193/job/135051477584",
  "https://github.com/e-1305/Crypt/actions/runs/44375794960",
];

describe("proof chain", () => {
  it("renders six steps with the exact real links on the page", () => {
    expect(section).toContain('id="proof-h"');
    expect(section.match(/<li>/g)).toHaveLength(6);
    for (const u of URLS) expect(section, u).toContain(`href="${u}"`);
    expect(section).toContain('href="https://github.com/e-1305/Crypt/blob/main/docs/PROOF.md"');
  });

  it("lists the same links in docs/PROOF.md", () => {
    for (const u of URLS) expect(proofDoc, u).toContain(u);
    expect(proofDoc).toContain("inferred");
  });

  it("links only to github.com/e-1305 and names no person", () => {
    for (const text of [section, proofDoc]) {
      for (const m of text.matchAll(/https?:\/\/[^\s"')]+/g)) expect(m[0], m[0]).toMatch(/^https:\/\/github\.com\/e-1305\//);
      expect(text).not.toContain("\u2014");
      expect(text).not.toMatch(/@\w|merged by [A-Z]/);
    }
    expect(section).toContain("Merged by a human");
    expect(section).toContain("CRYPT has no merge call");
  });

  it("labels the rehearsal areas and links each to the proof", () => {
    expect(html.match(/Rehearsal \(nothing leaves this page\)/g)).toHaveLength(2);
    expect(html.match(/<a href="#proof">See the real run<\/a>/g)).toHaveLength(2);
    expect(html).toContain('id="proof-line"');
  });
});
