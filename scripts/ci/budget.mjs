// Resource budget (issue #232): sum the JS bytes requested on first load of _site/index.html
// (script tags plus static imports, never dynamic import()), assert three.js and the 3D stage are
// not in that set, assert fonts are woff2 under a size cap, and fail when a budget is exceeded.
// Run after `npm run build:site`. Dev and CI only, excluded from npm pack.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, posix } from "node:path";
import { pathToFileURL } from "node:url";

// Measured on the current _site, plus 10% (see docs/PERFORMANCE.md).
export const BUDGETS = {
  firstLoadJsBytes: 320500, // measured 291329 B
  fontBytesEach: 24100, // largest measured 21908 B
  fontBytesTotal: 47400, // measured 43076 B
};

const LAZY = [/(^|\/)vendor\/three[^/]*\.js$/, /(^|\/)theatre\/stage\.js$/];

/**
 * Pure check. `files` is [{ path, bytes }] for the first-load JS set, `fonts` is [{ path, bytes }].
 * Returns { ok, failures, totalJs, fontTotal }.
 */
export function checkBudget(files, fonts, budgets = BUDGETS) {
  const failures = [];
  const totalJs = files.reduce((n, f) => n + f.bytes, 0);
  const fontTotal = fonts.reduce((n, f) => n + f.bytes, 0);
  for (const f of files) {
    if (LAZY.some((re) => re.test(f.path))) failures.push(`${f.path} must be lazy-loaded, but is in the first-load set`);
  }
  if (totalJs > budgets.firstLoadJsBytes) failures.push(`first-load JS ${totalJs} B exceeds budget ${budgets.firstLoadJsBytes} B`);
  for (const f of fonts) {
    if (!f.path.endsWith(".woff2")) failures.push(`${f.path} is not woff2`);
    if (f.bytes > budgets.fontBytesEach) failures.push(`${f.path} ${f.bytes} B exceeds font cap ${budgets.fontBytesEach} B`);
  }
  if (fontTotal > budgets.fontBytesTotal) failures.push(`fonts ${fontTotal} B exceed budget ${budgets.fontBytesTotal} B`);
  return { ok: failures.length === 0, failures, totalJs, fontTotal };
}

const STATIC_IMPORT = /(?:^|[\n;])\s*(?:import|export)\s*(?:[^"';()]*?\sfrom\s*)?["']([^"']+)["']/g;

/** Static import specifiers (relative only) of a JS source. Dynamic import() is ignored. */
export function staticImports(src) {
  const out = [];
  for (const m of src.matchAll(STATIC_IMPORT)) if (m[1].startsWith(".")) out.push(m[1]);
  return out;
}

/** Local script src values from index.html. */
export function scriptSrcs(html) {
  return [...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
}

export function collectFirstLoad(site) {
  const html = readFileSync(join(site, "index.html"), "utf8");
  const seen = new Map();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    const file = join(site, rel);
    if (!existsSync(file)) throw new Error(`missing ${rel} referenced on first load`);
    seen.set(rel, statSync(file).size);
    for (const spec of staticImports(readFileSync(file, "utf8"))) visit(posix.normalize(posix.join(posix.dirname(rel), spec)));
  };
  for (const s of scriptSrcs(html)) visit(posix.normalize(s));
  return [...seen].map(([path, bytes]) => ({ path, bytes }));
}

export function collectFonts(site) {
  const dir = join(site, "fonts");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => !/\.txt$/i.test(f))
    .map((f) => ({ path: `fonts/${f}`, bytes: statSync(join(dir, f)).size }));
}

function main() {
  const site = resolve(import.meta.dirname, "..", "..", "_site");
  if (!existsSync(join(site, "index.html"))) {
    console.error("budget: _site/index.html not found, run npm run build:site first");
    process.exit(2);
  }
  const files = collectFirstLoad(site);
  const fonts = collectFonts(site);
  const r = checkBudget(files, fonts);
  const kb = (n) => (n / 1024).toFixed(1).padStart(8);
  for (const f of files) console.log(`${kb(f.bytes)} KB  ${f.path}`);
  console.log(`${kb(r.totalJs)} KB  first-load JS (budget ${(BUDGETS.firstLoadJsBytes / 1024).toFixed(1)} KB)`);
  console.log(`${kb(r.fontTotal)} KB  fonts (budget ${(BUDGETS.fontBytesTotal / 1024).toFixed(1)} KB, each <= ${(BUDGETS.fontBytesEach / 1024).toFixed(1)} KB)`);
  for (const f of r.failures) console.error(`FAIL: ${f}`);
  if (!r.ok) process.exit(1);
  console.log("budget: ok");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
