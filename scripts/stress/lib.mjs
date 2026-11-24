// Pure helpers for the stress harness (issue #339, scripts/stress/run.mjs). No browser needed, so vitest covers them.

/** A synthetic creature in the shape of _site/game/<slug>.json with `n` limbs, states cycling Possessed, Rotting, Healthy. */
export function syntheticCreature(n, repo = "stress/limbs") {
  const states = ["Possessed", "Rotting", "Healthy"];
  const limbs = [];
  for (let i = 0; i < n; i++) {
    const state = states[i % states.length];
    limbs.push({
      ecosystem: "npm",
      name: `stress-limb-${i}`,
      version: `1.${i % 50}.0`,
      state,
      rank: i + 1,
      spawned: state !== "Healthy" && i < 12,
      epss: state === "Healthy" ? null : Math.min(0.99, (i % 100) / 100),
      kev: state === "Possessed",
    });
  }
  return { repo, limbs };
}

/** A package-lock.json (lockfileVersion 3) text with `n` packages. `padBytes` adds that many bytes of filler to each "resolved" field. */
export function syntheticLockfile(n, padBytes = 0) {
  const pad = padBytes > 0 ? "x".repeat(padBytes) : "";
  const packages = { "": { name: "stress-root", version: "1.0.0" } };
  for (let i = 0; i < n; i++) {
    packages[`node_modules/stress-pkg-${i}`] = { version: `1.0.${i % 100}`, resolved: `https://registry.npmjs.org/stress-pkg-${i}/-/stress-pkg-${i}-1.0.0.tgz${pad}` };
  }
  return JSON.stringify({ name: "stress-root", version: "1.0.0", lockfileVersion: 3, packages });
}

/** The command mix for the command line scenario: EXAMINE, GRAFT, HELP, garbage, a 1 KB line and unicode, `n` in total. */
export function commandMix(n) {
  const fixed = ["EXAMINE LODASH", "GRAFT JQUERY", "HELP", "EXAMINE", "GRAFT", "xyzzy " + "q".repeat(8), "A".repeat(1024), "\u2620\ufe0f \u00e9\u00e8 \u65e5\u672c\u8a9e \u{1f9df} EXAMINE", "\u202eEXAMINE\u202c", "; rm -rf / && GRAFT *", "<b>HELP</b>", "\\u0000 NUL"];
  const out = [];
  for (let i = 0; i < n; i++) out.push(fixed[i % fixed.length]);
  return out;
}

/** True when text claims a repo is clean. Phrases that deny it ("Nothing is marked healthy") do not count. */
export function claimsClean(text) {
  const denied = String(text).replace(/nothing is marked (healthy|clean)|not marked (healthy|clean)|not (checked|clean|healthy)|no creature/gi, "");
  return /\b(all clear|no vulnerabilit(y|ies)|is clean|looks clean|all healthy|0 rotting|zero rotting)\b/i.test(denied);
}

/** Median of a list of numbers. NaN for an empty list. */
export function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The p-th percentile (0..100, nearest rank) of a list of numbers. NaN for an empty list. */
export function percentile(xs, p) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

/** Bytes as MB with one decimal. */
export function mb(bytes) {
  return Number.isFinite(bytes) ? Math.round(bytes / 1048576 * 10) / 10 : NaN;
}

/** One report: scenarios is [{id, title, metrics, checks:[{name, ok, detail}]}]. A scenario passes when every check is ok. */
export function summarize(scenarios) {
  const failures = [];
  for (const s of scenarios) for (const c of s.checks) if (!c.ok) failures.push({ scenario: s.id, check: c.name, detail: c.detail ?? "" });
  return { passed: failures.length === 0, scenarios: scenarios.length, checks: scenarios.reduce((a, s) => a + s.checks.length, 0), failures };
}

/** Markdown table of the checks of every scenario, for docs/STRESS.md. Pipes in details are escaped. */
export function checksTable(scenarios) {
  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const rows = ["| Scenario | Check | Result | Measured |", "| --- | --- | --- | --- |"];
  for (const s of scenarios) for (const c of s.checks) rows.push(`| ${esc(s.id)} | ${esc(c.name)} | ${c.ok ? "PASS" : "FAIL"} | ${esc(c.detail)} |`);
  return rows.join("\n");
}
