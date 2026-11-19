import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("submission text", () => {
  it("docs/DEVPOST.md has no TODO left (a placeholder must be named, e.g. VIDEO_URL_PENDING)", () => {
    const text = readFileSync(join(import.meta.dirname, "..", "docs", "DEVPOST.md"), "utf8");
    expect(text).not.toMatch(/\bTODO\b/);
  });
});
