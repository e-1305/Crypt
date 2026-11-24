// "Play the creature" must visibly do something: bring the command line into view, glow, and hold a first command.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const app = readFileSync(resolve(import.meta.dirname, "..", "web/app.js"), "utf8");
const css = readFileSync(resolve(import.meta.dirname, "..", "web/style.css"), "utf8");

describe("Play the creature button", () => {
  const handler = app.slice(app.indexOf('getElementById("hero-play")'), app.indexOf('getElementById("hero-scan")'));
  it("scrolls the command line into view, focuses it and prefills EXAMINE on the worst limb only when empty", () => {
    expect(handler).toMatch(/box\.scrollIntoView\(\{ block: "center"/);
    expect(handler).toMatch(/if \(!box\.value\.trim\(\) && firstLimb\) box\.value = "EXAMINE " \+ firstLimb;/);
    expect(handler).toMatch(/box\.focus\(/);
    expect(app).toMatch(/firstLimb = limb;/);
  });
  it("never runs a command by itself", () => {
    expect(handler).not.toMatch(/requestSubmit|\.submit\(|KeyboardEvent|new Event\("submit/);
  });
  it("glows once, not under reduced motion, and says what to do", () => {
    expect(css).toMatch(/prefers-reduced-motion: no-preference\) \{ \.cmd-pulse \{ animation: cmd-pulse/);
    expect(handler).toMatch(/announce\(/);
    expect(handler).toMatch(/classList\.remove\("cmd-pulse"\), 1500/);
  });
});

describe("Play the creature on the 3D bench", () => {
  const stage = readFileSync(resolve(import.meta.dirname, "..", "web/theatre/stage.js"), "utf8");
  it("hides the hero card and moves the camera in to the CRT", () => {
    expect(app).toMatch(/document\.body\.classList\.add\("playing"\)/);
    expect(app).toMatch(/new CustomEvent\("crypt:play"\)/);
    expect(css).toMatch(/body\.theatre\.playing \.hero \{ display: none; \}/);
    expect(stage).toMatch(/const onPlay = \(\) => \{ onFirstKey\(\); wake\(\); \};/);
    expect(stage).toMatch(/removeEventListener\("crypt:play", onPlay\)/);
  });
});
