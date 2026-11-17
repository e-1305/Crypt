// Dev-only judge harness. Not shipped in the npm package (see "files" in package.json).
// Drives the built site (npm run web) with headless Chromium and writes screenshots and
// a JSON report to out/playtest/. Needs playwright-core, which is NOT a dependency of CRYPT:
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/playtest/judge.mjs
// Env: BASE_URL (default http://127.0.0.1:8099/), CHROMIUM (path to the chromium binary).
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8099/";
const OUT = join(process.cwd(), "out", "playtest");
mkdirSync(OUT, { recursive: true });

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const tries = [process.env.PLAYWRIGHT_CORE, "playwright-core", join(process.cwd(), "node_modules/playwright-core")].filter(Boolean);
  for (const t of tries) {
    try { return req(t); } catch { /* try next */ }
  }
  console.error("playwright-core not found. Set PLAYWRIGHT_CORE to its install directory.");
  process.exit(3);
}

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const root = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(root)) return undefined;
  // The headless shell starts where full Chromium dies on crashpad in containers.
  const dir = readdirSync(root).find((d) => d.startsWith("chromium_headless_shell-"));
  if (!dir) return undefined;
  const sub = readdirSync(join(root, dir)).find((d) => d.startsWith("chrome-headless-shell"));
  return sub ? join(root, dir, sub, "chrome-headless-shell") : undefined;
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});

const report = { base: BASE, scenarios: {} };

async function scenario(name, opts, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  const reqs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", async (r) => {
    try { reqs.push({ url: r.url().replace(BASE, "/"), bytes: (await r.body()).length }); } catch { /* ignore */ }
  });
  const out = { errors };
  try {
    await fn(page, out);
  } catch (e) {
    out.failure = String(e.message ?? e);
  }
  out.requests = reqs.length;
  out.totalBytes = reqs.reduce((a, r) => a + r.bytes, 0);
  out.biggest = [...reqs].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  report.scenarios[name] = out;
  await ctx.close();
}

const shot = (page, n) => page.screenshot({ path: join(OUT, `${n}.png`) });
const text = (page, sel) => page.locator(sel).first().innerText({ timeout: 2000 }).catch(() => null);

// 1. Landing, default (3D bench if WebGL2 works).
await scenario("landing-default", {}, async (page, out) => {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  out.h1 = await text(page, "h1");
  out.subtitle = await text(page, ".subtitle");
  out.msToPitchVisible = Date.now() - t0;
  await page.waitForTimeout(6000);
  out.bodyClass = await page.evaluate(() => document.body.className);
  out.webgl2 = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  out.canvasCount = await page.locator("canvas").count();
  out.transcript = (await text(page, "#transcript"))?.slice(0, 600);
  out.plateSummary = await text(page, "#plate-summary");
  out.visibleText = (await page.evaluate(() => document.body.innerText)).slice(0, 1500);
  await shot(page, "01-landing-default");
});

// 2. Plain 2D page.
await scenario("landing-2d", {}, async (page, out) => {
  await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  out.transcript = (await text(page, "#transcript"))?.slice(0, 800);
  out.plate = (await text(page, "#plate"))?.slice(0, 600);
  out.plateSummary = await text(page, "#plate-summary");
  out.tutorialVisible = await page.locator("#tutorial").isVisible();
  out.tutorial = await text(page, "#tutorial");
  out.dailyBanner = await text(page, "#daily-banner");
  await shot(page, "02-landing-2d");
  // Demo path: how many actions from landing to a dry-run payload.
  await page.fill("#cmd", "examine");
  await page.press("#cmd", "Enter");
  await page.waitForTimeout(800);
  await page.fill("#cmd", "graft jquery");
  await page.press("#cmd", "Enter");
  await page.waitForTimeout(2500);
  out.afterGraftTranscript = (await text(page, "#transcript"))?.slice(-900);
  out.payload = (await text(page, "#payload"))?.slice(0, 900);
  out.eventLog = await text(page, "#event-log");
  await shot(page, "03-after-graft-2d");
});

// 3. Keyboard only: tab order from load, then play without the mouse.
await scenario("keyboard-only", {}, async (page, out) => {
  await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const stops = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return "(body)";
      const cs = getComputedStyle(e);
      return `${e.tagName.toLowerCase()}#${e.id || ""} "${(e.innerText || e.getAttribute("aria-label") || e.placeholder || "").slice(0, 40)}" outline=${cs.outlineStyle}/${cs.outlineWidth}`;
    }));
  }
  out.tabStops = stops;
  await page.focus("#cmd");
  await page.keyboard.type("look");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  out.focusAfterEnter = await page.evaluate(() => document.activeElement?.id);
  out.lookWorked = ((await text(page, "#transcript")) ?? "").length > 0;
  await shot(page, "04-keyboard");
});

// 4. Reduced motion.
await scenario("reduced-motion", { reducedMotion: "reduce" }, async (page, out) => {
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForTimeout(3000);
  out.canvasCount = await page.locator("canvas").count();
  out.twoDVisible = await page.locator("#cmd").isVisible();
  out.rafAnimations = await page.evaluate(() => document.getAnimations().length);
  out.tutorialVisible = await page.locator("#tutorial").isVisible();
  await shot(page, "05-reduced-motion");
});

// 5. High-contrast reader mode.
await scenario("high-contrast", {}, async (page, out) => {
  await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  await page.click("#hc-toggle");
  await page.waitForTimeout(500);
  out.pressed = await page.getAttribute("#hc-toggle", "aria-pressed");
  out.announcer = await text(page, "#announcer");
  await shot(page, "06-high-contrast");
});

// 6. Mobile viewport.
await scenario("mobile", { viewport: { width: 390, height: 780 }, isMobile: true }, async (page, out) => {
  await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  out.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  out.cmdInViewport = await page.evaluate(() => {
    const r = document.getElementById("cmd")?.getBoundingClientRect();
    return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight } : null;
  });
  await shot(page, "07-mobile");
});

// 7. Simulated CI + raid.
await scenario("sim-and-raid", {}, async (page, out) => {
  await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.fill("#cmd", "graft jquery");
  await page.press("#cmd", "Enter");
  await page.waitForTimeout(1500);
  await page.click("#sim-green");
  await page.waitForTimeout(2500);
  out.simLabel = await text(page, "#sim-label");
  await page.click("#raid-start");
  await page.waitForTimeout(1500);
  out.raidState = await text(page, "#raid-state");
  out.raidScore = await text(page, "#raid-score");
  await shot(page, "08-sim-raid");
});

await browser.close();
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
