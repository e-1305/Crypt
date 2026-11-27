import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GHOST_FALLBACK, GHOST_LINES, withGhost } from "../src/web/ghost-lines.js";

describe("ghost lines on errors", () => {
  it("every error code has one short line, and the plain message follows it unchanged", () => {
    for (const [code, line] of Object.entries(GHOST_LINES)) {
      expect(line.length, code).toBeLessThanOrEqual(70);
      expect(line).not.toMatch(/you (did|broke)|your fault|stupid/i); // never blames the person
      expect(withGhost(code as keyof typeof GHOST_LINES, "Try again in a minute.")).toBe(`${line} Try again in a minute.`);
    }
    expect(withGhost(undefined, "Reload.")).toBe(`${GHOST_FALLBACK} Reload.`);
  });
  it("the paste box and the import box show the ghost line before the message", () => {
    expect(readFileSync("web/live-exhume.js", "utf8")).toMatch(/withGhost\(err instanceof LiveExhumeError \? err\.code : undefined/);
    expect(readFileSync("web/import.js", "utf8")).toMatch(/fail\(withGhost\(undefined,/);
  });
});
