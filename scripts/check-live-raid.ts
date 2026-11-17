// Acceptance check for the live raid, offline: a full raid against the in-memory GitHub and registry.
// Run: npm run live-raid:check
import { happyRaid, logViolations, sabotageRaid, sealedRaid } from "../tests/live-raid-flow.js";
import { demoFile } from "../tests/live-helpers.js";

const errors: string[] = [];
const expect = (ok: boolean, msg: string) => void (ok || errors.push(msg));

const h = await happyRaid();
expect(h.s.w.prs.length === 2, `expected 2 PRs, found ${h.s.w.prs.length}`);
expect(h.outcomesBeforeMerge.filter((o) => o === "AWAITING_HUMAN_MERGE").length === 2, "both PRs should await a human");
expect(h.re.outcome === "OK" && h.re.healed.length === 2, "reraise should heal both limbs");
expect(/HEALED/.test(h.plate), "the plate should say HEALED");
errors.push(...logViolations(h.s).map((v) => `raid: ${v}`));

const sab = await sabotageRaid();
expect(sab.pr !== undefined && sab.s.w.filesAt(`refs/heads/${sab.pr.head}`)["test/smoke.test.js"] !== demoFile("smoke.test.js"), "sabotage should change the smoke test");
expect(sab.s.stdout.join("").includes("The graft was rejected. The creature remains."), "sabotage should be rejected");
expect(sab.s.env.stateText() === null, "a rejected graft must not change state");
errors.push(...logViolations(sab.s).map((v) => `sabotage: ${v}`));

const sealed = await sealedRaid();
expect(sealed.s.w.requests.length === 0, "a sealed crypt must make no API call");

if (errors.length) {
  console.error(`live raid check FAILED:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`live raid check OK: 2 PRs opened, ${h.s.w.requests.length} API calls audited, none to a merge endpoint, limbs healed, sabotage rejected, seal honoured`);
