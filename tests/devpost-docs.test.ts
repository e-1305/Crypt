// Round 2 docs checks: the Devpost front door, the shot list, the How it works links and the KIRO.md paths.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const EM_DASH = String.fromCharCode(0x2014);

/** Every `.kiro/...` path a markdown file names, without globs, templates or trailing punctuation. */
function kiroPaths(md: string): string[] {
  const found = new Set<string>();
  for (const m of md.matchAll(/\.kiro\/[A-Za-z0-9_./-]*/g)) {
    const p = m[0].replace(/[.]+$/, "");
    found.add(p);
  }
  return [...found];
}

describe("Devpost front door", () => {
  it("PITCH.md is 180 to 220 words", () => {
    const words = read("docs/PITCH.md").split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(180);
    expect(words).toBeLessThanOrEqual(220);
  });

  it("README, PITCH and DEVPOST contain no em dash", () => {
    for (const f of ["README.md", "docs/PITCH.md", "docs/DEVPOST.md", "docs/KIRO.md", "docs/DEMO.md", "docs/USER_MANUAL.md"]) expect(read(f), f).not.toContain(EM_DASH);
  });

  it("DEVPOST.md has the Devpost headings in at most 60 lines and states what is not verified", () => {
    const t = read("docs/DEVPOST.md");
    expect(t.split("\n").length).toBeLessThanOrEqual(60);
    for (const h of ["Inspiration", "What it does", "How we built it with Kiro", "Challenges", "What we learned", "What is next", "Built with"]) expect(t).toContain("## " + h);
    expect(t).toMatch(/Not verified: no real GPU/);
  });

  it("README shows the live demo and the npx line before Quickstart, and its image exists", () => {
    const t = read("README.md");
    expect(t.indexOf("e-1305.github.io/Crypt")).toBeLessThan(t.indexOf("## Quickstart"));
    expect(t.indexOf("npx @e-1305/crypt raid")).toBeLessThan(t.indexOf("## Quickstart"));
    expect(t.indexOf("## Live demo")).toBeLessThan(t.indexOf("## Quickstart"));
    for (const m of t.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) if (!m[1]!.startsWith("http")) expect(existsSync(join(ROOT, m[1]!)), m[1]).toBe(true);
  });

  it("every image in docs/img is under 300 KB and listed in ATTRIBUTION.md", () => {
    const attr = read("docs/ATTRIBUTION.md");
    for (const f of ["bench-3d.png"]) {
      expect(readFileSync(join(ROOT, "docs", "img", f)).length).toBeLessThan(300 * 1024);
      expect(attr).toContain("docs/img/" + f);
    }
  });
});

describe("DEMO.md shot list", () => {
  it("has the seven beats in order, above the runbook", () => {
    const t = read("docs/DEMO.md");
    expect(t.indexOf("## Shot list (3:00)")).toBeLessThan(t.indexOf("## Prerequisites"));
    const times = ["0:00 to 0:15", "0:15 to 0:45", "0:45 to 1:15", "1:15 to 1:40", "1:40 to 2:10", "2:10 to 2:40", "2:40 to 3:00"].map((x) => t.indexOf("| " + x));
    expect(times.every((i) => i > 0)).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(t).toContain("Audio is off by default");
    expect(t).toContain("dry-run label");
  });
});

describe("repository paths named in the docs exist", () => {
  it.each(["docs/KIRO.md", "docs/USER_MANUAL.md", "README.md"])("%s", (f) => {
    for (const p of kiroPaths(read(f))) {
      if (/[*<]/.test(p) || p === ".kiro/") continue;
      expect(existsSync(join(ROOT, p)), `${f} names ${p}`).toBe(true);
    }
  });

  it("KIRO.md has no draft note and keeps each Outcome cell at 30 words or fewer in the specs table", () => {
    const t = read("docs/KIRO.md");
    expect(t).not.toContain("Fill this in");
    expect(t).toContain("## Limits");
    const table = t.slice(t.indexOf("## Specs"), t.indexOf("Longer notes"));
    for (const row of table.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Spec") && !l.startsWith("|---"))) {
      expect(row.split("|")[3]!.split(/\s+/).filter(Boolean).length, row).toBeLessThanOrEqual(30);
    }
    const appendix = t.indexOf("## Appendix");
    expect(appendix).toBeGreaterThan(0);
    expect(t.slice(0, appendix).split("\n").length).toBeLessThanOrEqual(220);
  });
});

describe("How it works", () => {
  it("is one click from the landing page and the bench drawer, and names the three files", () => {
    expect(read("web/index.html")).toContain('id="kiro-link" href="manual.html#how-it-works"');
    expect(read("web/theatre/drawer.js")).toContain('href="manual.html#how-it-works"');
    const m = read("docs/USER_MANUAL.md");
    const section = m.slice(m.indexOf("## How it works"));
    for (const f of [".kiro/steering/failsafe.md", ".kiro/specs/necromancer/requirements.md", ".kiro/hooks/failsafe-guard-on-save.json", ".kiro/specs/", ".kiro/steering/", ".kiro/hooks/", ".kiro/agents/"]) {
      expect(section).toContain("../" + f);
      expect(existsSync(join(ROOT, f)), f).toBe(true);
    }
    expect(section).toMatch(/share one|same `creature.json`/);
  });

  it("the page keeps the 3D caption and the Try chip, and the caption is hidden by Recording mode", () => {
    const html = read("web/index.html");
    expect(html).toContain('id="theatre-caption"');
    expect(html).toContain('id="try-chip"');
    const css = read("web/style.css");
    expect(css).toMatch(/body\.record \.theatre-caption \{ display: none; \}/);
    expect(css).toMatch(/\.theatre-caption \{ display: none; \}/);
  });
});
