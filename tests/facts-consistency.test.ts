// One source of truth: census and demo numbers in public docs must match docs/FACTS.md.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderManual } from "../src/site/manual.js";

const ROOT = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const SCANNED = [
  "README.md",
  "docs/DEVPOST.md",
  "docs/PITCH.md",
  "docs/PRFAQ.md",
  "docs/BUSINESS.md",
  "docs/WHO-PAYS.md",
  "web/index.html",
  "web/for-teams.html",
];

const facts = read("docs/FACTS.md");
const grab = (re: RegExp): string => {
  const m = facts.match(re);
  if (!m) throw new Error(`FACTS.md is missing a line matching ${re}`);
  return m[1];
};
const NOISE = grab(/(\d+(?:\.\d+)?)% of findings were exorcised as noise/);
const NO_OWNER = grab(/(\d+(?:\.\d+)?)% of dependencies/);
const DEPS = grab(/Dependencies \(limbs\): ([\d,]+)/);
const FINDINGS = grab(/Findings: (\d+)/);
const REPOS = grab(/Repositories scanned: (\d+)/);
const MONSTERS = grab(/Monsters: (\d+) spawned/);
const LODASH_TO = grab(/lodash 4\.17\.15 to ([\d.]+)/);
const REJECT_RUN = grab(/rejected \(run (\d+)\)/);

const num = (s: string) => Number(s.replace(/,/g, ""));
const lines = (text: string) => text.split("\n").map((l, i) => ({ l, n: i + 1 }));

describe("FACTS.md matches its sources", () => {
  it("census numbers equal docs/census/RESULTS.md", () => {
    const r = read("docs/census/RESULTS.md");
    expect(r).toContain(`${REPOS} popular`);
    expect(r).toContain(`${NOISE}%`);
    expect(r).toContain(`${NO_OWNER}%`);
    expect(r).toContain(DEPS);
    expect(r).toContain(`${FINDINGS} findings`);
    expect(r).toContain(`${MONSTERS} monsters`);
  });

  it("demo facts equal docs/PROOF.md", () => {
    const p = read("docs/PROOF.md");
    expect(p).toContain(`lodash 4.17.15 to ${LODASH_TO}`);
    expect(p).toContain(REJECT_RUN);
  });
});

describe("public docs agree with FACTS.md", () => {
  for (const file of SCANNED) {
    if (!existsSync(join(ROOT, file))) continue; // PRFAQ.md lands with #300
    const text = read(file);

    it(`${file}: percentages near the noise and owner figures are exact`, () => {
      const bad: string[] = [];
      for (const { l, n } of lines(text)) {
        for (const m of l.matchAll(/(\d+(?:\.\d+)?)\s?%/g)) {
          const v = Number(m[1]);
          if (v >= 93 && v <= 97 && m[1] !== NOISE) bad.push(`${file}:${n} ${m[0]} (expected ${NOISE}%)`);
          if (v >= 83 && v <= 86 && m[1] !== NO_OWNER) bad.push(`${file}:${n} ${m[0]} (expected ${NO_OWNER}%)`);
        }
        // Value attributes such as value="95.2" in the calculator.
        for (const m of l.matchAll(/id="roi-noise"[^>]*value="([\d.]+)"/g)) {
          if (m[1] !== NOISE) bad.push(`${file}:${n} roi-noise default ${m[1]} (expected ${NOISE})`);
        }
      }
      expect(bad).toEqual([]);
    });

    it(`${file}: census counts match`, () => {
      const bad: string[] = [];
      for (const { l, n } of lines(text)) {
        for (const m of l.matchAll(/\b(\d+) popular\b/g)) {
          if (m[1] !== REPOS) bad.push(`${file}:${n} "${m[0]}" (expected ${REPOS})`);
        }
        for (const m of l.matchAll(/\b(1[01],\d{3})\b/g)) {
          if (m[1] !== DEPS && /dependenc|limb/i.test(l)) bad.push(`${file}:${n} ${m[1]} (expected ${DEPS})`);
        }
        const isCensusLine = /census|popular|\b248\b/i.test(l);
        if (isCensusLine) {
          for (const m of l.matchAll(/\b(\d[\d,]*) findings\b/g)) {
            if (num(m[1]) >= 100 && num(m[1]) !== num(FINDINGS)) bad.push(`${file}:${n} "${m[0]}" (expected ${FINDINGS})`);
          }
          if (/\b248\b/.test(l)) {
            for (const m of l.matchAll(/\b(\d+) monsters\b/g)) {
              if (m[1] !== MONSTERS) bad.push(`${file}:${n} "${m[0]}" (expected ${MONSTERS})`);
            }
          }
        }
        if (/lodash 4\.17\.15 to \d/.test(l) && !l.includes(`lodash 4.17.15 to ${LODASH_TO}`)) {
          bad.push(`${file}:${n} lodash target differs (expected ${LODASH_TO})`);
        }
      }
      expect(bad).toEqual([]);
    });
  }

  it("the check itself catches a drifted number", () => {
    const drifted = "95.0% of findings were noise";
    const hit = [...drifted.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].some((m) => Number(m[1]) >= 93 && Number(m[1]) <= 97 && m[1] !== NOISE);
    expect(hit).toBe(true);
  });
});

const COMPETITORS_URL = "https://github.com/e-1305/Crypt/blob/main/docs/COMPETITORS.md";
const manualHtml = renderManual(read("docs/USER_MANUAL.md"), {
  sourcePath: "docs/USER_MANUAL.md",
  repoBlobBase: "https://github.com/e-1305/Crypt/blob/main/",
  repoHas: (p: string) => existsSync(join(ROOT, p)),
  siteHas: () => false,
  siteBase: "https://e-1305.github.io/Crypt/",
});
const plain = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const PAGES: Record<string, string> = {
  "web/for-teams.html": plain(read("web/for-teams.html")),
  "web/manual.html (rendered)": plain(manualHtml),
  "docs/USER_MANUAL.md": read("docs/USER_MANUAL.md"),
};

describe("for-teams and manual positioning matches FACTS.md", () => {
  const teams = read("web/for-teams.html");
  it("FACTS.md states the positioning the pages repeat", () => {
    expect(facts).toMatch(/Dependabot/);
    expect(facts).toMatch(/Socket/);
  });
  it("for-teams links COMPETITORS.md on GitHub and labels pricing a hypothesis", () => {
    expect(teams).toContain(`href="${COMPETITORS_URL}"`);
    expect(teams).toMatch(/id="pricing-label">HYPOTHESIS</);
    expect(teams).toContain('id="link-business"');
    expect(PAGES["web/for-teams.html"]).toMatch(/No customers, no revenue/);
  });
  for (const [name, text] of Object.entries(PAGES)) {
    it(`${name}: says CRYPT complements Dependabot, Snyk and Socket`, () => {
      expect(text).toMatch(/complements Dependabot, Snyk and Socket/);
      expect(text).toMatch(/no malware detection and no function-level reachability/);
      expect(text).toMatch(/exploited first, a named owner, one fix PR, and a person merges/);
    });
    it(`${name}: makes no customer, replacement or detection claims`, () => {
      expect(text).not.toMatch(/trusted by|testimonial|customers (use|love|rely)|our customers|replaces? (Dependabot|Snyk|Socket)/i);
      expect(text).not.toMatch(/detects? malware|function-level reachability analysis/i);
    });
  }
  it("the rendered manual links COMPETITORS.md", () => {
    expect(manualHtml).toContain(COMPETITORS_URL);
  });
});
