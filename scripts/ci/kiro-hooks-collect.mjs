// Marks the hook-run lines that Kiro CLI produced in CI. Used by .github/workflows/kiro-hooks.yml.
// Usage: node scripts/ci/kiro-hooks-collect.mjs <baselineLineCount>
// It never creates a line. It only adds "source":"kiro-cli-ci" to lines the hook wrapper wrote after the baseline.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const SOURCE = "kiro-cli-ci";

/**
 * Pure step. `text` is the log file content, `baseline` the number of lines it had before the session.
 * Returns the new content and a per-hook count, or an error message.
 */
export function collect(text, baseline) {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const fresh = lines.slice(baseline);
  if (fresh.length === 0) return { error: "no hook fired, nothing recorded" };
  const counts = {};
  const out = [];
  for (const l of fresh) {
    let o;
    try {
      o = JSON.parse(l);
    } catch {
      return { error: `a new line is not valid JSON: ${l.slice(0, 80)}` };
    }
    if (o.trigger === "manual") {
      const valid = fresh.filter((x) => { try { return JSON.parse(x).trigger !== "manual"; } catch { return false; } });
      return { error: `trigger not recognised for hook "${o.hook}" (file "${o.file}"): the line is not Kiro evidence, nothing rewritten. The whole run is discarded, including ${valid.length} new line(s) with a recognised trigger; they stay in the uploaded docs/evidence/hook-runs.jsonl artifact` };
    }
    out.push(JSON.stringify({ ...o, source: SOURCE }));
    counts[o.hook] = (counts[o.hook] ?? 0) + 1;
  }
  return { text: [...lines.slice(0, baseline), ...out].join("\n") + "\n", counts };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const baseline = Number(process.argv[2]);
  if (!Number.isInteger(baseline) || baseline < 0) {
    console.error("usage: node scripts/ci/kiro-hooks-collect.mjs <baselineLineCount>");
    process.exit(2);
  }
  const file = join(resolve(import.meta.dirname, "..", ".."), "docs", "evidence", "hook-runs.jsonl");
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    /* no log: nothing fired */
  }
  const r = collect(text, baseline);
  if (r.error) {
    console.error(`kiro-hooks-collect: ${r.error}`);
    process.exit(1);
  }
  writeFileSync(file, r.text);
  for (const [h, n] of Object.entries(r.counts)) console.log(`${h}: ${n}`);
}
