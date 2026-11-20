import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper without types
import { checkBudget, staticImports, scriptSrcs } from "../scripts/ci/budget.mjs";

const budgets = { firstLoadJsBytes: 1000, fontBytesEach: 300, fontBytesTotal: 500 };
const js = [{ path: "app.js", bytes: 400 }, { path: "raid.js", bytes: 500 }];
const fonts = [{ path: "fonts/a.woff2", bytes: 200 }, { path: "fonts/b.woff2", bytes: 250 }];

describe("resource budget", () => {
  it("passes under budget", () => {
    const r = checkBudget(js, fonts, budgets);
    expect(r.ok).toBe(true);
    expect(r.totalJs).toBe(900);
  });
  it("fails when first-load JS is over budget", () => {
    const r = checkBudget([...js, { path: "x.js", bytes: 200 }], fonts, budgets);
    expect(r.ok).toBe(false);
    expect(r.failures.join()).toContain("first-load JS");
  });
  it("fails when three.js is in the first-load set", () => {
    const r = checkBudget([{ path: "vendor/three.module.min.js", bytes: 10 }], [], budgets);
    expect(r.ok).toBe(false);
    expect(r.failures.join()).toContain("lazy-loaded");
  });
  it("fails when the 3D stage is in the first-load set", () => {
    expect(checkBudget([{ path: "theatre/stage.js", bytes: 10 }], [], budgets).ok).toBe(false);
  });
  it("fails on non-woff2 or oversized fonts", () => {
    expect(checkBudget([], [{ path: "fonts/a.ttf", bytes: 10 }], budgets).ok).toBe(false);
    expect(checkBudget([], [{ path: "fonts/a.woff2", bytes: 400 }], budgets).ok).toBe(false);
  });
  it("ignores dynamic import() when scanning", () => {
    const src = 'import { a } from "./a.js";\nimport "./b.js";\nexport * from "./c.js";\nimport("./theatre/stage.js");\nimport x from "pkg";';
    expect(staticImports(src)).toEqual(["./a.js", "./b.js", "./c.js"]);
    expect(scriptSrcs('<script src="vendor/zvm.min.js"></script><script type="module" src="app.js"></script>')).toEqual(["vendor/zvm.min.js", "app.js"]);
  });
});
