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
import { readdirSync, existsSync, readFileSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
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
const CONTROLS = ["#paste-url", "#paste-go", "#paste-example", "#bench-toggle", "#hc-toggle", "#cmd", "#try-chip", "#download", "#manual-link", "#landing-graveyard"];
const BENCH_CONTROLS = ["#sim-green", "#sim-red", "#raid-start", "#sound-toggle", "#record-toggle", "#view-3d", "#install-copy", "#lookup", "#kiro-link", "#graveyard-link"];
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
  if (primary.length !== 1 || primary[0] !== "Scan my repo") fail(tag, `expected one primary button "Scan my repo", got ${JSON.stringify(primary)}`);
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
    if (vp.w < 900) for (const b of open) if (b.height < TAP_MIN && b.name !== "#install-copy" && b.name !== "#kiro-link" && b.name !== "#graveyard-link") fail(tag, `tap target ${b.name} is ${Math.round(b.height)}px tall, under ${TAP_MIN}`);
    const stats2 = present(tag, await boxes(page, RAID_STATS));
    for (const [a, b] of findOverlaps(stats2)) fail(tag, `raid stats overlap: ${a} and ${b}`);
    await page.click("#bench-toggle");
  } else {
    await page.click("#bench-drawer-toggle");
    const open = present(tag, await boxes(page, BENCH_CONTROLS.filter((c) => c !== "#view-3d" && c !== "#lookup" && c !== "#install-copy" && c !== "#kiro-link" && c !== "#graveyard-link")));
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

// Share card (D3): paste a repo (network mocked: lockfile from a fixture, OSV answers with a hit for lodash) and check the card
// panel on the paste result and the raid end screen: no control overlaps, 44 px tap targets on mobile, a real 1200x627 canvas.
const CARD_PASTE = ["#card-creature-repo", "#card-creature-download", "#card-creature-copy", "#card-creature-linkedin"];
const CARD_RAID = ["#card-raid-repo", "#card-raid-download", "#card-raid-copy", "#card-raid-linkedin"];
const demoLock = readFileSync(join(root, "fixtures", "crypt-demo", "package-lock.json"), "utf8");

async function mockNetwork(page) {
  await page.route("https://raw.githubusercontent.com/**", (route) => route.request().url().endsWith("/package-lock.json")
    ? route.fulfill({ status: 200, contentType: "text/plain", body: demoLock })
    : route.fulfill({ status: 404, body: "" }));
  await page.route("https://api.osv.dev/**", (route) => {
    const req = route.request();
    if (req.url().endsWith("/querybatch")) {
      const q = JSON.parse(req.postData() || "{}").queries || [];
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: q.map((x) => (x.package.name === "lodash" ? { vulns: [{ id: "GHSA-test-0001" }] } : {})) }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "GHSA-test-0001", aliases: ["CVE-2099-0001"], database_specific: { severity: "HIGH" } }) });
  });
}

async function checkCard(browser, vp) {
  const tag = `${vp.w}x${vp.h} card`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(tag, `page error: ${e.message}`));
  await mockNetwork(page);
  await page.goto(base + "?theatre=2d");
  await page.waitForFunction(() => document.getElementById("plate")?.textContent.trim().length > 0 && !document.getElementById("cmd")?.disabled, null, { timeout: 30000 })
    .catch(() => fail(tag, "page did not load within 30s"));
  const inputBox = await boxes(page, ["#paste-url", "#paste-go"]);
  if (present(tag, inputBox).length !== 2) fail(tag, "the repo input and Scan button are not visible on load without a click");
  await page.fill("#paste-url", "https://github.com/acme/widgets");
  await page.click("#paste-go");
  await page.waitForSelector("#card-creature-canvas", { timeout: 30000 }).catch(() => fail(tag, "no card panel after paste"));
  await page.waitForFunction(() => document.getElementById("card-creature-canvas")?.getAttribute("aria-label"), null, { timeout: 10000 }).catch(() => {});
  await page.locator("#card-creature-canvas").scrollIntoViewIfNeeded().catch(() => {});

  const scan = present(tag, await boxes(page, ["#paste-url", "#paste-go", "#paste-status", "#paste-funnel", "#paste-funnel-owners", "#paste-source", "#paste-share", "#paste-share-link"]));
  if (scan.length !== 8) fail(tag, `input, status, funnel, owners and Share must all be visible after a scan, found ${scan.map((b) => b.name).join(",")}`);
  for (const [a, b] of findOverlaps([...scan, ...present(tag, await boxes(page, CARD_PASTE)), ...present(tag, await boxes(page, ["#card-creature-canvas"]))])) fail(tag, `scan input/result overlap: ${a} and ${b}`);
  const funnel = await page.textContent("#paste-funnel");
  if (!/^\d+ findings -> \d+ exorcised as noise -> \d+ monsters$/.test(funnel || "")) fail(tag, `unexpected funnel text: ${funnel}`);
  if (!/no owner/.test((await page.textContent("#paste-funnel-owners")) || "")) fail(tag, "owners line should say no owner for a repo without CODEOWNERS");
  const paste = present(tag, await boxes(page, CARD_PASTE));
  for (const [a, b] of findOverlaps(paste)) fail(tag, `card controls overlap: ${a} and ${b}`);
  if (vp.w < 900) for (const b of paste) if (b.height < TAP_MIN) fail(tag, `tap target ${b.name} is ${Math.round(b.height)}px tall, under ${TAP_MIN}`);
  const info = await page.evaluate(() => {
    const c = document.getElementById("card-creature-canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] > 80 || d[i + 1] > 80) lit++;
    return { w: c.width, h: c.height, lit, checked: document.getElementById("card-creature-repo").checked, alt: c.getAttribute("aria-label") || "", scrollW: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  if (info.w !== 1200 || info.h !== 627) fail(tag, `card canvas is ${info.w}x${info.h}, expected 1200x627`);
  if (info.lit < 50) fail(tag, "card canvas looks blank");
  if (!info.checked) fail(tag, "repo toggle should default to ON for a pasted public repo");
  if (!info.alt.includes("acme/widgets")) fail(tag, "card alt text misses the repo name while the toggle is on");
  if (vp.w < 900 && info.scrollW > 0) fail(tag, `horizontal overflow of ${info.scrollW}px`);
  await page.uncheck("#card-creature-repo");
  await page.waitForFunction(() => !document.getElementById("card-creature-canvas").getAttribute("aria-label").includes("acme/widgets"), null, { timeout: 5000 }).catch(() => fail(tag, "repo name stays on the card after the toggle is switched off"));
  await page.check("#card-creature-repo");
  const dl = await Promise.all([page.waitForEvent("download", { timeout: 10000 }).catch(() => null), page.click("#card-creature-download")]);
  if (!dl[0]) fail(tag, "Download PNG did not start a download");
  else if (dl[0].suggestedFilename() !== "crypt-creature-card.png") fail(tag, `unexpected download name ${dl[0].suggestedFilename()}`);
  mkdirSync(outDir, { recursive: true });
  await page.locator("#card-creature-canvas").screenshot({ path: join(outDir, `card-paste-${vp.w}x${vp.h}.png`) });
  await page.screenshot({ path: join(outDir, `card-paste-page-${vp.w}x${vp.h}.png`) });

  // The raid end screen: mount the raid variant the way web/raid.js does at the end of a raid, then check it in the open Bench.
  await page.click("#bench-toggle");
  await page.evaluate(async () => {
    const { mountCardPanel } = await import("./card/panel.js");
    const root = document.getElementById("raid-share");
    const creature = { repo: "acme/widgets", limbs: [{ ecosystem: "npm", name: "lodash", version: "4.17.15", state: "Healed", rank: 1, spawned: true }, { ecosystem: "npm", name: "minimist", version: "0.0.8", state: "Rotting", rank: 2, spawned: true }] };
    const m = mountCardPanel(root, { variant: "raid", source: "raid", creature, raid: { riskRemoved: "3.42", limbsHealed: 1, time: "07:31", rank: "Surgeon" } });
    await m.ready;
    root.hidden = false;
  });
  await page.locator("#card-raid-canvas").scrollIntoViewIfNeeded().catch(() => {});
  const raid = present(tag, await boxes(page, CARD_RAID));
  for (const [a, b] of findOverlaps([...raid, ...present(tag, await boxes(page, BENCH_CONTROLS))])) fail(tag, `raid card controls overlap: ${a} and ${b}`);
  if (vp.w < 900) for (const b of raid) if (b.height < TAP_MIN) fail(tag, `tap target ${b.name} is ${Math.round(b.height)}px tall, under ${TAP_MIN}`);
  const rinfo = await page.evaluate(() => ({ checked: document.getElementById("card-raid-repo").checked, alt: document.getElementById("card-raid-canvas").getAttribute("aria-label") || "" }));
  if (rinfo.checked) fail(tag, "repo toggle should default to OFF on the raid card");
  if (rinfo.alt.includes("widgets")) fail(tag, "raid card names the repo while the toggle is off");
  await page.locator("#card-raid-canvas").screenshot({ path: join(outDir, `card-raid-${vp.w}x${vp.h}.png`) });
  console.log(`ok   [${tag}] paste controls=${paste.length} raid controls=${raid.length}`);
  await ctx.close();
}

// Scan errors (R1): a mocked rate limit shows a message and no creature, with the input still usable, at every viewport.
async function checkScanError(browser, vp) {
  const tag = `${vp.w}x${vp.h} scan-error`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(tag, `page error: ${e.message}`));
  await page.route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 429, body: "" }));
  await page.route("https://api.osv.dev/**", (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto(base + "?theatre=2d&repo=acme/widgets");
  await page.waitForFunction(() => /rate limiting/.test(document.getElementById("paste-status")?.textContent || ""), null, { timeout: 30000 })
    .catch(() => fail(tag, "no rate limit message after a mocked 429"));
  const state = await page.evaluate(() => ({ resultHidden: document.getElementById("paste-result").hidden, canvas: !!document.getElementById("card-creature-canvas"), funnel: !!document.getElementById("paste-funnel"), value: document.getElementById("paste-url").value }));
  if (!state.resultHidden || state.canvas || state.funnel) fail(tag, "a creature or funnel is shown after a rate limit");
  if (state.value !== "https://github.com/acme/widgets") fail(tag, "the input lost the pasted address");
  const shown = present(tag, await boxes(page, ["#paste-url", "#paste-go", "#paste-status"]));
  if (shown.length !== 3) fail(tag, "input, Scan button and message must be visible");
  for (const [a, b] of findOverlaps(shown)) fail(tag, `error state overlap: ${a} and ${b}`);
  console.log(`ok   [${tag}] message shown, no creature`);
  await ctx.close();
}

// docs/img/card-creature.png and card-raid.png: the real 1200x627 canvas of the demo creature (only with VISUAL_QA_COPY_DOCS=1).
async function captureCards(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "?theatre=2d");
  await page.waitForFunction(() => document.getElementById("plate")?.textContent.trim().length > 0, null, { timeout: 30000 });
  const urls = await page.evaluate(async () => {
    const { mountCardPanel } = await import("./card/panel.js");
    const demo = await (await fetch("game/demo.json")).json();
    const out = {};
    for (const variant of ["creature", "raid"]) {
      const root = document.createElement("div");
      document.body.appendChild(root);
      const healed = demo.limbs.filter((l) => l.spawned).slice(0, 2).map((l) => `${l.ecosystem}:${l.name}`);
      const limbs = variant === "raid" ? demo.limbs.map((l) => (healed.includes(`${l.ecosystem}:${l.name}`) ? { ...l, state: "Healed" } : l)) : demo.limbs;
      const m = mountCardPanel(root, { variant, source: variant === "raid" ? "raid" : "paste", creature: { ...demo, limbs }, raid: { riskRemoved: "2.87", limbsHealed: healed.length, time: "08:42", rank: "Surgeon" } });
      await m.ready;
      if (variant === "raid") { m.toggle.checked = true; m.toggle.dispatchEvent(new Event("change")); await new Promise((r) => setTimeout(r, 300)); }
      out[variant] = m.canvas.toDataURL("image/png");
    }
    return out;
  });
  mkdirSync(imgDir, { recursive: true });
  for (const [v, url] of Object.entries(urls)) writeFileSync(join(imgDir, `card-${v}.png`), Buffer.from(url.split(",")[1], "base64"));
  await ctx.close();
}

// War Room (web/war-room/): the big-screen team raid. Loaded under a fake clock; the scripted SIMULATED timeline is played to the
// red CI rejection (t=39 s) and to the human-merged heal (t=47 s) and the layout is checked at both moments.
const WAR_KEYS = ["#scene", "#bosses", "#score", "#countdown", "#combo", "#feed-panel"];
const WAR_VIEWPORTS = VIEWPORTS;

async function checkWarRoom(browser, vp) {
  const tag = `${vp.w}x${vp.h} war-room`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(tag, `page error: ${e.message}`));
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
  await page.goto(base + "war-room.html");
  const ready = () => page.evaluate(() => document.getElementById("plate")?.textContent.trim().length > 0);
  for (let i = 0; i < 120 && !(await ready()); i++) await page.waitForTimeout(250);
  if (!(await ready())) fail(tag, "the creature did not load");
  let at = 0;
  const playTo = async (ms) => { for (; at < ms; at += 500) { await page.clock.runFor(500); await page.waitForTimeout(20); } };
  const capture = async (name, docsName) => {
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: vp.full });
    if (process.env.VISUAL_QA_COPY_DOCS === "1" && docsName) { mkdirSync(imgDir, { recursive: true }); copyFileSync(file, join(imgDir, docsName)); }
  };
  const layout = async (when) => {
    const list = present(tag, await boxes(page, WAR_KEYS));
    for (const [a, b] of findOverlaps(list)) fail(tag, `${when}: ${a} and ${b} overlap`);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 0) fail(tag, `${when}: horizontal overflow of ${o}px`);
    if (vp.w < 900) {
      const taps = await page.evaluate(() => [...document.querySelectorAll("button, input")].filter((e) => e.getClientRects().length > 0).map((e) => ({ id: e.id || e.textContent.trim(), h: e.getBoundingClientRect().height })));
      for (const t of taps) if (t.h < TAP_MIN) fail(tag, `tap target ${t.id} is ${Math.round(t.h)}px tall, under ${TAP_MIN}`);
    }
    return list.length;
  };
  const banner = await page.textContent("#mode-banner");
  if (!/SIMULATED/.test(banner ?? "")) fail(tag, "the SIMULATED label is not on the page");
  await playTo(39000);
  await page.waitForTimeout(300);
  const rej = await page.textContent("#rejection");
  if (!rej?.includes("The graft was rejected. The creature remains.")) fail(tag, `rejection line missing: ${JSON.stringify(rej)}`);
  const n1 = await layout("red CI");
  await capture(`war-room-rejected-${vp.w}x${vp.h}`, vp.w === 1920 ? "war-room-rejected-1920x1080.png" : null);
  await playTo(47000);
  await page.waitForTimeout(300);
  const feed = await page.textContent("#feed");
  if (!/healed by/.test(feed ?? "") || !/SIMULATED/.test(feed ?? "")) fail(tag, "heal row missing or not labelled SIMULATED");
  const stale = await page.textContent("#rejection");
  if (stale?.trim()) fail(tag, `stale rejection line after a later heal: ${JSON.stringify(stale)}`);
  if (!/rejected/.test(feed ?? "")) fail(tag, "the feed lost the rejection history");
  await layout("after the heal");
  await capture(`war-room-${vp.w}x${vp.h}`, `war-room-${vp.w}x${vp.h}.png`);
  console.log(`ok   [${tag}] checked=${n1}`);
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

// Import drop zone (issue #101): open the Bench on the plain page, check the zone and its privacy line, import the Trivy
// fixture through the file input and check the ranked list, that no request carries the file, and that nothing overflows.
const IMPORT_FIXTURE = join(root, "fixtures", "import", "trivy.json");
const IMPORT_CONTROLS = ["#import-drop", "#import-file", "#import-format"];

async function checkImport(browser, vp) {
  const tag = `${vp.w}x${vp.h} import`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(tag, `page error: ${e.message}`));
  const sent = [];
  page.on("request", (r) => sent.push({ url: r.url(), method: r.method(), body: r.postData() ?? "" }));
  await page.goto(base + "?theatre=2d");
  await page.waitForFunction(() => document.getElementById("plate")?.textContent.trim().length > 0 && !document.getElementById("cmd")?.disabled, null, { timeout: 30000 })
    .catch(() => fail(tag, "plate or game did not load within 30s"));
  mkdirSync(outDir, { recursive: true });
  const closed = await page.evaluate(() => document.getElementById("import-drop")?.getClientRects().length > 0);
  if (closed) fail(tag, "import drop zone is visible with the Bench closed");
  await page.click("#bench-toggle");
  const open = present(tag, await boxes(page, IMPORT_CONTROLS));
  if (open.length !== IMPORT_CONTROLS.length) fail(tag, "import drop zone is not visible with the Bench open");
  const bench = present(tag, await boxes(page, BENCH_CONTROLS));
  for (const [a, b] of findOverlaps([...open, ...bench].filter((b) => b.name !== "#import-file"))) fail(tag, `controls overlap with the import zone: ${a} and ${b}`);
  if (vp.w < 900) for (const b of open) if (b.height < TAP_MIN) fail(tag, `tap target ${b.name} is ${Math.round(b.height)}px tall, under ${TAP_MIN}`);
  const privacy = (await page.textContent("#import-privacy")) ?? "";
  if (!privacy.includes("Parsed in your browser. The file stays on your device and is not uploaded.")) fail(tag, "privacy sentence is missing");
  await page.locator("#import-drop").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `import-zone-${vp.w}x${vp.h}.png`) });

  const before = sent.length;
  await page.setInputFiles("#import-file", IMPORT_FIXTURE);
  await page.waitForSelector("#import-result:not([hidden]) .import-limbs li", { timeout: 15000 }).catch(() => fail(tag, "import result did not render"));
  const rows = await page.$$eval("#import-result .import-limbs li", (l) => l.map((e) => e.textContent));
  if (rows.length === 0) fail(tag, "import result has no ranked limbs");
  if (!rows.some((t) => /lodash/.test(t))) fail(tag, "import result does not list lodash from the Trivy fixture");
  if (rows.some((t) => /: Healthy/.test(t) && /Unknown/.test(t))) fail(tag, "an unknown limb is shown as Healthy");
  const marker = readFileSync(IMPORT_FIXTURE, "utf8");
  const after = sent.slice(before);
  for (const r of after) {
    if (r.method !== "GET" || r.body) fail(tag, `request with a body during import: ${r.method} ${r.url}`);
    if (r.url.includes("CVE-2020-8203") || r.body.includes("CVE-2020-8203") || (r.body && marker.includes(r.body))) fail(tag, `request carries file content: ${r.url}`);
    if (!r.url.startsWith(base)) fail(tag, `import made an outside request: ${r.url}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (vp.w < 900 && overflow > 0) fail(tag, `horizontal overflow of ${overflow}px`);
  await page.locator("#import-result").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `import-result-${vp.w}x${vp.h}.png`) });
  console.log(`ok   [${tag}] rows=${rows.length} requests-during-import=${after.length}`);
  await ctx.close();
}

// The Graveyard (issue #111): census mode is offline. Scene, tomb buttons, screen reader table, tooltip, panel, recording mode and list fallback.
const GY_CONTROLS = ["#load-census", "#view-toggle", "#record-on", "#scan-toggle", "#sort", "#filter-sla", "#filter-owner"];
const GY_SCAN = ["#scan", "#repos"];

async function checkGraveyard(browser, vp) {
  const tag = `${vp.w}x${vp.h} graveyard`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  const origin = new URL(base).origin;
  const outside = [];
  page.on("request", (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.push(r.url()); });
  page.on("pageerror", (e) => fail(tag, `page error: ${e.message}`));
  await page.goto(`${base}graveyard/graveyard.html`);
  await page.waitForSelector("#tombs button", { timeout: 15000 }).catch(() => fail(tag, "no tomb buttons rendered"));
  await page.waitForTimeout(400);
  const seen = await page.evaluate(() => {
    const shown = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const bgOf = (e) => { for (; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c.length === 3 || c[3] > 0.95)) return c.slice(0, 3); } return [0, 0, 0]; };
    const low = [];
    for (const e of document.body.querySelectorAll("h1,h2,p,li,label,span,a,button,div,option,td,th")) {
      if (e.closest(".sr-only") || e.classList.contains("skip") || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !shown(e)) continue;
      const a = lum(rgba(getComputedStyle(e).color).slice(0, 3)), b = lum(bgOf(e));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 4.5) low.push(`${e.tagName.toLowerCase()}${e.className ? "." + e.className : ""} ${ratio.toFixed(2)}`);
    }
    const c = document.getElementById("scene");
    const x = c.getContext("2d");
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const seenColours = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seenColours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    const tombs = [...document.querySelectorAll("#tombs button")];
    const box = (s) => { const e = document.querySelector(s); const r = e && e.getBoundingClientRect(); return r && e.getClientRects().length ? { top: r.top, bottom: r.bottom, height: r.height } : null; };
    const widths = tombs.map((t) => t.parentElement.getBoundingClientRect().width);
    return {
      stage: box("#scene-wrap"), controls: box("#controls"), legend: box("#legend"), totalsBox: box("#totals"),
      totals: document.getElementById("totals").textContent,
      legendText: (document.getElementById("legend") || { textContent: "" }).textContent,
      firstTomb: tombs[0] ? tombs[0].getBoundingClientRect().top : null,
      vh: innerHeight, scrollH: document.documentElement.scrollHeight,
      maxTombW: Math.max(0, ...widths),
      tombs: tombs.length,
      small: tombs.filter((t) => { const r = t.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length,
      rows: document.querySelectorAll("#sr-body tr").length,
      caption: !!document.querySelector("#sr-table caption"),
      colours: seenColours.size,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lang: document.documentElement.lang,
      main: document.querySelectorAll("main").length,
      low: [...new Set(low)],
      text: document.body.innerText,
    };
  });
  if (seen.tombs < 5) fail(tag, `expected at least 5 tomb buttons, found ${seen.tombs}`);
  if (seen.rows !== seen.tombs) fail(tag, `screen reader table has ${seen.rows} rows for ${seen.tombs} tombs`);
  if (!seen.caption) fail(tag, "screen reader table has no caption");
  if (seen.colours < 4) fail(tag, "the scene canvas looks blank");
  if (seen.overflow > 0) fail(tag, `horizontal overflow of ${seen.overflow}px`);
  if (!seen.lang || seen.main !== 1) fail(tag, "html lang or the single main landmark is missing");
  if (seen.low.length) fail(tag, `text contrast under 4.5:1: ${seen.low.join(", ")}`);
  if (/\bworst\b/i.test(seen.text)) fail(tag, "the page uses a ranking label");
  if (!/\b\d[\d,]* repos\b/.test(seen.totals) || !/limbs/.test(seen.totals) || !/findings/.test(seen.totals) || !/monsters/.test(seen.totals)) fail(tag, `the totals header is missing repos, limbs, findings or monsters: "${seen.totals}"`);
  for (const w of ["risk", "possessed", "SLA", "unowned"]) if (!new RegExp(w, "i").test(seen.legendText)) fail(tag, `the legend does not explain "${w}"`);
  if (!seen.legend || !seen.totalsBox) fail(tag, "the legend or the totals header is not visible");
  if (vp.w >= 900 && vp.h >= 560) {
    if (!seen.stage || seen.stage.height < vp.h * 0.6) fail(tag, `the scene is ${Math.round(seen.stage?.height ?? 0)}px tall, under 60% of the ${vp.h}px viewport`);
    if (seen.stage && seen.stage.bottom < vp.h - 40) fail(tag, `the scene ends at ${Math.round(seen.stage.bottom)}px and does not fill the viewport (${vp.h}px)`);
    if (seen.controls && seen.controls.bottom > vp.h * 0.2) fail(tag, `the controls reach ${Math.round(seen.controls.bottom)}px down, over 20% of the viewport`);
    if (seen.scrollH > vp.h + 1) fail(tag, `the page scrolls (${seen.scrollH}px in ${vp.h}px); the scene should fill one screen`);
    if (seen.maxTombW < 60) fail(tag, `the biggest tombstone is ${Math.round(seen.maxTombW)}px wide, too small to read`);
  } else {
    if (!seen.stage || seen.stage.top > vp.h * 0.3) fail(tag, `the scene starts at ${Math.round(seen.stage?.top ?? 9999)}px, not at the top of the screen`);
    if (seen.firstTomb === null || seen.firstTomb > vp.h * 0.6) fail(tag, "no tombstone is above the fold");
    if (seen.controls && seen.stage && seen.controls.top < seen.stage.top) fail(tag, "the controls are above the scene on a narrow screen");
  }
  if (vp.w < 900 && seen.small) fail(tag, `${seen.small} tomb buttons are under ${TAP_MIN}px`);

  const ctl = present(tag, await boxes(page, GY_CONTROLS));
  for (const [a, b] of findOverlaps(ctl)) fail(tag, `controls overlap: ${a} and ${b}`);
  if (vp.w < 900) for (const b of ctl) if (b.height < TAP_MIN && b.name !== "#repos") fail(tag, `tap target ${b.name} is ${Math.round(b.height)}px tall, under ${TAP_MIN}`);

  await page.click("#scan-toggle");
  const scan = present(tag, await boxes(page, GY_SCAN));
  if (scan.length !== GY_SCAN.length) fail(tag, "the scan form did not open");
  for (const [a, b] of findOverlaps(scan)) fail(tag, `scan controls overlap: ${a} and ${b}`);
  if (vp.w < 900) for (const b of scan) if (b.height < TAP_MIN && b.name !== "#repos") fail(tag, `tap target ${b.name} is ${Math.round(b.height)}px tall, under ${TAP_MIN}`);
  await page.click("#scan-toggle");

  // Tab reaches the tombs.
  await page.focus("#filter-owner");
  let reached = 0;
  for (let i = 0; i < 12 && reached === 0; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => !!document.activeElement?.closest("#tombs"))) reached++;
  }
  if (!reached) fail(tag, "Tab does not reach a tomb button");

  if (!vp.touch) {
    const b = await page.evaluate(() => { const r = document.querySelector("#tombs button").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(b.x - 1, b.y - 1);
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.waitForFunction(() => { const t = document.getElementById("tip"); return t && !t.hidden && t.textContent.trim().length > 0; }, null, { timeout: 3000 }).catch(() => fail(tag, "no tooltip on hover"));
  }

  await page.locator("#tombs button").first().click({ force: true });
  await page.waitForSelector("#panel:not([hidden])", { timeout: 3000 }).catch(() => fail(tag, "the repo panel did not open"));
  const panel = ((await page.textContent("#panel")) ?? "").toLowerCase();
  if (!/dry[ -]run/.test(panel)) fail(tag, "the repo panel does not say dry run");
  await page.screenshot({ path: join(outDir, `graveyard-panel-${vp.w}x${vp.h}.png`) });
  await page.keyboard.press("Escape");
  if (await page.locator("#panel").isVisible()) fail(tag, "Escape did not close the panel");

  await page.click("#view-toggle");
  const cards = await page.locator("#cards li").count();
  if (cards !== seen.tombs || !(await page.locator("#list-wrap").isVisible()) || (await page.locator("#scene-wrap").isVisible())) fail(tag, "the 2D list fallback toggle does not work");
  await page.click("#view-toggle");

  mkdirSync(outDir, { recursive: true });
  await page.evaluate(() => { document.activeElement?.blur(); document.getElementById("tip").hidden = true; scrollTo(0, 0); document.getElementById("scene-wrap").scrollTo(0, 0); });
  await page.mouse.move(1, 1);
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById("tip").hidden = true; });
  const shot = join(outDir, `graveyard-${vp.w}x${vp.h}.png`);
  await page.screenshot({ path: shot });
  if (process.env.VISUAL_QA_COPY_DOCS === "1" && ((vp.w === 1920 && vp.h === 1080) || vp.w === 390)) {
    mkdirSync(imgDir, { recursive: true });
    copyFileSync(shot, join(imgDir, `graveyard-${vp.w}x${vp.h}.png`));
  }

  await page.goto(`${base}graveyard/graveyard.html?record=1`);
  await page.waitForSelector("#tombs button", { timeout: 15000 }).catch(() => fail(tag, "recording mode shows no tombs"));
  const hidden = await page.evaluate(() => ["#controls", "#record-on"].every((s) => { const e = document.querySelector(s); return !e || e.getClientRects().length === 0; }));
  if (!hidden) fail(tag, "recording mode does not hide the controls");
  if (outside.length) fail(tag, `requests left the origin in census mode: ${outside.join(", ")}`);
  console.log(`ok   [${tag}] tombs=${seen.tombs} rows=${seen.rows}`);
  await ctx.close();
}

let browser;
try {
  browser = await chromium.launch(launchOptions());
  for (const vp of VIEWPORTS) {
    await check(browser, vp, "");
    if (vp.w >= 900) await check(browser, vp, "?theatre=2d");
  }
  for (const vp of VIEWPORTS) await checkImport(browser, vp);
  for (const vp of JUDGE_VIEWPORTS) await checkJudge(browser, vp);
  for (const vp of VIEWPORTS) await checkCard(browser, vp);
  for (const vp of VIEWPORTS) await checkScanError(browser, vp);
  if (process.env.VISUAL_QA_COPY_DOCS === "1") await captureCards(browser);
  for (const vp of WAR_VIEWPORTS) await checkWarRoom(browser, vp);
  for (const vp of VIEWPORTS) await checkGraveyard(browser, vp);
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
