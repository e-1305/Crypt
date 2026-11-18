// Dev only: serve _site/, paste a real public npm repo into the page in headless Chromium and screenshot the result.
// Usage: node scripts/ci/paste-shot.mjs <owner/repo> [out.png]   (needs network: raw.githubusercontent.com and api.osv.dev)
import { createRequire } from "node:module";
import { join, extname, resolve, sep } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const root = resolve(import.meta.dirname, "..", "..");
const site = join(root, "_site");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
const repo = process.argv[2];
const out = process.argv[3] ?? join(root, "docs", "img", "paste-your-repo.png");
const server = http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  const f = resolve(site, "." + (p.endsWith("/") ? p + "index.html" : p));
  if (!f.startsWith(site + sep) || !existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", types[extname(f)] || "application/octet-stream");
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/?theatre=2d`);
  await page.fill("#paste-url", `https://github.com/${repo}`);
  const t0 = Date.now();
  await page.press("#paste-url", "Enter");
  await page.waitForFunction(() => /^(Done|Enter|The |GitHub|No |This|Wait|Could|CRYPT)/.test(document.getElementById("paste-status").textContent), null, { timeout: 60000 });
  console.log(`status after ${Date.now() - t0} ms:`, await page.textContent("#paste-status"));
  if (!(await page.isVisible("#paste-result"))) process.exitCode = 2;
  else await page.locator("#paste").screenshot({ path: out });
} finally {
  await browser.close();
  server.close();
}
