// Visual QA (issue #56): serve _site/ and load it at three viewports in headless Chromium.
// Fails on overlapping main controls, overlapping raid stats, an empty plate, and (at 390 wide)
// a non-2D default, small tap targets or horizontal overflow. Writes screenshots to out/visual-qa/
// and, only when VISUAL_QA_COPY_DOCS=1, copies them to docs/img/ for the PR description.
// Dev and CI only, excluded from npm pack.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, extname, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readdirSync, existsSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import http from "node:http";
import { findOverlaps, filterFixedBoxes } from "./overlap.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const root = resolve(import.meta.dirname, "..", "..");
const site = join(root, "_site");
const outDir = join(root, "out", "visual-qa");
const imgDir = join(root, "docs", "img");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain" };

// The first screen: one primary button, the CRT input and the page links. The Bench drawer controls are checked with the drawer open.
const CONTROLS = ["#paste-open", "#bench-toggle", "#hc-toggle", "#cmd", "#try-chip", "#download", "#manual-link"];
const BENCH_CONTROLS = ["#sim-green", "#sim-red", "#raid-start", "#sound-toggle", "#record-toggle", "#view-3d", "#install-copy", "#lookup", "#kiro-link"];
// Fixed-position elements checked on the 3D bench. The caption is pointer-events:none, so it is listed by name.
const CAPTION = "#theatre-caption";
const RAID_STATS = ["#raid-nights", "#raid-vitals", "#raid-health"];
const TAP_MIN = 44;

const VIEWPORTS = [
  { w: 390, h: 844, touch: true, full: true },
  { w: 1280, h: 800, touch: false, full: false },
  { w: 1440, h: 900, touch: false, full: false },
  { w: 1920, h: 1080, touch: false, full: false },
];

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
  const o = { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"] };
  if (process.env.CHROMIUM_PATH) o.executablePath = process.env.CHROMIUM_PATH;
  return o;
}

const failures = [];
const fail = (tag, msg) => { failures.push(`[${tag}] ${msg}`); console.error(`FAIL [${tag}] ${msg}`); };

// Every visible position:fixed element, found from computed style so new fixed UI is covered without editing a list.
// Full-viewport overlays are dropped, and so are pointer-events:none decorations other than the caption.
async function fixedBoxes(page, vw, vh) {
  const found = await page.evaluate((caption) => {
    const label = (el) => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${[...el.classList].map((c) => "." + c).join("")}`;
    return [...document.body.querySelectorAll("*")].flatMap((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden]")) return [];
      if (cs.pointerEvents === "none" && !el.matches(caption)) return [];
      const r = el.getBoundingClientRect();
      return [{ name: label(el), x: r.x, y: r.y, width: r.width, height: r.height }];
    });
  }, CAPTION);
  return filterFixedBoxes(found, vw, vh);
}

async function boxes(page, selectors) {
  return page.evaluate((sels) => sels.flatMap((s) => {
    const el = document.querySelector(s);
    if (!el) return [{ name: s, missing: true }];
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === "none" || cs.visibility === "hidden" || r.width === 0 || r.height === 0 || el.closest("[hidden]")) return [];
    return [{ name: s, x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }];
  }), selectors);
}

// A listed selector that is absent from the DOM is a failure, so renames cannot silently drop out.
function present(tag, list) {
  return list.filter((b) => {
    if (b.missing) fail(tag, `selector ${b.name} not found in the page`);
    return !b.missing;
  });
}

// A proportional fallback makes the ASCII creature drift apart. Measure with the same stack constant the canvas
// textures use (web/theatre/font.js), regular and bold, and check the DOM plate resolved to the webfont.
async function checkMonospace(page, tag) {
  const r = await page.evaluate(async () => {
    const { MONO, FONT_FAMILY, ensureFonts } = await import("./theatre/font.js");
    await document.fonts.ready;
    await ensureFonts();
    const ctx = document.createElement("canvas").getContext("2d");
    const width = (weight, s) => { ctx.font = `${weight} 26px ${MONO}`; return ctx.measureText(s).width; };
    const plate = document.getElementById("plate");
    return {
      regular: [width("normal", "iiii"), width("normal", "MMMM")],
      bold: [width("bold", "iiii"), width("bold", "MMMM")],
      loaded: document.fonts.check(`26px "${FONT_FAMILY}"`) && document.fonts.check(`bold 26px "${FONT_FAMILY}"`),
      plateFont: plate ? getComputedStyle(plate).fontFamily : "",
      plateLoaded: plate ? document.fonts.check(`13px ${getComputedStyle(plate).fontFamily}`, "iM") : false,
      family: FONT_FAMILY,
    };
  });
  const faces = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family}/${f.weight}`));
  for (const k of ["regular", "bold"]) {
    if (r[k][0] !== r[k][1]) fail(tag, `${k} canvas font is proportional: iiii=${r[k][0]} MMMM=${r[k][1]}`);
  }
  if (!r.loaded) fail(tag, `webfont "${r.family}" is not loaded`);
  if (!faces.some((f) => f.includes(r.family) && f.endsWith("/400")) || !faces.some((f) => f.includes(r.family) && f.endsWith("/700"))) fail(tag, `webfont faces not loaded: ${faces.join(", ")}`);
  if (!r.plateFont.includes(r.family)) fail(tag, `#plate font-family does not start with the webfont: ${r.plateFont}`);
}

async function check(browser, vp, query) {
  const tag = `${vp.w}x${vp.h}${query ? " " + query : ""}`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(tag, `page error: ${e.message}`));
  await page.goto(base + query);
  // The plate fills in once the demo creature loads; the game is ready when the input enables.
  await page.waitForFunction(() => document.getElementById("plate")?.textContent.trim().length > 0 && !document.getElementById("cmd")?.disabled, null, { timeout: 30000 })
    .catch(() => fail(tag, "plate or game did not load within 30s"));
  // The 3D path shows a 3 second title card over the bench. Wait it out so the screenshot shows the page.
  await page.waitForSelector("#title-card", { state: "detached", timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  await checkMonospace(page, tag);

  const plate = (await page.textContent("#plate")) ?? "";
  if (!plate.trim()) fail(tag, "plate is empty");
  else if (!plate.includes("crypt-demo")) fail(tag, "plate does not name crypt-demo");

  const theatre0 = await page.evaluate(() => document.documentElement.dataset.theatre ?? "");
  const is3d = theatre0.startsWith("3d");
  const all = present(tag, await boxes(page, is3d ? CONTROLS.filter((c) => c !== "#bench-toggle") : CONTROLS));
  const primary = await page.evaluate(() => [...document.querySelectorAll("button.primary, a.primary")].filter((e) => e.getClientRects().length > 0).map((e) => e.textContent.trim()));
  if (primary.length !== 1 || primary[0] !== "Paste your GitHub repo") fail(tag, `expected one primary button "Paste your GitHub repo", got ${JSON.stringify(primary)}`);
  if (!is3d) {
    // The Bench holds the raid, Simulated CI and the rest: closed they are not on screen, open they do not overlap.
    const hidden = await page.evaluate((sels) => sels.filter((s) => { const e = document.querySelector(s); return e && e.getClientRects().length > 0; }), ["#sim-green", "#raid-start", "#record-toggle", "#sound-toggle", "#gallery-list"]);
    if (hidden.length) fail(tag, `Bench controls visible on the first screen: ${hidden.join(", ")}`);
  }
  for (const [a, b] of findOverlaps(all)) fail(tag, `controls overlap: ${a} and ${b}`);
  const stats = is3d ? present(tag, await boxes(page, RAID_STATS)) : [];
  if (is3d) for (const [a, b] of findOverlaps(stats)) fail(tag, `raid stats overlap: ${a} and ${b}`);

  const theatre = theatre0;
  if (!is3d) {
    await page.click("#bench-toggle");
    const open = present(tag, await boxes(page, BENCH_CONTROLS));
    for (const [a, b] of findOverlaps([...present(tag, await boxes(page, CONTROLS)), ...open])) fail(tag, `controls overlap with the Bench open: ${a} and ${b}`);
    if (vp.w < 900) for (const b of open) if (b.height < TAP_MIN && b.name !== "#install-copy" && b.name !== "#kiro-link") fail(tag, `tap target ${b.name} is ${Math.round(b.height)}px tall, under ${TAP_MIN}`);
    const stats2 = present(tag, await boxes(page, RAID_STATS));
    for (const [a, b] of findOverlaps(stats2)) fail(tag, `raid stats overlap: ${a} and ${b}`);
    await page.click("#bench-toggle");
  } else {
    await page.click("#bench-drawer-toggle");
    const open = present(tag, await boxes(page, BENCH_CONTROLS.filter((c) => c !== "#view-3d" && c !== "#lookup" && c !== "#install-copy" && c !== "#kiro-link")));
    for (const [a, b] of findOverlaps(open)) fail(tag, `controls overlap with the Bench open: ${a} and ${b}`);
    const fixedOpen = await fixedBoxes(page, vp.w, vp.h);
    for (const [a, b] of findOverlaps(fixedOpen)) fail(tag, `fixed elements overlap with the Bench open: ${a} and ${b}`);
    await page.click("#bench-drawer-toggle");
  }
  let fixedCount = 0;
  if (theatre.startsWith("3d")) {
    // Worst case for the bottom bar: the raid card download button is shown, which makes #raid as wide as it gets.
    await page.evaluate(() => { const b = document.getElementById("raid-download"); if (b) b.hidden = false; });
    const fixed = await fixedBoxes(page, vp.w, vp.h);
    await page.evaluate(() => { const b = document.getElementById("raid-download"); if (b) b.hidden = true; });
    fixedCount = fixed.length;
    if (!fixed.some((b) => b.name === CAPTION)) fail(tag, `${CAPTION} is not visible on the 3D bench`);
    for (const [a, b] of findOverlaps(fixed)) fail(tag, `fixed elements overlap: ${a} and ${b}`);
  }
  if (vp.w < 900 && !query) {
    if (!theatre.startsWith("2d")) fail(tag, `expected 2D by default, got data-theatre="${theatre}"`);
    for (const b of all) if (b.height < TAP_MIN && b.name !== "#install-copy") fail(tag, `tap target ${b.name} is ${Math.round(b.height)}px tall, under ${TAP_MIN}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) fail(tag, `horizontal overflow of ${overflow}px`);
  }
  if (query.includes("theatre=2d") && !theatre.startsWith("2d")) fail(tag, `expected 2D, got data-theatre="${theatre}"`);
  if (!query && vp.w >= 900 && !theatre.startsWith("3d")) fail(tag, `expected 3D on desktop, got data-theatre="${theatre}"`);

  if (!query) {
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `${vp.w}x${vp.h}.png`);
    await page.screenshot({ path: file, fullPage: vp.full });
    if (process.env.VISUAL_QA_COPY_DOCS === "1") {
      mkdirSync(imgDir, { recursive: true });
      copyFileSync(file, join(imgDir, `visual-qa-${vp.w}x${vp.h}.png`));
    }
  } else {
    mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: join(outDir, `${vp.w}x${vp.h}-2d.png`) });
  }
  console.log(`ok   [${tag}] theatre=${theatre} controls=${all.length} stats=${stats.length} fixed=${fixedCount}`);
  await ctx.close();
}

// Judge mode (web/judge-mode.js): the 45-second autoplay. The t=0 checks above never see it, so load ?judge=1 under a fake
// clock, run 30 s of virtual time and check the layout the viewer sees mid-demo: the caption bar, the findings badge, the
// pitch strip and the onboarding card. Automated browsers only autoplay with ?judge=1.
const JUDGE_AT_MS = 30000;
const JUDGE_VIEWPORTS = [{ w: 1440, h: 900, touch: false, full: false }, { w: 390, h: 844, touch: true, full: false }];

async function checkJudge(browser, vp) {
  const tag = `${vp.w}x${vp.h} judge t=30s`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(tag, `page error: ${e.message}`));
  // install() alone lets time flow in real time. Pausing first makes only runFor() advance it, so 30 s is exactly 30 s.
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
  await page.goto(base + "?judge=1");
  // Let the page boot on the fake clock in small steps, then play the demo up to 30 s.
  const ready = () => page.evaluate(() => document.getElementById("plate")?.textContent.trim().length > 0 && !document.getElementById("cmd")?.disabled && !!document.getElementById("judge-stage"));
    for (let i = 0; i < 120 && !(await ready()); i++) { await page.waitForTimeout(250); }
  if (!(await ready())) fail(tag, "judge mode did not start or the game did not load");
  // The demo's clock starts when judge mode starts. The paused clock has not moved since, so 30 s of runFor is t=30 s.
  for (let t = 0; t < JUDGE_AT_MS; t += 500) { await page.clock.runFor(500); await page.waitForTimeout(30); }
  await page.waitForTimeout(500);

  const seen = await page.evaluate(() => {
    const textBox = (e) => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect(); };
    const vis = (sel, text) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); const r = text ? textBox(e) : e.getBoundingClientRect(); return cs.display === "none" || cs.visibility === "hidden" || r.width === 0 || r.height === 0 || e.closest("[hidden]") ? null : { x: r.x, y: r.y, width: r.width, height: r.height, text: (e.textContent || "").trim() }; };
    const named = { "#judge-caption": vis("#judge-caption"), "#judge-counter": vis("#judge-counter"), "#judge-skip": vis("#judge-skip"), "#tutorial": vis("#tutorial"), "#theatre-caption": vis("#theatre-caption"), "h1": vis("header.top h1", true), ".subtitle": vis("header.top .subtitle", true), "#pitch": vis("#pitch", true) };
    return { named, running: document.body.classList.contains("judge-running"), scrollW: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  const n = seen.named;
  if (!seen.running) fail(tag, "judge mode is not running at 30 s");
  if (!n["#judge-caption"]) fail(tag, "judge caption is not visible");
  if (!n["#judge-counter"] || !/findings/.test(n["#judge-counter"].text)) fail(tag, "findings badge is not visible at 30 s");
  if (!n["#judge-skip"]) fail(tag, "Skip demo button is not visible");
  if (n["#tutorial"]) fail(tag, "onboarding card (#tutorial) is visible while judge mode runs");
  if (n["#theatre-caption"]) fail(tag, "pitch strip (#theatre-caption) is visible behind the judge caption");
  if (seen.scrollW > 0) fail(tag, `horizontal overflow of ${seen.scrollW}px`);
  // On the 3D bench the page header sits behind the canvas and is not on screen, so only the 2D page checks it.
  const is3d = await page.evaluate(() => (document.documentElement.dataset.theatre ?? "").startsWith("3d"));
  const hiddenIn3d = new Set(["h1", ".subtitle", "#pitch"]);
  const list = Object.entries(n).filter(([name, b]) => b && !(is3d && hiddenIn3d.has(name))).map(([name, b]) => ({ name, x: b.x, y: b.y, width: b.width, height: b.height }));
  const fixed = (await fixedBoxes(page, vp.w, vp.h)).filter((b) => !list.some((l) => l.name === b.name));
  const overlaps = findOverlaps([...list, ...fixed]);
  for (const [a, b] of overlaps) fail(tag, `overlap while judge mode runs: ${a} and ${b}`);

  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `judge-${vp.w}x${vp.h}.png`);
  await page.screenshot({ path: file });
  if (process.env.VISUAL_QA_COPY_DOCS === "1") {
    mkdirSync(imgDir, { recursive: true });
    copyFileSync(file, join(imgDir, `judge-mode-${vp.w}x${vp.h}.png`));
  }
  console.log(`ok   [${tag}] checked=${list.map((b) => b.name).join(",")} fixed=${fixed.length}`);
  await ctx.close();
}

// Autopsy report (D5): the one-page CISO report from `crypt autopsy --sample`. Loaded from a file URL at two viewports.
// Checks no page error, no horizontal overflow, the h1 and the three measure cards visible and apart, the footnotes,
// a basic accessibility pass (lang, landmark, alt text, text contrast) and that print emulation fits one A4 page.
const AUTOPSY_VIEWPORTS = [{ w: 1440, h: 900, touch: false }, { w: 390, h: 844, touch: true }];
const MEASURES = ["#h-impl", "#h-eff", "#h-imp"];

async function checkAutopsy(browser, vp, file) {
  const tag = `${vp.w}x${vp.h} autopsy`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(tag, `page error: ${e.message}`));
  await page.goto(pathToFileURL(file).href);
  const seen = await page.evaluate((sels) => {
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; };
    const shown = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
    const h1 = document.querySelector("h1");
    const cards = sels.map((s) => { const h = document.querySelector(s); const c = h?.closest("section"); return { name: s, ok: shown(c) && shown(h), ...(c ? box(c) : {}) }; });
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const bgOf = (e) => { for (; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c.length === 3 || c[3] > 0.95)) return c.slice(0, 3); } return [255, 255, 255]; };
    const low = [];
    for (const e of document.body.querySelectorAll("h1,h2,p,li,td,th,span,a,footer,small,dt,dd,div")) {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !shown(e)) continue;
      const fg = rgba(getComputedStyle(e).color).slice(0, 3);
      const a = lum(fg), b = lum(bgOf(e));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 4.5) low.push(`${e.tagName.toLowerCase()}${e.className ? "." + e.className : ""} ${ratio.toFixed(2)}`);
    }
    return {
      h1: shown(h1) ? h1.textContent.trim() : "",
      h1box: h1 ? box(h1) : null,
      cards,
      footnotes: document.querySelectorAll("footer li, footer ol, footer p").length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lang: document.documentElement.lang,
      main: document.querySelectorAll("main").length,
      noAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
      title: document.title.trim(),
      low: [...new Set(low)],
    };
  }, MEASURES);
  if (!seen.h1) fail(tag, "h1 is not visible");
  for (const c of seen.cards) if (!c.ok) fail(tag, `measure card ${c.name} is missing or hidden`);
  const present = seen.cards.filter((c) => c.ok);
  for (const [a, b] of findOverlaps(present)) fail(tag, `measure cards overlap: ${a} and ${b}`);
  if (seen.h1box) for (const c of present) if (findOverlaps([{ name: "h1", ...seen.h1box }, c]).length) fail(tag, `h1 overlaps ${c.name}`);
  if (seen.footnotes < 1) fail(tag, "footnotes are missing");
  if (seen.overflow > 0) fail(tag, `horizontal overflow of ${seen.overflow}px`);
  if (!seen.lang) fail(tag, "html lang is missing");
  if (seen.main !== 1) fail(tag, `expected one main landmark, found ${seen.main}`);
  if (seen.noAlt) fail(tag, `${seen.noAlt} img without alt`);
  if (!seen.title) fail(tag, "page title is empty");
  if (seen.low.length) fail(tag, `text contrast under 4.5:1: ${seen.low.join(", ")}`);

  let pages = 0;
  if (vp.w >= 900) {
    // Print emulation: Chromium honours @page size A4 and prints to PDF. One page means one "/Type /Page" object.
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    pages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
    if (pages !== 1) fail(tag, `print output is ${pages} pages, expected 1 A4 page`);
    await page.emulateMedia({ media: "screen" });
  }

  mkdirSync(outDir, { recursive: true });
  const shot = join(outDir, `autopsy-${vp.w}x${vp.h}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  if (process.env.VISUAL_QA_COPY_DOCS === "1" && vp.w === 1440) {
    mkdirSync(imgDir, { recursive: true });
    copyFileSync(shot, join(imgDir, "autopsy.png"));
  }
  console.log(`ok   [${tag}] cards=${present.length} footnotes=${seen.footnotes}${pages ? ` printPages=${pages}` : ""}`);
  await ctx.close();
}

let browser;
try {
  browser = await chromium.launch(launchOptions());
  for (const vp of VIEWPORTS) {
    await check(browser, vp, "");
    if (vp.w >= 900) await check(browser, vp, "?theatre=2d");
  }
  for (const vp of JUDGE_VIEWPORTS) await checkJudge(browser, vp);
  mkdirSync(outDir, { recursive: true });
  const autopsyFile = join(outDir, "autopsy.html");
  const gen = spawnSync(process.execPath, [join(root, "bin", "crypt.mjs"), "autopsy", "--sample", "--out", autopsyFile], { cwd: root, encoding: "utf8" });
  if (gen.status !== 0) fail("autopsy", `crypt autopsy --sample failed: ${gen.stderr || gen.stdout}`);
  else for (const vp of AUTOPSY_VIEWPORTS) await checkAutopsy(browser, vp, autopsyFile);
} finally {
  await browser?.close();
  server.close();
}
if (failures.length) { console.error(`\n${failures.length} visual QA failure(s)`); process.exit(1); }
console.log("visual QA passed");
