// STRUCTURAL: reads web/manual.css and web/graveyard/graveyard.css text (issue #363).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(import.meta.dirname, "..", "web", f), "utf8");
const manual = read("manual.css");
const graveyard = read("graveyard/graveyard.css");

describe("phone overflow at 390px (#363)", () => {
  it("manual: code wraps anywhere, also inside pre on phones", () => {
    expect(manual).toMatch(/^code \{[^}]*overflow-wrap: anywhere/m);
    const phone = manual.slice(manual.indexOf("@media (max-width: 599px)"));
    expect(phone).toMatch(/pre code \{[^}]*overflow-wrap: anywhere/);
    expect(phone).toMatch(/pre \{[^}]*white-space: pre-wrap/);
  });

  it("manual: tables scroll inside .table-wrap and their cells wrap", () => {
    expect(manual).toMatch(/^\.table-wrap \{[^}]*overflow-x: auto/m);
    const phone = manual.slice(manual.indexOf("@media (max-width: 599px)"));
    expect(phone).toMatch(/th, td \{[^}]*overflow-wrap: anywhere/);
  });

  it("graveyard: #sr-table stays hidden in .sr-only and is bounded in width", () => {
    expect(readFileSync(join(import.meta.dirname, "..", "web", "graveyard", "graveyard.html"), "utf8")).toMatch(/<div class="sr-only"><table id="sr-table">/);
    expect(graveyard).toMatch(/\.sr-only > #sr-table \{[^}]*max-width: 100%[^}]*white-space: normal/);
  });
});
