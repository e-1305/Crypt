import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(f, "utf8");

describe("R2 copy", () => {
  it("no doc says the package is unpublished", () => {
    for (const f of ["README.md", "docs/DEVPOST.md", "docs/BLOG.md", "web/index.html"]) {
      expect(read(f), f).not.toMatch(/not published|published yet|not been published/i);
    }
  });
  it("#pitch is plain language under 20 words", () => {
    const m = read("web/index.html").match(/id="pitch">([^<]*)</);
    expect(m).not.toBeNull();
    const text = m![1];
    expect(text.split(/\s+/).filter(Boolean).length).toBeLessThan(20);
    expect(text).not.toMatch(/limb|graft|dependency tree/i);
  });
  it("proof says who merged and what it does not show", () => {
    for (const f of ["web/index.html", "docs/PROOF.md"]) {
      const t = read(f);
      expect(t, f).toMatch(/repo owner/);
      expect(t, f).toMatch(/Merge button/);
      expect(t, f).toMatch(/reachab/);
    }
  });
});
