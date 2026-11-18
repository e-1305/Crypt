// Dev-only: plays judge mode (?judge=1) in headless Chromium and screenshots t of about 30 s to docs/img/judge-mode.png.
// Usage: PLAYWRIGHT_CORE=... CHROMIUM=... BASE_URL=http://127.0.0.1:8099/ node scripts/playtest/judge-mode-shot.mjs
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8099/";
const SHOT = new URL("../../docs/img/judge-mode.png", import.meta.url).pathname;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM, headless: true,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(BASE + "?judge=1" + (process.env.QUERY ?? ""));
const t0 = Date.now();
const at = async (s, f) => { await page.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0))); await f(); };
await at(2, async () => console.log("t2 title:", await page.locator("#judge-title").isVisible()));
await at(9, async () => console.log("t9 counter:", await page.locator("#judge-counter").textContent()));
await at(20, async () => console.log("t20 transcript tail:", (await page.locator("#transcript").innerText()).slice(-200).replace(/\n/g, " | ")));
await at(30, async () => { await page.screenshot({ path: SHOT }); console.log("t30 cmd:", await page.inputValue("#cmd"), "| payload:", (await page.locator("#payload").innerText()).slice(0, 60)); });
await at(36, async () => console.log("t36 sim-label:", await page.locator("#sim-label").textContent()));
await at(46, async () => console.log("t46 stage gone:", (await page.locator("#judge-stage").count()) === 0, "focused:", await page.evaluate(() => document.activeElement && document.activeElement.id), "replay:", await page.locator("#judge-replay").count()));
console.log("errors:", errs);
await browser.close();
