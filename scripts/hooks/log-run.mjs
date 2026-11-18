// Append one run line to docs/evidence/hook-runs.jsonl. Called by run-logged.sh.
// Usage: node log-run.mjs <hook> <exit> <outputFile> <payloadFile> [file ...]
// The payload (Kiro event JSON) is read to find the trigger and a file path; it is never written out.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const [hook, exit, outFile, payloadFile, ...args] = process.argv.slice(2);

const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

const TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{12,}|Bearer\s+\S+)/g;
const clean = (s, n) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").replace(TOKEN, "[redacted]").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

let event = null;
try {
  event = JSON.parse(read(payloadFile));
} catch {
  /* no event: a hand run */
}

function strings(v, key, out) {
  if (typeof v === "string") out.push([key, v]);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, k, out);
  return out;
}
const found = event ? strings(event, "", []) : [];
const byKey = (keys) => found.find(([k, v]) => keys.includes(k) && v)?.[1];
const pathLike = found.map(([, v]) => v).find((v) => /\.(ts|tsx|js|mjs|json|md|html|css)$/.test(v));

let trigger = process.env.CRYPT_HOOK_TRIGGER || byKey(["trigger", "hookTrigger", "event", "eventType"]) || "manual";
trigger = clean(trigger, 40) || "manual";
let file = args[0] ?? (process.env.CRYPT_HOOK_FILE || pathLike) ?? "";
if (file.startsWith("/")) file = relative(root, file);
file = clean(file, 200);

const lines = read(outFile).split("\n").map((l) => l.trim()).filter(Boolean);
const summary = clean(lines[lines.length - 1] ?? "no output", 160);

const line = JSON.stringify({ ts: new Date().toISOString(), hook, trigger, file, exit: Number(exit), summary });
const out = join(root, "docs", "evidence", "hook-runs.jsonl");
mkdirSync(dirname(out), { recursive: true });
appendFileSync(out, line + "\n");
