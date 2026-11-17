// What a visitor and a keyboard user meet first on web/index.html. Static checks on the page source:
// the pitch, the install command and the Kiro line come before the game, controls are in a sensible order,
// and nothing steals focus or scroll position on load.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(import.meta.dirname, "..", "web", "index.html"), "utf8");
const at = (needle: string) => {
  const i = html.indexOf(needle);
  expect(i, needle).toBeGreaterThanOrEqual(0);
  return i;
};

describe("index.html above the fold", () => {
  it("puts the title, subtitle, pitch, install command and Kiro line before the game", () => {
    const order = ['<h1>CRYPT</h1>', 'class="subtitle"', 'id="pitch"', 'id="install-cmd"', 'id="install-copy"', 'id="kiro-link"', '<main class="crt">'].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("npx @e-1305/crypt raid &lt;path-or-github-url&gt;");
    expect(html).toContain("Built with Kiro");
    expect(html).toContain('href="manual.html#built-with-kiro"');
  });

  it("does not steal focus or scroll on load", () => {
    expect(html).not.toMatch(/\bautofocus\b/);
    expect(readFileSync(join(import.meta.dirname, "..", "web", "app.js"), "utf8")).toContain("cmd.focus({ preventScroll: true })");
  });

  it("keeps the recording button out of the heading and names what it does", () => {
    expect(html).toMatch(/id="record-toggle"[^>]*aria-label="Recording mode: [^"]+"/);
    expect(at('id="record-toggle"')).toBeLessThan(at("<header"));
    expect(readFileSync(join(import.meta.dirname, "..", "web", "style.css"), "utf8")).toMatch(/body:not\(\.theatre\) \.record-toggle \{ position: static/);
  });

  it("reaches the tutorial controls, manual link and contrast toggle by Tab before the game input", () => {
    const stops = ["tutorial-next", "tutorial-skip", "tutorial-hide", 'id="manual-link"', 'id="hc-toggle"', 'id="cmd"'].map((s) => at(s.startsWith("id=") ? s : `id="${s}"`));
    const firstThree = stops.slice(0, 3);
    expect(firstThree.every((i) => i < stops[5]!)).toBe(true);
    expect(stops[3]).toBeLessThan(stops[5]!);
    expect(stops[4]).toBeLessThan(stops[5]!);
    expect(html).not.toMatch(/tabindex="[1-9]/);
    expect(html).toContain('<a class="skip" href="#cmd">Skip to the game input</a>');
  });

  it("has a SEAL badge with an Unseal action and the legend for the counts", () => {
    expect(html).toMatch(/id="seal-badge"[^>]*role="status"[^>]*hidden>SEALED: no graft will run\./);
    expect(html).toContain('id="unseal"');
    expect(html).toContain("A limb spawns for a finding above the noise line");
    expect(html).toContain("Creature health falls with every unhealed limb, weighted by risk.");
  });

  it("uses no em dash in page copy", () => {
    expect(html).not.toContain("\u2014");
  });
});
