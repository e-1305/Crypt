// DOM glue of the page (web/raid.js, web/app.js) run against a minimal fake DOM. The glue is plain browser JS, so the
// test compiles web/ into a temp directory (never touching web/js, which other tests rebuild) and imports it from there.
// web/heal.js (live and simulated heal events) is covered here too; its pure rules are in tests/heal-events.test.ts.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { numRuns } from "./runs.js";

let glkOf: Record<string, (...a: unknown[]) => unknown> | null = null;
const ROOT = resolve(import.meta.dirname, "..");
vi.setConfig({ testTimeout: 120_000 });

class El {
  textContent = "";
  hidden = false;
  disabled = false;
  value = "";
  href = "";
  className = "";
  scrollTop = 0;
  scrollHeight = 0;
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  children: El[] = [];
  handlers: Record<string, ((ev: unknown) => void)[]> = {};
  classes = new Set<string>();
  classList = {
    toggle: (c: string, on?: boolean) => { if (on ?? !this.classes.has(c)) this.classes.add(c); else this.classes.delete(c); },
    contains: (c: string) => this.classes.has(c),
    remove: (c: string) => { this.classes.delete(c); },
  };
  addEventListener(t: string, f: (ev: unknown) => void) { (this.handlers[t] ||= []).push(f); }
  fire(t: string, ev: Record<string, unknown> = {}) { for (const f of this.handlers[t] || []) f({ preventDefault() {}, ...ev }); }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  appendChild(c: El) { this.children.push(c); return c; }
  remove() {}
  click() { this.fire("click"); }
  focus() {}
}

let els: Map<string, El>;
const el = (id: string) => { let e = els.get(id); if (!e) els.set(id, (e = new El())); return e; };

let tmp = "";
let files: Record<string, string> = {};
const load = async (name: string) => import(/* @vite-ignore */ pathToFileURL(join(tmp, name)).href + "?v=" + Math.random());

const dispatched: { detail: Record<string, unknown> }[] = [];
function fakeDom(search = "") {
  els = new Map();
  dispatched.length = 0;
  const mem = new Map<string, string>();
  const body = new El();
  Object.assign(globalThis, {
    document: {
      getElementById: (id: string) => el(id),
      createElement: () => new El(),
      createTextNode: (t: string) => Object.assign(new El(), { textContent: t }),
      body,
      documentElement: new El(),
      dispatched,
      dispatchEvent: (e: unknown) => void dispatched.push(e as { detail: Record<string, unknown> }),
      addEventListener() {},
    },
    CustomEvent: class { constructor(public type: string, public init: { detail: Record<string, unknown> }) {} get detail() { return this.init.detail; } },
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) },
    location: { search },
    window: { matchMedia: () => ({ matches: false }), ZVM: class {
      prepare(_s: unknown, o: { Glk: Record<string, (...a: unknown[]) => unknown> }) { glkOf = o.Glk; }
      start() { glkOf?.glk_set_window(glkOf.glk_window_open(null, 0, 0, 3)); }
      resume() {}
    } },
    fetch: async (url: string) => {
      const body = files[url];
      return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => JSON.parse(body), arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    },
  });
  return { mem, body };
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "crypt-glue-"));
  cpSync(join(ROOT, "web", "theatre"), join(tmp, "theatre"), { recursive: true });
  cpSync(join(ROOT, "web", "card"), join(tmp, "card"), { recursive: true });
  for (const f of ["app.js", "raid.js", "heal.js", "onboarding.js", "copy.js", "live-exhume.js", "import.js"]) cpSync(join(ROOT, "web", f), join(tmp, f));
  writeFileSync(join(tmp, "package.json"), '{"type":"module"}');
  const r = spawnSync("npx", ["tsc", "-p", "tsconfig.web.json", "--outDir", join(tmp, "js")], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
}, 120_000);
// Raids started by a test keep a setInterval alive; stop them so a stale tick cannot write into the next test's document.
const intervals = new Set<ReturnType<typeof setInterval>>();
const realSetInterval = globalThis.setInterval;
beforeAll(() => {
  globalThis.setInterval = ((...a: Parameters<typeof setInterval>) => {
    const id = realSetInterval(...a);
    intervals.add(id);
    return id;
  }) as typeof setInterval;
});
afterEach(() => {
  for (const id of intervals) clearInterval(id);
  intervals.clear();
});
afterAll(() => { globalThis.setInterval = realSetInterval; });
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const RAID_MS_TEST = 15 * 60_000 + 1000;
const limbs = (healed: boolean) => [
  { ecosystem: "npm", name: "jquery", version: "1.0.0", state: healed ? "Healthy" : "Rotting", healed, spawned: true, epss: 0.5, kev: false, healedBy: "Ada" },
  { ecosystem: "npm", name: "lodash", version: "4.0.0", state: healed ? "Healthy" : "Possessed", healed, spawned: true, epss: 0.2, kev: true },
];

describe("web/raid.js", () => {
  let clock = 1_000_000;
  const mem = () => new Map<string, unknown>();
  const store = (m: Map<string, unknown>) => ({ get: (k: string) => m.get(k) ?? null, set: (k: string, v: unknown) => void m.set(k, v) });
  beforeEach(() => { fakeDom(); clock = 1_000_000; });

  async function start() {
    const { initRaid } = await load("raid.js");
    const said: string[] = [];
    const running: boolean[] = [];
    const m = mem();
    const raid = initRaid({ store: store(m), announce: (t: string) => said.push(t), onRunning: (b: boolean) => running.push(b), now: () => clock });
    return { raid, said, running, m };
  }

  it("counts nights from the shared team.scanStart, else from this browser's first visit", async () => {
    const DAY = 86_400_000;
    const healthy = [{ ecosystem: "npm", name: "ms", version: "2.1.3", state: "Healthy", healed: false, spawned: true, epss: 0, kev: false }];
    const a = await start();
    clock += 100 * DAY;
    a.raid.setLimbs(healthy, "acme/app");
    expect(el("raid-nights").textContent).toBe("Nights Without Possession (counted from this browser's first visit): 100");
    for (const bad of [{}, { scanStart: "x" }, { scanStart: NaN }, { scanStart: -5 }, { scanStart: clock + DAY }, null]) {
      a.raid.setLimbs(healthy, "acme/app", bad);
      expect(el("raid-nights").textContent).toContain("this browser's first visit): 100");
    }
    a.raid.setLimbs(healthy, "acme/app", { scanStart: clock - 40 * DAY });
    expect(el("raid-nights").textContent).toBe("Nights Without Possession (counted from the team's first scan): 40");
  });

  it("shows possession pressure as text and a progress bar without touching the score", async () => {
    vi.useFakeTimers();
    try {
      const { raid, said } = await start();
      raid.setLimbs(limbs(false), "acme/app");
      expect(el("raid-pressure-text").textContent).toBe("Possession spread: 0 percent. Heal the KEV limbs first.");
      raid.start();
      const score = el("raid-score").textContent;
      clock += 5 * 60_000;
      vi.advanceTimersByTime(250);
      expect(el("raid-pressure").attrs["aria-valuenow"]).not.toBe("0");
      expect(el("raid-warning").hidden).toBe(false);
      expect(el("raid-warning").textContent).toContain("10 minutes left");
      expect(said.filter((s) => s.includes("10 minutes left"))).toHaveLength(1);
      expect(el("raid-score").textContent).toBe(score);
    } finally { vi.useRealTimers(); }
  });

  it("shows the ready state, then runs, warns at one minute and ends with a card", async () => {
    vi.useFakeTimers();
    try {
      const { raid, said, running } = await start();
      expect(el("raid-timer").textContent).toBe("15:00");
      expect(el("raid-download").hidden).toBe(true);
      raid.setLimbs(limbs(false), "acme/app");
      raid.start();
      expect(running).toEqual([true]);
      expect(el("raid-start").disabled).toBe(true);
      expect(document.documentElement.dataset.raid).toBe("running");
      // A limb heals during the raid.
      raid.setLimbs(limbs(true), "acme/app");
      clock += 14 * 60_000;
      vi.advanceTimersByTime(250);
      expect(said.some((s) => s.includes("One minute left"))).toBe(true);
      clock += 60_000;
      vi.advanceTimersByTime(250);
      expect(running).toEqual([true, false]);
      expect(document.documentElement.dataset.raid).toBe("done");
      expect(el("raid-timer").textContent).toBe("00:00");
      expect(el("raid-download").hidden).toBe(false);
      expect(el("raid-card").textContent).toContain("Limbs healed: 2");
      expect(said.at(-1)).toContain("Raid complete. 2 limbs healed.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a second start while running", async () => {
    const { raid, running } = await start();
    raid.start();
    raid.start();
    expect(running).toEqual([true]);
    el("raid-start").click();
    expect(running).toEqual([true]);
  });

  it("shows one team score, a rank and praise by limb, with no per-person figures", async () => {
    const { raid } = await start();
    raid.setLimbs(limbs(false), "acme/app");
    raid.setLimbs(limbs(true), "acme/app");
    expect(el("raid-score").textContent).toBe("Team risk removed: 1.10");
    expect(el("raid-rank").textContent).toBe("Rank: Apprentice");
    expect(el("raid-nights").textContent).toMatch(/^Nights Without Possession.*: \d+$/);
    expect(el("raid-praise").textContent).toBe("jquery healed by Ada");
  });

  it("remembers risk of limbs seen sick, so a limb that reraise turned Healthy still counts", async () => {
    const { raid, m } = await start();
    raid.setLimbs(limbs(false), "acme/app");
    expect((m.get("crypt.risk") as Record<string, unknown>)["npm:lodash"]).toEqual({ epss: 0.2, kev: true });
    raid.setLimbs(limbs(false).map((l) => ({ ...l, state: "Healthy", healed: true })), "acme/app");
    expect(el("raid-score").textContent).toBe("Team risk removed: 1.10");
  });

  it("game feel: vitals, combo, boss, trophies and grade are all plain text in the readout", async () => {
    const { raid, said } = await start();
    raid.setLimbs(limbs(false), "acme/app");
    expect(el("raid-vitals").textContent).toBe("Creature health 0 of 100. Heartbeat 160 beats per minute.");
    expect(el("raid-health").attrs["aria-valuenow"]).toBe("0");
    expect(el("raid-next").textContent).toBe("Next rank: Surgeon in 3 heals.");
    expect(el("raid-boss").textContent).toBe("Boss: lodash.");
    expect(el("raid-boss").hidden).toBe(false);
    expect(el("raid-combo").textContent).toMatch(/^Combo: none/);
    raid.start();
    expect(said.at(-1)).toContain("A boss stirs: lodash");
    raid.setLimbs(limbs(true), "acme/app");
    expect(el("raid-vitals").textContent).toBe("Creature health 100 of 100. Heartbeat 50 beats per minute.");
    expect(el("raid-combo").textContent).toBe("Combo x1.5, chain of 2. Style bonus +0.55.");
    expect(el("raid-boss").textContent).toBe("Boss slain: lodash.");
    expect(el("raid-pop").textContent).toMatch(/^\+\d\.\d\d risk removed/);
    expect(el("raid-shelf").textContent).toContain("First Blood");
    expect(el("raid-trophies").children.length).toBe(6);
    expect(said.some((s) => s.startsWith("Boss slain: lodash."))).toBe(true);
    expect(el("raid-score").textContent).toBe("Team risk removed: 1.10");
  });

  it("game feel: the card carries a grade and trophies and no person", async () => {
    vi.useFakeTimers();
    try {
      const { raid } = await start();
      raid.setLimbs(limbs(false), "acme/app");
      raid.start();
      raid.setLimbs(limbs(true), "acme/app");
      clock += RAID_MS_TEST;
      vi.advanceTimersByTime(250);
      expect(el("raid-grade").textContent).toMatch(/^Grade: [SABCD]$/);
      expect(el("raid-card").textContent).toMatch(/Grade: [SABCD]\. Trophies: First Blood/);
      expect(el("raid-card").textContent).not.toContain("Ada");
    } finally {
      vi.useRealTimers();
    }
  });

  it("game feel: reduced motion skips the effect classes and still shows the counter", async () => {
    Object.assign(window, { matchMedia: () => ({ matches: true }) });
    const { raid } = await start();
    raid.setLimbs(limbs(false), "acme/app");
    raid.setLimbs(limbs(true), "acme/app");
    expect((document.body as unknown as { classes: Set<string> }).classes.size).toBe(0);
    expect(el("raid-counter").textContent).toBe("1.10");
  });

  it("property: any limb list renders without throwing and the score is finite and never negative", async () => {
    const { raid } = await start();
    const limb = fc.record({ ecosystem: fc.string(), name: fc.string(), state: fc.constantFrom("Rotting", "Possessed", "Healthy", "Healed", 3, null), epss: fc.oneof(fc.double(), fc.string()), kev: fc.anything() }, { requiredKeys: [] });
    fc.assert(fc.property(fc.array(limb, { maxLength: 8 }), (list) => {
      raid.setLimbs(list as never, "x");
      const n = Number(el("raid-score").textContent.replace("Team risk removed: ", ""));
      return Number.isFinite(n) && n >= 0;
    }), { numRuns: numRuns(100) });
  });
});

describe("web/app.js", () => {
  const demo = JSON.stringify({ repo: "acme/app", limbs: limbs(false) });
  const flush = () => new Promise((r) => setTimeout(r, 20));

  it("draws the plate, the gallery and starts the story; the game owns RAID and the page starts the raid from its marker", async () => {
    fakeDom();
    files = {
      "game/index.json": JSON.stringify([{ slug: "axios__axios", repo: "axios/axios" }, { bad: 1 }]),
      "game/demo.json": demo,
      "game/demo.payloads.json": "{}",
      "game/demo.z8": "story",
    };
    await load("app.js");
    await flush();
    expect(el("plate").children.length).toBeGreaterThan(0);
    expect(el("plate-summary").textContent).toMatch(/^Limbs that spawn: /);
    expect(el("creature-name").textContent).toContain("(the demo creature)");
    expect(el("gallery-list").children).toHaveLength(1);
    expect(el("download").disabled).toBe(false);
    expect(el("cmd").disabled).toBe(false);
    expect(el("raid-score").textContent).toBe("Team risk removed: 0.00");

    el("cmd").value = "RAID";
    el("input-form").fire("submit");
    expect(el("cmd").value).toBe("");
    // The page no longer intercepts typed text: nothing starts until the story prints the marker.
    expect(document.documentElement.dataset.raid).not.toBe("running");
    // Typed lowercase text is not a marker either.
    glkOf!.glk_put_jstring("[[CRYPT raid]]\n");
    expect(document.documentElement.dataset.raid).not.toBe("running");
    glkOf!.glk_put_jstring("[[CRYPT RAID]]\nThe raid begins. Fifteen minutes. Heal what you can.\n");
    expect(document.documentElement.dataset.raid).toBe("running");
    expect(el("transcript").children.map((c) => c.textContent)).toContain("The raid begins. Fifteen minutes. Heal what you can.");
    el("raid-start").disabled = false;
  });

  it("runs the tutorial: only suggests commands, finishes steps from accepted verbs and never grafts by itself", async () => {
    fakeDom();
    files = { "game/index.json": "[]", "game/demo.json": demo, "game/demo.payloads.json": JSON.stringify({ JQUERY: { title: "x" } }), "game/demo.z8": "story" };
    await load("app.js");
    await flush();
    expect(el("daily-banner").textContent).toMatch(/^Today in the crypt: /);
    expect(el("tutorial").hidden).toBe(false);
    expect(el("tutorial-progress").textContent).toBe("Getting started, step 1 of 3");
    expect(el("tutorial-command").textContent).toBe("");
    el("tutorial-next").click();
    expect(el("tutorial-command").textContent).toBe("Type: GRAFT JQUERY");
    expect(el("tutorial-step").textContent).toContain("yourself");
    // A verb the strip is not waiting for does not finish a step.
    glkOf!.glk_put_jstring("[[CRYPT EXAMINE JQUERY]]\nA rotting limb.\n");
    expect(el("tutorial-command").textContent).toBe("Type: GRAFT JQUERY");
    // No tutorial code path submits input: the command row is still empty and the payload stays unread.
    expect(el("cmd").value).toBe("");
    glkOf!.glk_put_jstring("[[CRYPT GRAFT JQUERY]]\n");
    // The last step finishes on a page event: the simulated CI going green.
    expect(el("tutorial-step").textContent).toContain("Simulate CI: green");
    expect(el("tutorial-next").hidden).toBe(true);
    el("sim-green").click();
    await new Promise((r) => setTimeout(r, 1400));
    expect(el("tutorial").hidden).toBe(true);
  });

  it("keeps Skip and Hide for good across reloads", async () => {
    const { mem } = fakeDom();
    files = { "game/index.json": "[]", "game/demo.json": demo, "game/demo.z8": "story" };
    await load("app.js");
    await flush();
    el("tutorial-skip").click();
    expect(el("tutorial").hidden).toBe(true);
    expect(mem.get("crypt.tutorial.skipped")).toBe("true");
    fakeDom();
    (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } }).localStorage.setItem("crypt.tutorial.hidden", "true");
    await load("app.js");
    await flush();
    expect(el("tutorial").hidden).toBe(true);
    fakeDom();
    await load("app.js");
    await flush();
    el("tutorial-hide").click();
    expect(el("tutorial").hidden).toBe(true);
    expect((globalThis as unknown as { localStorage: { getItem(k: string): string | null } }).localStorage.getItem("crypt.tutorial.hidden")).toBe("true");
  });

  it("shows the idle hint only after 8 seconds without input, in the polite live region", async () => {
    vi.useFakeTimers();
    const { initOnboarding } = await load("onboarding.js");
    fakeDom();
    let t = 5_000_000;
    const m = new Map<string, unknown>();
    initOnboarding({ store: { get: (k: string) => m.get(k) ?? null, set: (k: string, v: unknown) => void m.set(k, v) }, announce() {}, now: () => t }).setLimb("JQUERY");
    expect(el("tutorial-hint").textContent).toBe("");
    el("tutorial-next").click();
    t += 7_999;
    vi.advanceTimersByTime(1000);
    expect(el("tutorial-hint").textContent).toBe("");
    el("cmd").fire("input"); // typing restarts the idle clock
    t += 7_999;
    vi.advanceTimersByTime(1000);
    expect(el("tutorial-hint").textContent).toBe("");
    t += 1;
    vi.advanceTimersByTime(1000);
    expect(el("tutorial-hint").textContent).toBe("Hint: type GRAFT JQUERY and press Enter.");
    vi.useRealTimers();
  });

  it("moves the strip on after Simulate CI: green even when earlier steps were skipped", async () => {
    const { initOnboarding } = await load("onboarding.js");
    fakeDom();
    const m = new Map<string, unknown>();
    const said: string[] = [];
    const ob = initOnboarding({ store: { get: (k: string) => m.get(k) ?? null, set: (k: string, v: unknown) => void m.set(k, v) }, announce: (t: string) => said.push(t), now: () => 1 });
    ob.setLimb("JQUERY");
    expect(el("tutorial-progress").textContent).toBe("Getting started, step 1 of 3");
    ob.signal("ci-green");
    expect(el("tutorial").hidden).toBe(true);
    expect(said.at(-1)).toContain("Getting started complete");
    // A signal for a step that is already done changes nothing.
    ob.signal("ci-green");
    expect(el("tutorial").hidden).toBe(true);
  });

  it("the Try chip only fills the command box and announces it", async () => {
    fakeDom();
    files = { "game/index.json": "[]", "game/demo.json": demo, "game/demo.payloads.json": JSON.stringify({ JQUERY: { title: "t" } }), "game/demo.z8": "story" };
    await load("app.js");
    await flush();
    const chip = el("try-chip");
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe("Try: GRAFT JQUERY");
    const sent: string[] = [];
    el("input-form").addEventListener("submit", () => sent.push(el("cmd").value));
    chip.click();
    expect(el("cmd").value).toBe("GRAFT JQUERY");
    expect(sent).toEqual([]); // nothing was submitted
    expect(el("payload").textContent).toBe("");
  });

  it("opens a gallery creature only when its slug is listed", async () => {
    fakeDom("?creature=axios__axios");
    files = { "game/index.json": JSON.stringify([{ slug: "axios__axios", repo: "axios/axios" }]), "game/axios__axios.json": demo, "game/axios__axios.z8": "story" };
    await load("app.js");
    await flush();
    expect(el("creature-name").textContent).toContain("(acme/app)");

    fakeDom("?creature=../../etc/passwd");
    files = { "game/index.json": "[]", "game/demo.json": demo, "game/demo.z8": "story" };
    await load("app.js");
    await flush();
    expect(el("creature-name").textContent).toContain("(the demo creature)");
  });

  it("says so when the plate or the story cannot be loaded", async () => {
    fakeDom();
    files = {};
    await load("app.js");
    await flush();
    expect(el("plate-summary").textContent).toBe("The plate could not be loaded. Reload the page to try again.");
    expect(el("transcript").children.map((c) => c.textContent).join("\n")).toContain("Story file could not be loaded");
  });

  it("toggles and remembers high contrast", async () => {
    const { mem, body } = fakeDom();
    files = {};
    await load("app.js");
    el("hc-toggle").click();
    expect(body.classes.has("hc")).toBe(true);
    expect(el("hc-toggle").attrs["aria-pressed"]).toBe("true");
    expect(mem.get("crypt.hc")).toBe("true");
    await new Promise((r) => setTimeout(r, 80));
    expect(el("announcer").textContent).toBe("High-contrast reader mode on");
    el("hc-toggle").click();
    await new Promise((r) => setTimeout(r, 80));
    expect(el("announcer").textContent).toBe("High-contrast reader mode off");
  });
});

describe("web/heal.js", () => {
  const sick = [{ ecosystem: "npm", name: "jquery", version: "1.0.0", fixedIn: "3.5.0", state: "Rotting" }, { ecosystem: "npm", name: "ok", state: "Healthy" }];
  let lines: [string, string | undefined][];
  let said: string[];
  let redraws: unknown[][];
  let live: unknown[];

  async function make(search = "") {
    fakeDom(search);
    vi.useFakeTimers();
    lines = [];
    said = [];
    redraws = [];
    live = sick;
    const { initHeal } = await load("heal.js");
    const heal = initHeal({ addLine: (t: string, c?: string) => lines.push([t, c]), announce: (t: string) => said.push(t), getLimbs: () => live, redraw: (...a: unknown[]) => redraws.push(a) });
    return heal;
  }
  const kinds = () => dispatched.map((e) => e.detail.kind);

  it("a real heal event writes one line, announces, and emits the heal effect", async () => {
    try {
      const heal = await make();
      heal.real(["npm:jquery"]);
      expect(lines).toEqual([["The creature stirs. jquery is healed.", undefined]]);
      expect(said).toEqual(["Healed: jquery."]);
      expect(kinds()).toEqual(["heal"]);
    } finally { vi.useRealTimers(); }
  });

  it("a malformed real event changes nothing", async () => {
    try {
      const heal = await make();
      heal.real(["nonsense", "", "npm:"]);
      expect(lines).toEqual([]);
      expect(dispatched).toEqual([]);
      expect(heal.overlay(sick as never)).toEqual(sick);
    } finally { vi.useRealTimers(); }
  });

  it("simulate green: replays labelled steps, heals only the overlay and never the real state", async () => {
    try {
      const heal = await make();
      el("sim-green").click();
      expect(el("sim-label").hidden).toBe(false);
      expect(el("sim-label").textContent).toContain("SIMULATED CI");
      vi.advanceTimersByTime(5000);
      expect(lines.map((l) => l[0]).every((t) => t.startsWith("[SIMULATED CI]"))).toBe(true);
      expect(kinds()).toEqual(["heal"]);
      expect((heal.overlay(sick as never) as { state: string }[])[0].state).toBe("Healed");
      expect(sick[0].state).toBe("Rotting");
    } finally { vi.useRealTimers(); }
  });

  it("simulate red: convulses, rejects in the transcript and leaves the limb rotting", async () => {
    try {
      const heal = await make();
      el("sim-red").click();
      vi.advanceTimersByTime(5000);
      expect(kinds()).toEqual(["convulse"]);
      expect(lines.some(([, c]) => c === "reject")).toBe(true);
      expect((heal.overlay(sick as never) as { state: string }[])[0].state).toBe("Rotting");
    } finally { vi.useRealTimers(); }
  });

  it("with nothing sick, simulating says so and emits no effect", async () => {
    try {
      const heal = await make();
      live = [{ ecosystem: "npm", name: "ok", state: "Healthy" }];
      void heal;
      el("sim-green").click();
      vi.advanceTimersByTime(5000);
      expect(el("sim-label").textContent).toBe("SIMULATED CI: nothing sick to heal.");
      expect(dispatched).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it("?simulate=red starts a replay, any other value does not", async () => {
    try {
      const a = await make("?simulate=red");
      a.start();
      vi.advanceTimersByTime(5000);
      expect(kinds()).toEqual(["convulse"]);
      const b = await make("?simulate=maybe");
      b.start();
      vi.advanceTimersByTime(5000);
      expect(dispatched).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
});

describe("web/index.html (G3)", () => {
  const html = readFileSync(join(ROOT, "web", "index.html"), "utf8");
  it("marks the hint as a polite live region and the pressure meter as a progressbar with a text twin", () => {
    expect(html).toMatch(/id="tutorial-hint"[^>]*aria-live="polite"/);
    expect(html).toMatch(/id="raid-pressure"[^>]*role="progressbar"/);
    expect(html).toContain('id="raid-pressure-text"');
    expect(html).not.toContain("\u2014");
  });
});
