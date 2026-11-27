import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// #343: dispose() must release the WebGL context, not only the three.js resources.
describe("WebGL contexts are released on dispose", () => {
  for (const f of ["web/theatre/creature3d.js", "web/theatre/stage.js"]) {
    it(f, () => {
      const s = readFileSync(f, "utf8");
      expect(s).toMatch(/renderer\.dispose\(\);\s*\n\s*\/\/[^\n]*\n\s*renderer\.forceContextLoss\(\);/);
    });
  }
});
