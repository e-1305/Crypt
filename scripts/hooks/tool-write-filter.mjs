// PostToolUse(write) filter. Reads the Kiro session context JSON on STDIN, finds the written path
// and applies the same regex the PostFileSave twin uses as its matcher.
// Usage: node tool-write-filter.mjs <regex> < payload.json
// Prints the first matching path (relative to the repo root) and exits 0; exits 1 when no path matches.
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");

/** Every string value in a parsed JSON value. */
function strings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
  return out;
}

/** First path in `payload` (JSON text) that matches `re`, relative to `root`; "" when none. Exported for tests. */
export function matchedPath(payload, re, base = root) {
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return "";
  }
  for (const s of strings(event)) {
    if (s.length > 300 || /\s/.test(s)) continue;
    const rel = s.startsWith("/") ? relative(base, s) : s;
    if (rel.startsWith("..")) continue;
    if (re.test(rel)) return rel;
  }
  return "";
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const re = new RegExp(process.argv[2] ?? "$^");
  let input = "";
  try {
    input = readFileSync(0, "utf8");
  } catch {
    /* no STDIN */
  }
  const p = matchedPath(input, re);
  if (!p) process.exit(1);
  console.log(p);
}
