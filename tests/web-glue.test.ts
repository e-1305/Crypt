// DOM glue of the page (web/raid.js, web/app.js) run against a minimal fake DOM. The glue is plain browser JS, so the
// test compiles web/ into a temp directory (never touching web/js, which other tests rebuild) and imports it from there.
// There is no web/heal.js: healing display lives in src/web/healed.ts (tests/healed.test.ts) and is wired by app.js.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { numRuns } from "./runs.js";

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

function fakeDom(search = "") {
  els = new Map();
  const mem = new Map<string, string>();
  const body = new El();
  Object.assign(globalThis, {
    document: {
      getElementById: (id: string) => el(id),
      createElement: () => new El(),
      createTextNode: (t: string) => Object.assign(new El(), { textContent: t }),
      body,
      documentElement: new El(),
    },
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) },
    location: { search },
    window: { ZVM: class { prepare() {} start() {} resume() {} } },
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
  for (const f of ["app.js", "raid.js"]) cpSync(join(ROOT, "web", f), join(tmp, f));
  writeFileSync(join(tmp, "package.json"), '{"type":"module"}');
  const r = spawnSync("npx", ["tsc", "-p", "tsconfig.web.json", "--outDir", join(tmp, "js")], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
}, 120_000);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

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

  it("shows the ready state, then runs, warns at one minute and ends with a card", async () => {
    vi.useFakeTimers();
    try {
      const { raid, said, running } = await start();
      expect(el("raid-timer").textContent).toBe("15:00");
      expect(el("raid-download").hidden).toBe(true);
      raid.setLimbs(limbs(false), "acme/app");
      expect(raid.handleCommand("  raid ")).toBe(true);
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

  it("ignores every other command and a second start while running", async () => {
    const { raid, running } = await start();
    for (const t of ["EXAMINE", "RAID NOW", "", "graft jquery"]) expect(raid.handleCommand(t)).toBe(false);
    expect(running).toEqual([]);
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
    expect(el("raid-nights").textContent).toMatch(/^Nights Without Possession: \d+$/);
    expect(el("raid-praise").textContent).toBe("jquery healed by Ada");
  });

  it("remembers risk of limbs seen sick, so a limb that reraise turned Healthy still counts", async () => {
    const { raid, m } = await start();
    raid.setLimbs(limbs(false), "acme/app");
    expect((m.get("crypt.risk") as Record<string, unknown>)["npm:lodash"]).toEqual({ epss: 0.2, kev: true });
    raid.setLimbs(limbs(false).map((l) => ({ ...l, state: "Healthy", healed: true })), "acme/app");
    expect(el("raid-score").textContent).toBe("Team risk removed: 1.10");
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

  it("draws the plate, the gallery and starts the story; RAID never reaches the game", async () => {
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
    expect(el("plate-summary").textContent).toMatch(/^Limbs: /);
    expect(el("creature-name").textContent).toContain("(the demo creature)");
    expect(el("gallery-list").children).toHaveLength(1);
    expect(el("download").disabled).toBe(false);
    expect(el("cmd").disabled).toBe(false);
    expect(el("raid-score").textContent).toBe("Team risk removed: 0.00");

    el("cmd").value = "RAID";
    el("input-form").fire("submit");
    const lines = el("transcript").children.map((c) => c.textContent);
    expect(lines).toEqual(["> RAID", "The raid begins. Fifteen minutes. Heal what you can."]);
    expect(el("cmd").value).toBe("");
    expect(document.documentElement.dataset.raid).toBe("running");
    el("raid-start").disabled = false;
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
  });
});
