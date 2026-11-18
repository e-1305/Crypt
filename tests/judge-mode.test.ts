// Judge mode (issue #86): the pure timeline, typing, skip, autoplay and once-per-browser rules in web/judge-mode.js.
// The module has no DOM work at import in Node, so it is imported straight from web/ (web/ has no TypeScript types).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { numRuns } from "./runs.js";

const ROOT = resolve(import.meta.dirname, "..");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const J: any = await import(pathToFileURL(resolve(ROOT, "web/judge-mode.js")).href);

describe("timeline", () => {
  const tl = J.buildTimeline();
  it("has the six steps of the issue, contiguous, from 0 to 45 s", () => {
    expect(tl.map((s: { id: string }) => s.id)).toEqual(["title", "exhume", "examine", "graft", "ci", "handover"]);
    expect(tl.map((s: { startMs: number }) => s.startMs)).toEqual([0, 5000, 12000, 22000, 32000, 40000]);
    expect(tl[tl.length - 1].endMs).toBe(45000);
    for (let i = 1; i < tl.length; i++) expect(tl[i].startMs).toBe(tl[i - 1].endMs);
  });
  it("labels the CI step simulated and ends on the human-merges caption", () => {
    expect(tl[4].caption.toLowerCase()).toContain("simulated");
    expect(tl[5].caption).toBe("Real PRs, real CI, a human always merges. Your turn.");
  });
  it("stepAt finds the step for any time inside the demo and null outside", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 44999 }), (ms) => {
      const s = J.stepAt(tl, ms);
      expect(s.startMs <= ms && ms < s.endMs).toBe(true);
    }), { numRuns: numRuns(100) });
    expect(J.stepAt(tl, 45000)).toBeNull();
    expect(J.stepAt(tl, -1)).toBeNull();
  });
  it("keeps the title text equal to the B5 title card", () => {
    const src = readFileSync(resolve(ROOT, "src/theatre/polish.ts"), "utf8");
    expect(src).toContain('TITLE_CARD_TEXT = "CRYPT \\u2014 Don\'t abandon your creature."');
    expect(J.TITLE_TEXT).toBe("CRYPT \u2014 Don't abandon your creature.");
  });
});

describe("schedule and typing", () => {
  const counts = J.exhumeCounts([
    { state: "Possessed", spawned: true }, { state: "Rotting", spawned: true }, { state: "Rotting", spawned: false },
    { state: "Rotting", spawned: false }, { state: "Rotting", spawned: false }, { state: "Healthy" }, { state: "Healthy" },
  ]);
  const sched = J.buildSchedule(counts);
  it("counts 5 findings and 2 monsters for the demo shape", () => {
    expect(counts.text).toBe("5 findings \u2192 2 monsters");
    expect(J.exhumeCounts("nope")).toBeNull();
  });
  it("is sorted, inside 0 to 45 s, and each command is typed then submitted inside its own step", () => {
    const times = sched.map((a: { atMs: number }) => a.atMs);
    expect(times).toEqual([...times].sort((a: number, b: number) => a - b));
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBe(45000);
    const submits = sched.filter((a: { kind: string }) => a.kind === "submit");
    expect(submits).toHaveLength(2);
    expect(submits[0].atMs).toBeGreaterThan(12000);
    expect(submits[0].atMs).toBeLessThan(22000);
    expect(submits[1].atMs).toBeGreaterThan(22000);
    expect(submits[1].atMs).toBeLessThan(32000);
    const typed = sched.filter((a: { kind: string }) => a.kind === "type").map((a: { text: string }) => a.text);
    expect(typed).toContain("EXAMINE JQUERY");
    expect(typed).toContain("GRAFT JQUERY");
  });
  it("runs the simulated CI click after the graft and before the handover", () => {
    const sim = sched.find((a: { kind: string }) => a.kind === "sim-green");
    expect(sim.atMs).toBeGreaterThanOrEqual(32000);
    expect(sim.atMs).toBeLessThan(40000);
  });
  it("leaves the counter out when the counts are unknown", () => {
    expect(J.buildSchedule(null).some((a: { kind: string }) => a.kind === "counter")).toBe(false);
  });
  it("types at a human cadence: one delay per key, 90 to 350 ms, deterministic", () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 30 }), (text) => {
      const d = J.typingDelays(text);
      expect(d).toHaveLength(text.length);
      for (const x of d) { expect(x).toBeGreaterThanOrEqual(90); expect(x).toBeLessThanOrEqual(350); }
      expect(J.typingDelays(text)).toEqual(d);
    }), { numRuns: numRuns(100) });
  });
});

describe("skip logic", () => {
  it("skips on a click, Escape and any other key while running", () => {
    expect(J.skipDecision({ type: "click" }, true)).toBe(true);
    expect(J.skipDecision({ type: "keydown", key: "Escape" }, true)).toBe(true);
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 1 }), (key) => {
      expect(J.skipDecision({ type: "keydown", key }, true)).toBe(true);
    }), { numRuns: numRuns(100) });
  });
  it("ignores a lone modifier, unrelated events and anything when not running", () => {
    for (const key of ["Shift", "Control", "Alt", "Meta"]) expect(J.skipDecision({ type: "keydown", key }, true)).toBe(false);
    expect(J.skipDecision({ type: "mousemove" }, true)).toBe(false);
    expect(J.skipDecision({ type: "click" }, false)).toBe(false);
    expect(J.skipDecision(null, true)).toBe(false);
  });
});

describe("once per browser", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  it("remembers a play and reads it back", () => {
    const s = mem();
    expect(J.readPlayed(s)).toBe(false);
    expect(J.markPlayed(s)).toBe(true);
    expect(J.readPlayed(s)).toBe(true);
  });
  it("never throws when storage is blocked: not played, not remembered", () => {
    expect(J.readPlayed(broken)).toBe(false);
    expect(J.markPlayed(broken)).toBe(false);
    expect(J.readPlayed(null)).toBe(false);
  });
  it("autoplays on a first visit only", () => {
    expect(J.autoplayDecision({}).autoplay).toBe(true);
    const again = J.autoplayDecision({ played: true });
    expect(again).toMatchObject({ autoplay: false, replay: true });
  });
  it("does not autoplay under reduced motion, high contrast, automation or another creature, and shows the replay link", () => {
    for (const o of [{ reducedMotion: true }, { highContrast: true }, { automated: true }, { creatureParam: true }]) {
      expect(J.autoplayDecision(o)).toMatchObject({ autoplay: false, replay: true });
    }
  });
  it("lets ?judge=1 force a replay and ?judge=0 switch it off", () => {
    expect(J.autoplayDecision({ played: true, reducedMotion: true, automated: true, flag: "1" }).autoplay).toBe(true);
    expect(J.autoplayDecision({ flag: "0" }).autoplay).toBe(false);
  });
});

describe("page wiring", () => {
  const html = readFileSync(resolve(ROOT, "web/index.html"), "utf8");
  it("adds one script tag and one skip button to the page", () => {
    expect(html.match(/judge-mode\.js/g)).toHaveLength(1);
    expect(html.match(/id="judge-skip"/g)).toHaveLength(1);
  });
  it("hides skip and replay in recording mode and gates animation on reduced motion", () => {
    const css = readFileSync(resolve(ROOT, "web/style.css"), "utf8");
    expect(css).toContain("body.record .judge-skip");
    expect(css).toMatch(/prefers-reduced-motion: no-preference\) \{\s*\.plate\.judge-draw/);
  });
  it("has no em dash outside the required title text", () => {
    const src = readFileSync(resolve(ROOT, "web/judge-mode.js"), "utf8");
    expect(src.includes("\u2014")).toBe(false);
  });
});
