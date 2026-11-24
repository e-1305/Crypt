import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// #342: the transcript keeps the newest lines only, under the stress bound of 2000.
describe("transcript cap", () => {
  const s = readFileSync("web/app.js", "utf8");
  it("defines a cap at or under the stress bound", () => {
    const n = Number(/const TRANSCRIPT_MAX = (\d+);/.exec(s)?.[1]);
    expect(n).toBeGreaterThanOrEqual(200);
    expect(n).toBeLessThanOrEqual(2000);
  });
  it("trims the oldest line in addLine", () => {
    const body = s.slice(s.indexOf("function addLine("), s.indexOf("function logEvent("));
    expect(body).toMatch(/while \(transcript\.childElementCount > TRANSCRIPT_MAX\) transcript\.firstElementChild\.remove\(\);/);
  });
});
