// STRUCTURAL: reads web/style.css text. The rendered position of #cmd (<= 1700px at 390x844) is checked by scripts/ci/visual-qa.mjs.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dirname, "..", "web", "style.css"), "utf8");
const start = css.indexOf("/* R2: the first screen");
const phone = css.slice(start, css.indexOf("}\n", css.indexOf("#hc-toggle { order", start)));
const order = (sel: string) => {
  const m = phone.match(new RegExp(`(?:^|[\\s,])${sel.replace(/[.#]/g, "\\$&")}\\s*(?:,[^{]*)?\\{[^}]*order:\\s*(\\d+)`, "m"));
  expect(m, sel).not.toBeNull();
  return Number(m![1]);
};

describe("phone compact hero (below 900px)", () => {
  it("lists problem, Scan, Play, paste form, plate, game in that order", () => {
    const seq = ["#hero-problem", "#hero-scan", "#hero-play", ".paste", ".plate-pane", ".game"].map(order);
    expect([...seq].sort((a, b) => a - b)).toEqual(seq);
    expect(new Set(seq).size).toBe(seq.length);
  });

  it("moves the steps, what, proof lines, Watch, Bench and header links below the game", () => {
    const game = order(".game");
    for (const s of ["#hero-what", "#hero-steps", "#hero-watch", ".bench", ".views", "#hc-toggle", "#proof"]) expect(order(s), s).toBeGreaterThan(game);
  });

  it("is scoped to phones and leaves the hero visible parts in the DOM", () => {
    expect(css.slice(0, start)).toMatch(/@media \(max-width: 899px\) \{[^@]*$/);
    const html = readFileSync(join(import.meta.dirname, "..", "web", "index.html"), "utf8");
    for (const id of ["hero-problem", "hero-what", "hero-proof", "hero-steps", "hero-watch", "hero-play", "hero-scan"]) expect(html).toContain(`id="${id}"`);
  });
});
