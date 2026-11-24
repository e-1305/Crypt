// Stress harness (issue #339): load, edge cases and failure modes of the built site in headless Chromium.
// Same setup as scripts/ci/visual-qa.mjs: a static server over _site/ and playwright-core. Needs `npm run build:site` first.
// Six scenarios: 400-limb creature, gallery 3D open/dispose x20, 200 fast commands, paste box abuse, 4x CPU throttle, offline.
// Writes out/stress/report.json and exits 1 when any check fails. It measures and reports; it fixes nothing.
// Env: STRESS_HOLD_MS (default 60000) is how long the 400-limb creature is kept open before the heap is read.
// Dev and CI only, excluded from npm pack.
import { createRequire } from "node:module";
import { join, extname, resolve, sep } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import { syntheticCreature, syntheticLockfile, commandMix, claimsClean, median, percentile, mb, summarize } from "./lib.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const root = resolve(import.meta.dirname, "..", "..");
const site = join(root, "_site");
const outDir = join(root, "out", "stress");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain" };
const HOLD_MS = Number(process.env.STRESS_HOLD_MS) || 60000;

// Stated bounds. Each check below names the one it uses.
const BOUNDS = {
  heapGrowthMb: 30, // JS heap growth over 20 creature opens, after a GC
  frameRatio: 1.5, // 400-limb creature: median frame interval against the 7-limb demo in the same browser (the cap keeps cost flat)
  heap400Mb: 150, // JS heap after the 60 s hold
  freezeMs: 2000, // longest main-thread task allowed in the paste box
  restRafPerSec: 2, // idle budget from the visual QA harness
  transcriptLines: 2000, // transcript lines after 800 commands
  limbCap: 60, // MAX_LIMBS in src/theatre/caps.ts
};

const server = http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  const f = resolve(site, "." + (p.endsWith("/") ? p + "index.html" : p));
  if (!f.startsWith(site + sep) || !existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", types[extname(f)] || "application/octet-stream");
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

function launchOptions() {
  const o = { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox", "--enable-precise-memory-info", "--js-flags=--expose-gc"] };
  if (process.env.CHROMIUM_PATH) o.executablePath = process.env.CHROMIUM_PATH;
  return o;
}

const scenarios = [];
function scenario(id, title) {
  const s = { id, title, metrics: {}, checks: [], seconds: 0 };
  scenarios.push(s);
  s.check = (name, ok, detail) => { s.checks.push({ name, ok: !!ok, detail: detail === undefined ? "" : String(detail) }); console.log(`${ok ? "ok  " : "FAIL"} [${id}] ${name}${detail ? `: ${detail}` : ""}`); };
  return s;
}

/** Runs a scenario body; an exception becomes a failed check so the other scenarios still run. */
async function run(s, body) {
  const t0 = Date.now();
  try { await body(); } catch (e) { s.check("scenario ran to the end", false, String(e && e.message || e).split("\n")[0]); }
  s.seconds = Math.round((Date.now() - t0) / 100) / 10;
}

// Counters injected before load: animation frames and their cost, long tasks, WebGL contexts and their liveness.
const PROBES = () => {
  const w = window;
  w.__rafCount = 0; w.__rafTimes = []; w.__rafCost = []; w.__long = []; w.__ctx = []; w.__lost = 0;
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => raf((t) => {
    w.__rafCount++;
    if (w.__rafTimes.length < 20000 && w.__rafTimes[w.__rafTimes.length - 1] !== t) w.__rafTimes.push(t);
    const a = performance.now();
    try { return cb(t); } finally { if (w.__rafCost.length < 20000) w.__rafCost.push(performance.now() - a); }
  });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push(e.duration); }).observe({ entryTypes: ["longtask"] }); } catch { /* no longtask support */ }
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const gl = get.call(this, kind, ...rest);
    if (gl && /webgl/.test(String(kind))) {
      w.__ctx.push(new WeakRef(this));
      this.addEventListener("webglcontextlost", () => { w.__lost++; });
    }
    return gl;
  };
};

async function newPage(browser, { viewport = { width: 1440, height: 900 }, webdriver = true, reducedMotion } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(`console: ${m.text()}`); });
  const warnings = [];
  page.on("console", (m) => { if (m.type() === "warning") warnings.push(m.text()); });
  if (!webdriver) await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  await page.addInitScript(PROBES);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, errors, warnings };
}

/** JS heap in bytes after a forced GC, from the CDP. */
async function heap(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  return metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? NaN;
}

async function loaded(page, query = "?theatre=2d") {
  await page.goto(base + query);
  await page.waitForFunction(() => document.getElementById("plate")?.textContent.trim().length > 0 && !document.getElementById("cmd")?.disabled, null, { timeout: 60000 });
}

const clickToggle = (page) => page.evaluate(() => document.getElementById("creature3d-toggle")?.click());

// 1. A 400-limb synthetic creature in the Creature 3D view.
// The same view with the 7-limb demo creature, in the same browser, for a ratio that does not depend on the software renderer.
async function baseline7(browser) {
  const { ctx, page } = await newPage(browser);
  await loaded(page);
  await clickToggle(page);
  await page.waitForSelector("#creature3d-canvas", { timeout: 30000 });
  await page.locator("#creature3d-canvas").scrollIntoViewIfNeeded();
  const box = await page.locator("#creature3d-canvas").boundingBox();
  for (let i = 0; i < 10; i++) { if (box) await page.mouse.move(box.x + box.width / 2 + (i % 2 ? 20 : -20), box.y + box.height / 2); await page.waitForTimeout(1000); }
  const m = await page.evaluate(() => { const t = window.__rafTimes, d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); return { d, cost: window.__rafCost }; });
  await ctx.close();
  return { interval: median(m.d.slice(Math.floor(m.d.length / 2))), costP95: percentile(m.cost.slice(Math.floor(m.cost.length / 2)), 95) };
}

async function limbs400(browser) {
  const s = scenario("limbs-400", "3D creature with 400 limbs");
  await run(s, async () => {
    const base7 = await baseline7(browser);
    const { ctx, page, cdp, errors } = await newPage(browser);
    await cdp.send("Performance.enable");
    await page.route("**/game/demo.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(syntheticCreature(400)) }));
    await loaded(page);
    const before = await heap(cdp);
    await clickToggle(page);
    await page.waitForSelector("#creature3d-canvas", { timeout: 30000 });
    await page.locator("#creature3d-canvas").scrollIntoViewIfNeeded();
    const box = await page.locator("#creature3d-canvas").boundingBox();
    // Hovering keeps the loop awake (it sleeps 8 s after the last input). Move the pointer once a second for the whole hold.
    const t0 = Date.now();
    let tick = 0;
    while (Date.now() - t0 < HOLD_MS) {
      if (box) await page.mouse.move(box.x + box.width / 2 + (tick++ % 2 ? 20 : -20), box.y + box.height / 2);
      await page.waitForTimeout(1000);
    }
    const after = await heap(cdp);
    const m = await page.evaluate(() => {
      const t = window.__rafTimes, d = [];
      for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
      return { deltas: d, cost: window.__rafCost, label: document.getElementById("creature3d-canvas")?.getAttribute("aria-label") ?? "", legend: document.getElementById("creature3d-legend")?.textContent ?? "", mode: document.documentElement.dataset.creature3d ?? "", long: window.__long };
    });
    // The first frames pay for shader compile; the steady state is the second half.
    const steady = m.deltas.slice(Math.floor(m.deltas.length / 2));
    const cost = m.cost.slice(Math.floor(m.cost.length / 2));
    s.metrics = { holdSeconds: HOLD_MS / 1000, frames: m.deltas.length, baseline7FrameIntervalMedianMs: +base7.interval.toFixed(1), baseline7FrameCostP95Ms: +base7.costP95.toFixed(1), frameIntervalMedianMs: +median(steady).toFixed(1), frameIntervalP95Ms: +percentile(steady, 95).toFixed(1), frameCostMedianMs: +median(cost).toFixed(1), frameCostP95Ms: +percentile(cost, 95).toFixed(1), longestTaskMs: Math.round(Math.max(0, ...m.long)), heapBeforeMb: mb(before), heapAfterMb: mb(after), label: m.label };
    s.check("view mounted and kept running", m.mode === "live" || m.mode === "static", `data-creature3d=${m.mode}`);
    s.check("no page errors or console errors", errors.length === 0, errors.slice(0, 3).join(" / "));
    const shown = Number(/(\d+) limbs shown/.exec(m.label)?.[1] ?? NaN);
    s.check(`limb cap holds (${BOUNDS.limbCap} drawn)`, shown === BOUNDS.limbCap, `canvas label says ${shown} shown`);
    s.check("overflow is summed up as \"N more\"", /340 more/.test(m.legend), m.legend.slice(-40));
    s.check(`median frame interval within ${BOUNDS.frameRatio}x of the 7-limb demo`, s.metrics.frameIntervalMedianMs <= base7.interval * BOUNDS.frameRatio, `${s.metrics.frameIntervalMedianMs} ms against ${s.metrics.baseline7FrameIntervalMedianMs} ms`);
    s.check(`p95 frame cost within ${BOUNDS.frameRatio}x + 2 ms of the 7-limb demo`, s.metrics.frameCostP95Ms <= base7.costP95 * BOUNDS.frameRatio + 2, `${s.metrics.frameCostP95Ms} ms against ${s.metrics.baseline7FrameCostP95Ms} ms (software renderer, so the GPU cost is not in this number)`);
    s.check(`heap after ${HOLD_MS / 1000} s <= ${BOUNDS.heap400Mb} MB`, mb(after) <= BOUNDS.heap400Mb, `${mb(after)} MB (${mb(before)} MB before opening)`);
    await clickToggle(page);
    await page.waitForSelector("#creature3d-canvas", { state: "detached", timeout: 10000 }).catch(() => {});
    s.check("closing the view removes the canvas", (await page.$("#creature3d-canvas")) === null);
    await ctx.close();
  });
}

// 2. The gallery: every creature opened in 3D and disposed, one after another; then 20 open/dispose cycles on one page.
async function gallery(browser) {
  const s = scenario("gallery-20", "Gallery: 20 creatures opened in 3D and disposed");
  await run(s, async () => {
    const index = JSON.parse(readFileSync(join(site, "game", "index.json"), "utf8"));
    s.check("the gallery lists 20 creatures", index.length === 20, `${index.length} listed`);
    const { ctx, page, cdp, errors, warnings } = await newPage(browser);
    await cdp.send("Performance.enable");
    const heaps = [];
    let created = 0, aliveAfter = 0, opened = 0, leftCanvas = 0;
    for (const g of index.slice(0, 20)) {
      await loaded(page, `?creature=${encodeURIComponent(g.slug)}&theatre=2d`);
      if (await page.$("#creature3d-toggle")) {
        await clickToggle(page);
        await page.waitForSelector("#creature3d-canvas", { timeout: 30000 }).then(() => opened++).catch(() => {});
        await page.waitForTimeout(700);
        await clickToggle(page);
        await page.waitForTimeout(100);
        leftCanvas += (await page.$("#creature3d-canvas")) ? 1 : 0;
      }
      await cdp.send("HeapProfiler.collectGarbage");
      const r = await page.evaluate(() => ({ created: window.__ctx.length, alive: window.__ctx.filter((w) => { const c = w.deref(); return c && c.isConnected; }).length }));
      created += r.created; aliveAfter += r.alive;
      heaps.push(await heap(cdp));
    }
    const growth = mb(heaps[heaps.length - 1] - heaps[1]);
    s.check("all 20 creatures opened in 3D", opened === 20, `${opened} of 20`);
    s.check("each dispose removes the canvas", leftCanvas === 0, `${leftCanvas} canvases left`);
    s.check("no WebGL context stays attached after dispose", aliveAfter === 0, `${created} contexts created in total, ${aliveAfter} still attached`);
    s.check(`heap growth over 20 page loads <= ${BOUNDS.heapGrowthMb} MB`, growth <= BOUNDS.heapGrowthMb, `${growth} MB from creature 2 to creature 20`);
    s.check("no page errors or console errors", errors.length === 0, errors.slice(0, 3).join(" / "));
    s.metrics = { created, heapFirstMb: mb(heaps[0]), heapLastMb: mb(heaps[heaps.length - 1]), heapGrowthMb: growth };

    // Same page, 20 open/dispose cycles: any context or heap that is not released builds up here.
    await loaded(page, "?theatre=2d");
    const h0 = await heap(cdp);
    const warn0 = warnings.length;
    for (let i = 0; i < 20; i++) {
      await clickToggle(page);
      await page.waitForSelector("#creature3d-canvas", { timeout: 30000 });
      await page.waitForTimeout(300);
      await clickToggle(page);
      await page.waitForSelector("#creature3d-canvas", { state: "detached", timeout: 10000 });
    }
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ created: window.__ctx.length, alive: window.__ctx.filter((w) => { const c = w.deref(); return c && c.isConnected; }).length, collected: window.__ctx.filter((w) => !w.deref()).length, lost: window.__lost }));
    const h1 = await heap(cdp);
    const cycleGrowth = mb(h1 - h0);
    const tooMany = warnings.slice(warn0).filter((w) => /too many active webgl/i.test(w)).length;
    s.metrics.cycles = { contextsCreated: r.created, attached: r.alive, collected: r.collected, lostEvents: r.lost, heapGrowthMb: cycleGrowth, tooManyContextsWarnings: tooMany };
    s.check("20 open/dispose cycles: no context left attached", r.alive === 0, `${r.created} created, ${r.collected} collected, ${r.alive} attached, ${r.lost} lost events`);
    s.check("20 open/dispose cycles: no \"too many WebGL contexts\" warning", tooMany === 0, `${tooMany} warnings`);
    s.check(`20 open/dispose cycles: heap growth <= ${BOUNDS.heapGrowthMb} MB`, cycleGrowth <= BOUNDS.heapGrowthMb, `${cycleGrowth} MB`);
    await ctx.close();
  });
}

// 3. The command line: 200 mixed commands typed as fast as the page takes them, then a larger run to see whether the transcript grows without bound.
async function commands(browser) {
  const s = scenario("commands-200", "Command line: 200 fast commands");
  await run(s, async () => {
    const { ctx, page, cdp, errors } = await newPage(browser);
    await cdp.send("Performance.enable");
    await loaded(page);
    const lines = () => page.evaluate(() => ({ n: document.getElementById("transcript").children.length, chars: document.getElementById("transcript").textContent.length }));
    const type = async (list) => {
      let skipped = 0;
      for (const c of list) {
        try { await page.fill("#cmd", c, { timeout: 5000 }); await page.press("#cmd", "Enter", { timeout: 5000 }); } catch { skipped++; }
      }
      return skipped;
    };
    const start = await lines();
    const h0 = await heap(cdp);
    const t0 = Date.now();
    const skipped = await type(commandMix(200));
    const secs = (Date.now() - t0) / 1000;
    await page.waitForTimeout(500);
    const a = await lines();
    const alive = await page.evaluate(() => !document.getElementById("cmd").disabled);
    const h1 = await heap(cdp);
    const skipped2 = await type(commandMix(600));
    await page.waitForTimeout(500);
    const b = await lines();
    const h2 = await heap(cdp);
    s.metrics = { transcriptLinesStart: start.n, linesAfter200: a.n, linesAfter800: b.n, charsAfter800: b.chars, secondsFor200: +secs.toFixed(1), heapStartMb: mb(h0), heapAfter200Mb: mb(h1), heapAfter800Mb: mb(h2), skipped: skipped + skipped2 };
    s.check("no page errors or console errors", errors.length === 0, errors.slice(0, 3).join(" / "));
    s.check("the page still takes input after 200 commands", alive && skipped === 0, `input enabled=${alive}, ${skipped} commands could not be typed`);
    s.check("the game still answers HELP", await (async () => {
      const before = (await lines()).n;
      await page.fill("#cmd", "HELP"); await page.press("#cmd", "Enter");
      await page.waitForTimeout(800);
      return (await lines()).n > before;
    })(), "a line was added by HELP");
    s.check(`transcript stays under ${BOUNDS.transcriptLines} lines after 800 commands`, b.n <= BOUNDS.transcriptLines, `${start.n} lines at start, ${a.n} after 200, ${b.n} after 800 (${Math.round(b.chars / 1024)} KB of text)`);
    await ctx.close();
  });
}

// 4. The paste box: bad input, a 404, and lockfiles over the caps (src/exhume/lockfile.ts: 20 MB, 20,000 packages).
const pastePage = async (browser, route) => {
  const p = await newPage(browser);
  const calls = { raw: 0, osv: 0, other: [] };
  await p.page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (u.startsWith("https://raw.githubusercontent.com/")) { calls.raw++; return route(r, u); }
    if (u.startsWith("https://api.osv.dev/")) { calls.osv++; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }); }
    calls.other.push(u);
    return r.abort();
  });
  await loaded(p.page);
  return { ...p, calls };
};

async function submit(page, url) {
  await page.fill("#paste-url", url);
  await page.click("#paste-go");
  await page.waitForTimeout(300);
  // Done when the status stops showing progress: wait for it to be stable for 1.5 s, at most 40 s.
  let last = "", stable = 0;
  for (let i = 0; i < 160 && stable < 6; i++) {
    const t = await page.textContent("#paste-status");
    stable = t === last ? stable + 1 : 0;
    last = t ?? "";
    await page.waitForTimeout(250);
  }
  return page.evaluate(() => {
    const r = document.getElementById("paste-result");
    return { status: document.getElementById("paste-status")?.textContent ?? "", drawn: !!r && !r.hidden && r.textContent.trim().length > 0, result: r && !r.hidden ? r.textContent.slice(0, 400) : "", long: window.__long.slice() };
  });
}

async function paste(browser) {
  const s = scenario("paste-box", "Paste box: invalid URLs, 404, huge lockfile");
  await run(s, async () => {
    // Invalid input never reaches the network.
    {
      const { ctx, page, calls, errors } = await pastePage(browser, (r) => r.fulfill({ status: 404, body: "" }));
      const bad = ["not a url", "https://evil.example/owner/repo", "javascript:alert(1)", "https://github.com/../..", "https://github.com/" + "a".repeat(3000) + "/b", "\u2620\ufe0f\u202e", "   "];
      let drawn = 0, empty = 0;
      for (const u of bad) {
        const r = await submit(page, u);
        if (r.drawn) drawn++;
        if (!r.status.trim()) empty++;
      }
      s.check("invalid URLs draw no creature", drawn === 0, `${drawn} of ${bad.length} drew one`);
      s.check("invalid URLs each get a message", empty === 0, `${empty} of ${bad.length} had an empty status`);
      s.check("invalid URLs make no request outside the site", calls.raw === 0 && calls.osv === 0 && calls.other.length === 0, `raw=${calls.raw} osv=${calls.osv} other=${calls.other.length}`);
      s.check("invalid URLs raise no page error", errors.length === 0, errors.slice(0, 2).join(" / "));
      // Self-test of the freeze probe: a 120 ms busy loop must show up as a long task, or "0 ms" below would mean nothing.
      await page.evaluate(() => { setTimeout(() => { const t = performance.now(); while (performance.now() - t < 120); }, 0); });
      await page.waitForTimeout(600);
      const seen = await page.evaluate(() => Math.max(0, ...window.__long));
      s.check("freeze probe sees a 120 ms busy loop", seen >= 100, `${Math.round(seen)} ms`);
      await ctx.close();
    }
    // A repo that does not exist.
    {
      const { ctx, page } = await pastePage(browser, (r) => r.fulfill({ status: 404, body: "" }));
      const r = await submit(page, "https://github.com/stress-test/does-not-exist");
      s.metrics.status404 = r.status;
      s.check("404 repo: a clear message, no creature", r.status.trim().length > 0 && !r.drawn, r.status.slice(0, 160));
      s.check("404 repo: nothing claims clean", !claimsClean(r.status + " " + r.result), "");
      await ctx.close();
    }
    // 50,000 packages: over the 20,000 package cap, under the 20 MB cap.
    {
      const body = syntheticLockfile(50000);
      s.metrics.lockfile50kMb = mb(body.length);
      const { ctx, page, calls } = await pastePage(browser, (r) => r.fulfill({ status: 200, contentType: "text/plain", body }));
      const r = await submit(page, "https://github.com/stress-test/huge-lockfile");
      const longest = Math.round(Math.max(0, ...r.long));
      s.metrics.status50k = r.status;
      s.metrics.longestTask50kMs = longest;
      s.check("50k packages: stopped with a message that names the cap", /cap|too large|larger|more than/i.test(r.status), r.status.slice(0, 200));
      s.check("50k packages: no creature drawn, nothing claims clean", !r.drawn && !claimsClean(r.status), `drawn=${r.drawn}`);
      s.check("50k packages: no OSV request for a rejected lockfile", calls.osv === 0, `${calls.osv} OSV requests`);
      s.check(`50k packages: no main-thread task over ${BOUNDS.freezeMs} ms`, longest <= BOUNDS.freezeMs, `longest task ${longest} ms`);
      await ctx.close();
    }
    // Over the byte cap: 22 MB of text, declared by content-length and as a body.
    {
      const body = syntheticLockfile(2000, 11000);
      s.metrics.lockfileBigMb = mb(body.length);
      const { ctx, page, calls } = await pastePage(browser, (r) => r.fulfill({ status: 200, contentType: "text/plain", body }));
      const r = await submit(page, "https://github.com/stress-test/big-bytes");
      const longest = Math.round(Math.max(0, ...r.long));
      s.metrics.statusBig = r.status;
      s.metrics.longestTaskBigMs = longest;
      s.check(`${mb(body.length)} MB lockfile: stopped with a message that names the cap`, /cap|too large|larger|more than/i.test(r.status), r.status.slice(0, 200));
      s.check(`${mb(body.length)} MB lockfile: no creature, nothing claims clean, no OSV request`, !r.drawn && !claimsClean(r.status) && calls.osv === 0, `drawn=${r.drawn} osv=${calls.osv}`);
      s.check(`${mb(body.length)} MB lockfile: no main-thread task over ${BOUNDS.freezeMs} ms`, longest <= BOUNDS.freezeMs, `longest task ${longest} ms`);
      await ctx.close();
    }
  });
}

// 5. A slow device: 4x CPU throttle on the landing. The frame guard (web/js/theatre/caps.js) must drop the 3D bench to 2D.
// Chromium run by playwright reports navigator.webdriver, which turns the guard off by design, so it is set to false here.
async function slowDevice(browser) {
  const s = scenario("cpu-4x", "Slow device: 4x CPU throttle on the landing");
  await run(s, async () => {
    for (const throttle of [1, 4]) {
      const { ctx, page, cdp, errors } = await newPage(browser, { webdriver: false });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      await page.goto(base);
      await page.waitForFunction(() => document.getElementById("plate")?.textContent.trim().length > 0, null, { timeout: 90000 }).catch(() => {});
      let mode = "";
      for (let i = 0; i < 60; i++) {
        mode = await page.evaluate(() => document.documentElement.dataset.theatre ?? "");
        if (/^2d/.test(mode) || i > 40) break;
        await page.waitForTimeout(500);
      }
      const fps = await page.evaluate(() => { const t = window.__rafTimes.slice(); const d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); return d; });
      await page.waitForTimeout(8000);
      const r0 = await page.evaluate(() => window.__rafCount);
      await page.waitForTimeout(5000);
      const r1 = await page.evaluate(() => window.__rafCount);
      const perSec = (r1 - r0) / 5;
      const finalMode = await page.evaluate(() => document.documentElement.dataset.theatre ?? "");
      const plateOk = await page.evaluate(() => document.getElementById("plate")?.textContent.trim().length > 0 && !!document.getElementById("cmd"));
      s.metrics[`x${throttle}`] = { theatre: finalMode, startupFrameIntervalMedianMs: +median(fps).toFixed(1), idleRafPerSec: perSec };
      if (throttle === 4) {
        s.check("4x throttle: the frame guard drops the bench to 2D", /^2d/.test(finalMode), `data-theatre=${finalMode}, median startup frame ${median(fps).toFixed(1)} ms`);
        s.check("4x throttle: the plain page is usable (plate and #cmd present)", plateOk, "");
      } else {
        s.check("no throttle: reference run recorded", true, `data-theatre=${finalMode}, median startup frame ${median(fps).toFixed(1)} ms`);
      }
      s.check(`${throttle}x: idle animation frames <= ${BOUNDS.restRafPerSec} per second`, perSec <= BOUNDS.restRafPerSec, `${perSec.toFixed(1)} per second`);
      s.check(`${throttle}x: no page errors`, errors.length === 0, errors.slice(0, 2).join(" / "));
      await ctx.close();
    }
  });
}

// 6. Offline: the network goes away after the page loaded.
async function offline(browser) {
  const s = scenario("offline", "Offline after load");
  await run(s, async () => {
    const demoLock = readFileSync(join(root, "fixtures", "crypt-demo", "package-lock.json"), "utf8");
    // 6a: everything blocked.
    {
      const { ctx, page, errors } = await newPage(browser);
      await loaded(page);
      await ctx.setOffline(true);
      const r = await submit(page, "https://github.com/e-1305/crypt-demo");
      s.metrics.statusOffline = r.status;
      s.check("offline: a message that names the network problem", /network|connection|reach|offline|try again/i.test(r.status), r.status.slice(0, 200));
      s.check("offline: no creature drawn, nothing claims clean", !r.drawn && !claimsClean(r.status + " " + r.result), `drawn=${r.drawn}`);
      await page.fill("#cmd", "HELP"); await page.press("#cmd", "Enter");
      await page.waitForTimeout(500);
      s.check("offline: the local game still answers", await page.evaluate(() => document.getElementById("transcript").children.length > 0), "");
      // The browser logs every blocked request as a console error. That is the test itself, not a product error.
      const own = errors.filter((e) => !/Failed to load resource/.test(e));
      s.check("offline: no page errors", own.length === 0, own.slice(0, 2).join(" / "));
      await ctx.close();
    }
    // 6b: the lockfile arrives but the OSV lookup is blocked.
    {
      const { ctx, page } = await newPage(browser);
      await page.route("https://raw.githubusercontent.com/**", (r) => r.request().url().endsWith("/package-lock.json") ? r.fulfill({ status: 200, contentType: "text/plain", body: demoLock }) : r.fulfill({ status: 404, body: "" }));
      await page.route("https://api.osv.dev/**", (r) => r.abort("internetdisconnected"));
      await loaded(page);
      const r = await submit(page, "https://github.com/e-1305/crypt-demo");
      s.metrics.statusOsvBlocked = r.status;
      s.check("OSV blocked: an honest message, no creature", r.status.trim().length > 0 && !r.drawn, r.status.slice(0, 200));
      s.check("OSV blocked: nothing claims clean", !claimsClean(r.status + " " + r.result), "");
      await ctx.close();
    }
  });
}

let browser;
let version = "";
try {
  browser = await chromium.launch(launchOptions());
  version = browser.version();
  for (const fn of [limbs400, gallery, commands, paste, slowDevice, offline]) await fn(browser);
} finally {
  await browser?.close();
  server.close();
}
const summary = summarize(scenarios);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "report.json"), JSON.stringify({ issue: 339, chromium: version, node: process.version, holdMs: HOLD_MS, bounds: BOUNDS, ...summary, scenarios: scenarios.map(({ check, ...s }) => s) }, null, 2) + "\n");
console.log(`\nstress: ${summary.checks} checks, ${summary.failures.length} failed. Report: out/stress/report.json`);
if (!summary.passed) { for (const f of summary.failures) console.error(`FAIL [${f.scenario}] ${f.check}: ${f.detail}`); process.exit(1); }
