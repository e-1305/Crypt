// Visual QA (issue #56): serve _site/ and load it at three viewports in headless Chromium.
// Fails on overlapping main controls, overlapping raid stats, an empty plate, and (at 390 wide)
// a non-2D default, small tap targets or horizontal overflow. Writes screenshots to out/visual-qa/
// and, only when VISUAL_QA_COPY_DOCS=1, copies them to docs/img/ for the PR description.
// Dev and CI only, excluded from npm pack.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, extname, resolve, sep } from "node:path";
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

const CONTROLS = ["#sim-green", "#sim-red", "#raid-start", "#hc-toggle", "#sound-toggle", "#record-toggle", "#cmd", "#try-chip", "#download", "#view-3d", "#install-copy", "#manual-link"];
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

  const all = present(tag, await boxes(page, CONTROLS));
  for (const [a, b] of findOverlaps(all)) fail(tag, `controls overlap: ${a} and ${b}`);
  const stats = present(tag, await boxes(page, RAID_STATS));
  for (const [a, b] of findOverlaps(stats)) fail(tag, `raid stats overlap: ${a} and ${b}`);

  const theatre = await page.evaluate(() => document.documentElement.dataset.theatre ?? "");
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

let browser;
try {
  browser = await chromium.launch(launchOptions());
  for (const vp of VIEWPORTS) {
    await check(browser, vp, "");
    if (vp.w >= 900) await check(browser, vp, "?theatre=2d");
  }
} finally {
  await browser?.close();
  server.close();
}
if (failures.length) { console.error(`\n${failures.length} visual QA failure(s)`); process.exit(1); }
console.log("visual QA passed");
