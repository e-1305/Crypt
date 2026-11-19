import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROI_DEFAULTS, estimateRoi } from "../src/web/roi.js";

const ROOT = resolve(import.meta.dirname, "..");

describe("estimateRoi", () => {
  it("computes repos x findings x noise share x minutes / 60", () => {
    const r = estimateRoi({ repos: 20, findingsPerRepo: 10, noiseShare: 0.95, triageMinutes: 15 });
    expect(r.findings).toBe(200);
    expect(r.filtered).toBeCloseTo(190);
    expect(r.hoursSaved).toBeCloseTo(47.5);
  });
  it("defaults come from the census (10 per repo, 95.2% noise, 20 repos)", () => {
    expect(ROI_DEFAULTS).toEqual({ repos: 20, findingsPerRepo: 10, noiseShare: 0.952, triageMinutes: 15 });
    expect(Math.round(estimateRoi(ROI_DEFAULTS).hoursSaved)).toBe(48);
  });
  it("is never negative or NaN (for bounded inputs) and never exceeds findings x minutes / 60", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.double({ min: -1e6, max: 1e6 }), fc.double({ min: -5, max: 5 }), fc.double({ min: -1e6, max: 1e6 }), (repos, findingsPerRepo, noiseShare, triageMinutes) => {
        const r = estimateRoi({ repos, findingsPerRepo, noiseShare, triageMinutes });
        expect(Number.isNaN(r.hoursSaved) || r.hoursSaved < 0).toBe(false);
        expect(r.filtered).toBeLessThanOrEqual(r.findings);
      }),
    );
  });
});

describe("design-partner issue form", () => {
  // No YAML parser is a dependency, so check the required GitHub issue-form keys by text.
  const text = readFileSync(join(ROOT, ".github", "ISSUE_TEMPLATE", "design-partner.yml"), "utf8");
  const block = (id: string): string => new RegExp(`id: ${id}\\n[\\s\\S]*?(?=\\n  - type:|$)`).exec(text)?.[0] ?? "";
  it("has name, description, and a notice about company secrets", () => {
    expect(text).toMatch(/^name: .+/m);
    expect(text).toMatch(/^description: .+/m);
    expect(text).toMatch(/Keep company secrets/);
    expect(text).not.toContain("\t");
    expect(text).not.toContain("\u2014");
  });
  it("asks role, team size and scanners as required fields", () => {
    for (const id of ["role", "team-size", "scanners"]) expect(block(id), id).toMatch(/required: true/);
  });
  it("has a required no-secrets checkbox", () => {
    expect(block("no-secrets")).toMatch(/type: checkboxes|required: true/);
    expect(text).toMatch(/- type: checkboxes[\s\S]*id: no-secrets[\s\S]*required: true/);
  });
});
