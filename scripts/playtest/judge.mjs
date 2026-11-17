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

// Where the first-viewport items sit, and whether the page scrolled on load (Round 1 finding F1).
const aboveFold = (page) => page.evaluate(() => {
  const box = (sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), inViewport: r.top >= 0 && r.bottom <= innerHeight } : null;
  };
  const rec = document.getElementById("record-toggle")?.getBoundingClientRect();
  const h1 = document.querySelector("h1")?.getBoundingClientRect();
  return {
    scrollY: Math.round(scrollY), viewportHeight: innerHeight,
    h1: box("h1"), subtitle: box(".subtitle"), pitch: box("#pitch"), installCmd: box("#install-cmd"), kiroLink: box("#kiro-link"), cmd: box("#cmd"),
    recordOverlapsHeading: !!(rec && h1 && rec.left < h1.right && h1.left < rec.right && rec.top < h1.bottom && h1.top < rec.bottom),
    recordName: document.getElementById("record-toggle")?.getAttribute("aria-label"),
  };
});
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
  out.aboveFold = await aboveFold(page);
  out.plateFooter = (await text(page, "#plate"))?.split("\n").filter((l) => /DEPENDENCIES|LIMBS THAT SPAWN/.test(l));
  out.plateLegend = await text(page, "#plate-legend");
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
  // Focus starts in the game input, so walk backwards with Shift+Tab to list every control above it, nearest first.
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Shift+Tab");
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
  out.aboveFold = await aboveFold(page);
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
  out.plateAfterGreen = (await text(page, "#plate-summary"));
  out.eventLogAfterGreen = await text(page, "#event-log");
  out.announcerAfterGreen = await text(page, "#announcer");
  out.tutorialAfterGreen = await text(page, "#tutorial-step");
  await page.click("#raid-start");
  await page.waitForTimeout(1500);
  out.raidState = await text(page, "#raid-state");
  out.raidScore = await text(page, "#raid-score");
  await shot(page, "08-sim-raid");
});

// 8. SEAL on the page: badge, refused graft, Unseal.
await scenario("seal", {}, async (page, out) => {
  await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  out.badgeBefore = await page.locator("#seal-badge").isVisible();
  for (const c of ["seal crypt", "graft jquery"]) {
    await page.fill("#cmd", c);
    await page.press("#cmd", "Enter");
    await page.waitForTimeout(800);
  }
  out.badgeAfterSeal = await text(page, "#seal-badge");
  out.refusal = (await text(page, "#transcript"))?.slice(-200);
  await shot(page, "09-sealed");
  await page.click("#unseal");
  out.badgeAfterUnseal = await page.locator("#seal-badge").isVisible();
});

// 9. High-contrast announcement and the raid board on the bench.
await scenario("bench-board", {}, async (page, out) => {
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForTimeout(6000);
  out.bodyClass = await page.evaluate(() => document.body.className);
  await shot(page, "10-bench-board");
  await page.click("#bench-drawer-toggle").catch(() => {});
  await page.waitForTimeout(500);
  out.drawerInstall = await text(page, "#bench-install-cmd");
  await shot(page, "11-bench-drawer");
});


// Round 2. Each check records `ok` so the report shows pass or fail, not only numbers.
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// 10. Prompt in reach (R2 item 5): #cmd position at both viewports, tutorial open and closed, and the tutorial height.
for (const [label, viewport, mobile] of [["desktop", { width: 1280, height: 720 }, false], ["mobile", { width: 390, height: 780 }, true]]) {
  await scenario(`prompt-in-reach-${label}`, { viewport, isMobile: mobile }, async (page, out) => {
    await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const rect = (sel) => page.evaluate((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), vh: innerHeight } : null; }, sel);
    out.tutorialOpen = { cmd: await rect("#cmd"), tutorial: await rect("#tutorial") };
    out.tutorialClosed = null;
    await page.click("#tutorial-skip");
    await page.waitForTimeout(300);
    out.tutorialClosed = { cmd: await rect("#cmd") };
    const c = out.tutorialClosed.cmd;
    out.checks = {
      cmdInFirstViewportAfterTutorialClosed: !!c && c.top >= 0 && c.bottom <= c.vh,
      tutorialAtMost25PercentOnDesktop: mobile ? "not required on mobile" : out.tutorialOpen.tutorial.height <= out.tutorialOpen.tutorial.vh * 0.25,
    };
    await shot(page, `12-prompt-${label}-closed`);
  });
}

// 11. Try chip: fills the box, does not run, announces.
await scenario("try-chip", {}, async (page, out) => {
  await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  out.chipText = await text(page, "#try-chip");
  const before = (await text(page, "#event-log")) ?? "";
  await page.focus("#try-chip");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  out.cmdValue = await page.inputValue("#cmd");
  out.announcer = await text(page, "#announcer");
  out.payloadAfterChip = (await text(page, "#payload")) ?? "";
  out.eventLogUnchanged = ((await text(page, "#event-log")) ?? "") === before;
  out.checks = { fills: out.cmdValue === "GRAFT JQUERY", announces: /Command box filled with GRAFT JQUERY/.test(out.announcer ?? ""), doesNotRun: out.eventLogUnchanged && out.payloadAfterChip === "" };
});

// 12. Tutorial after green: the strip must move on from step 1.
await scenario("tutorial-after-green", {}, async (page, out) => {
  await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  out.before = await text(page, "#tutorial-progress");
  await page.fill("#cmd", "GRAFT JQUERY");
  await page.press("#cmd", "Enter");
  await page.waitForTimeout(1200);
  await page.click("#sim-green");
  await page.waitForTimeout(2500);
  out.after = await text(page, "#tutorial-progress");
  out.afterStep = await text(page, "#tutorial-step");
  out.checks = { advanced: out.before !== out.after && /step 6 of 7/i.test(out.after ?? "") && /SEAL CRYPT/.test(out.afterStep ?? "") };
});

// 13. 3D caption: present on the first frame, not over any visible control, hidden by Recording mode.
await scenario("caption-3d", {}, async (page, out) => {
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForTimeout(6000);
  out.bodyClass = await page.evaluate(() => document.body.className);
  const boxes = () => page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none"; };
    const cap = document.getElementById("theatre-caption");
    const b = (e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.textContent.trim().slice(0, 24), left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const others = [...document.querySelectorAll("body.theatre button, body.theatre a[id], #bench-drawer, #seal-badge")].filter(vis).filter((e) => !cap.contains(e)).map(b);
    return { caption: vis(cap) ? b(cap) : null, others, text: cap.textContent };
  });
  const on = await boxes();
  out.caption = on.caption; out.captionText = on.text;
  out.collisions = on.caption ? on.others.filter((o) => overlaps(on.caption, o)).map((o) => o.id) : ["caption not visible"];
  await shot(page, "13-caption-3d");
  if (process.env.SHOT_README === "1") {
    mkdirSync(join(process.cwd(), "docs", "img"), { recursive: true });
    await page.screenshot({ path: join(process.cwd(), "docs", "img", "bench-3d.png") });
  }
  await page.goto(BASE + "?record=1", { waitUntil: "load" });
  await page.waitForTimeout(4000);
  out.hiddenInRecording = (await boxes()).caption === null;
  out.checks = { visibleOn3D: !!on.caption && out.bodyClass.includes("theatre"), noCollisions: out.collisions.length === 0, hiddenInRecording: out.hiddenInRecording };
});

// 14. How it works: clicks from "/" (and from the bench drawer) to each fact, and every .kiro link on the page.
await scenario("how-it-works-clicks", {}, async (page, out) => {
  const targets = { zmachine: /Why a Z-machine/, failsafe: /The failsafe/, humanMerge: /A person merges every pull request/, specs: /\.kiro\/specs\/$/, steering: /\.kiro\/steering\/$/, hooks: /\.kiro\/hooks\/$/, agents: /\.kiro\/agents\/$/ };
  await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.click("#kiro-link"); // click 1
  await page.waitForLoadState("load");
  out.url = page.url().replace(BASE, "/");
  const section = await page.evaluate(() => {
    const h = document.getElementById("how-it-works");
    const words = []; let e = h?.nextElementSibling;
    while (e && e.tagName !== "H2") { words.push(e.innerText); e = e.nextElementSibling; }
    return { present: !!h, words: words.join(" ").split(/\s+/).filter(Boolean).length };
  });
  out.section = section;
  const links = await page.evaluate(() => [...document.querySelectorAll("#how-it-works ~ * a")].map((a) => ({ text: a.textContent, href: a.href })));
  const body = await page.evaluate(() => document.body.innerText);
  const clicks = {};
  for (const [k, re] of Object.entries(targets)) {
    if (k === "zmachine" || k === "failsafe" || k === "humanMerge") clicks[k] = re.test(body) ? 1 : null; // on the section: click 1 only
    else { const l = links.find((x) => re.test(x.href)); clicks[k] = l ? 2 : null; } // one more click on the link
  }
  out.clicksFromLanding = clicks;
  out.kiroLinks = links.filter((l) => /\.kiro\//.test(l.href)).map((l) => l.href.replace(/^.*\/e-1305\/Crypt\//, ""));
  await shot(page, "14-how-it-works");
  // Bench drawer: toggle (1), link (2).
  const ctx2 = page.context();
  const p2 = await ctx2.newPage();
  await p2.goto(BASE, { waitUntil: "load" });
  await p2.waitForTimeout(5000);
  await p2.click("#bench-drawer-toggle");
  out.drawerLinkHref = await p2.getAttribute("#bench-kiro", "href");
  out.checks = { allWithinTwoClicks: Object.values(clicks).every((n) => n !== null && n <= 2), sectionAtMost450Words: section.words <= 450, drawerLinkReachable: out.drawerLinkHref === "manual.html#how-it-works" };
});

// 15. axe-core on the 2D page, when AXE_CORE points at axe.min.js.
if (process.env.AXE_CORE) {
  await scenario("axe-2d", {}, async (page, out) => {
    await page.goto(BASE + "?theatre=off", { waitUntil: "load" });
    await page.waitForTimeout(2500);
    await page.addScriptTag({ path: process.env.AXE_CORE });
    const r = await page.evaluate(() => axe.run());
    out.violations = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")) }));
    out.passes = r.passes.length;
    out.axeVersion = await page.evaluate(() => axe.version);
  });
}


await browser.close();
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
