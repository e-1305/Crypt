// STRUCTURAL: reads web/index.html source. The rendered layout is checked by scripts/ci/visual-qa.mjs.
// First 60 seconds (issue #78): one primary button on the first screen, everything else in the Bench drawer, 3 tutorial steps.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tutorialSteps } from "../src/theatre/onboarding.js";

const read = (f: string) => readFileSync(join(import.meta.dirname, "..", f), "utf8");
const html = read("web/index.html");
const bench = html.slice(html.indexOf('<section id="bench"'), html.indexOf('<p id="seal-badge"'));
const before = html.slice(0, html.indexOf('<section id="bench"'));

describe("first screen", () => {
  it("has exactly one primary button, labelled Paste your GitHub repo", () => {
    expect(html.match(/class="primary"/g)).toHaveLength(1);
    expect(html).toMatch(/<button id="paste-open" class="primary"[^>]*>Paste your GitHub repo<\/button>/);
  });

  it("keeps raid, trophies, ranks, Simulated CI, gallery, sound and recording mode inside the Bench drawer", () => {
    for (const id of ["raid", "raid-start", "raid-trophies", "raid-rank", "sim", "sim-green", "gallery", "gallery-list", "sound-toggle", "record-toggle"]) {
      expect(bench, id).toContain(`id="${id}"`);
      expect(before, id).not.toContain(`id="${id}"`);
    }
  });

  it("makes the Bench a keyboard reachable button with aria-expanded and aria-controls", () => {
    expect(html).toMatch(/<button id="bench-toggle"[^>]*aria-expanded="false" aria-controls="bench-body">Bench<\/button>/);
    expect(html).toContain('id="bench-body"');
  });

  it("teaches in three steps and no suggested step is a prohibition", () => {
    expect(tutorialSteps).toHaveLength(3);
    for (const s of tutorialSteps) expect(s.text).not.toMatch(/—|\b(don't|do not|never)\b/i);
  });

  it("uses no em dash in the page, the paste module or the styles", () => {
    for (const f of ["web/index.html", "web/live-exhume.js", "web/style.css", "web/onboarding.js"]) expect(read(f), f).not.toContain("\u2014");
  });

  it("keeps network code in web/live-exhume.js and shows no git author", () => {
    const js = read("web/live-exhume.js");
    expect(js).not.toMatch(/author|committer|blame/i);
    expect(js).toContain("dryRunLabel");
    expect(js).toContain("npm projects only");
  });
});
