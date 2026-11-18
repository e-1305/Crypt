// Checks that every .kiro/hooks/*.json has a command action that writes the run log, and that the log is valid.
// Usage: node scripts/ci/hook-evidence-check.mjs [root]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const KEYS = ["ts", "hook", "trigger", "file", "exit", "summary"];
// One optional key. It marks where a real Kiro run was captured.
const SOURCES = ["kiro-cli-ci"];
// Hook names that are not .kiro/hooks files: cloud hooks configured in the Kiro web console (Agent Config > Hooks).
const CLOUD_HOOKS = ["failsafe-guard-on-stop-cloud"];

/** Problems found under `root`. Exported for tests. */
export function check(root) {
  const problems = [];
  const dir = join(root, ".kiro", "hooks");
  const names = [];
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".json")).sort() : []) {
    const name = f.replace(/\.json$/, "");
    names.push(name);
    let j;
    try {
      j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      problems.push(`${f}: not valid JSON`);
      continue;
    }
    const entry = (j.hooks ?? []).find((h) => h.action?.type === "command" && /scripts\/hooks\/run-logged\.sh\s/.test(h.action.command ?? ""));
    if (!entry) {
      problems.push(`${f}: no command action running scripts/hooks/run-logged.sh`);
      continue;
    }
    if (!entry.action.command.includes(`run-logged.sh ${name} `)) problems.push(`${f}: the command must pass the hook name "${name}" to run-logged.sh`);
    if (!Number.isInteger(entry.timeout) || entry.timeout <= 0) problems.push(`${f}: the command hook needs an explicit timeout`);
    const cmds = j.hooks.filter((h) => h.action?.type === "command" && /run-logged\.sh\s/.test(h.action.command ?? ""));
    if (cmds.some((h) => h.trigger === "PostFileSave") && !cmds.some((h) => h.trigger === "PostToolUse" && h.matcher === "write" && /CRYPT_HOOK_FILTER=/.test(h.action.command))) {
      problems.push(`${f}: a PostFileSave command hook needs a PostToolUse (matcher "write") twin with CRYPT_HOOK_FILTER, because Kiro Web has no File Save trigger`);
    }
    for (const h of j.hooks) if (h.enabled !== true) problems.push(`${f}: "${h.name}" needs enabled: true`);
  }
  const log = join(root, "docs", "evidence", "hook-runs.jsonl");
  if (existsSync(log)) {
    readFileSync(log, "utf8").split("\n").forEach((l, i) => {
      if (!l.trim()) return;
      let o;
      try {
        o = JSON.parse(l);
      } catch {
        problems.push(`hook-runs.jsonl line ${i + 1}: not valid JSON`);
        return;
      }
      const keys = Object.keys(o);
      const extra = keys.filter((k) => !KEYS.includes(k));
      if (!KEYS.every((k) => keys.includes(k)) || extra.some((k) => k !== "source") || extra.length > 1) problems.push(`hook-runs.jsonl line ${i + 1}: keys must be ${KEYS.join(", ")} and optionally source`);
      else if (extra.length === 1 && !SOURCES.includes(o.source)) problems.push(`hook-runs.jsonl line ${i + 1}: source must be one of ${SOURCES.join(", ")}`);
      else if (extra.length === 1 && o.trigger === "manual") problems.push(`hook-runs.jsonl line ${i + 1}: a line with a source cannot have trigger manual`);
      else if (!names.includes(o.hook) && !CLOUD_HOOKS.includes(o.hook)) problems.push(`hook-runs.jsonl line ${i + 1}: unknown hook "${o.hook}"`);
      else if (typeof o.exit !== "number" || typeof o.trigger !== "string" || Number.isNaN(Date.parse(o.ts))) problems.push(`hook-runs.jsonl line ${i + 1}: bad ts, trigger or exit`);
    });
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const root = resolve(process.argv[2] ?? join(import.meta.dirname, "..", ".."));
  const p = check(root);
  for (const x of p) console.error(`hook-evidence-check: ${x}`);
  console.log(p.length ? `hook-evidence-check: ${p.length} problem(s)` : "hook-evidence-check: ok");
  process.exit(p.length ? 1 : 0);
}
