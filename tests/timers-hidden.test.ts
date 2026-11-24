// #315: background timers do no work from a hidden tab, and the hint timer runs only while the strip is on.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read = (p: string) => readFileSync(resolve(import.meta.dirname, "..", p), "utf8");

describe("timers only while useful", () => {
  it("onboarding: the 1 s hint timer is created only by render when the strip is on, and skips hidden tabs", () => {
    const s = read("web/onboarding.js");
    expect(s.match(/setInterval\(/g)?.length).toBe(1);
    expect(s).toMatch(/if \(timer === 0\) timer = setInterval\(\(\) => \{ if \(!document\.hidden\) hint\(\); \}, 1000\);/);
    expect(s).toMatch(/if \(off\) \{[^}]*clearInterval\(timer\); timer = 0; return; \}/);
  });
  it("app: the plate poll runs only during a raid and skips hidden tabs", () => {
    expect(read("web/app.js")).toMatch(/pollTimer = on \? setInterval\(\(\) => \{ if \(!document\.hidden\) loadPlate\(\); \}, 5000\) : 0;/);
  });
  it("raid: the 250 ms redraw skips hidden tabs (the clock is wall time)", () => {
    expect(read("web/raid.js")).toMatch(/setInterval\(\(\) => \{ if \(!document\.hidden\) tick\(\); \}, 250\)/);
  });
});
