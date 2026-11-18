// Deterministic sample input for tests and visual QA: a crypt-demo-like creature with a fixed clock.
import type { AutopsyInput } from "./model.js";

const H = 3_600_000;
export const SAMPLE_SCAN_START = Date.UTC(2025, 10, 3, 9, 0, 0);
/** 40 hours after the scan start: the open Possessed limb has used 83% of its 48 hour window. */
export const SAMPLE_NOW = SAMPLE_SCAN_START + 40 * H;

/**
 * The sample, dated from a scan start. The oldest trend point is 120 hours before the scan start and "now" is 40 hours after it,
 * so every date falls inside the 7 days before "now" (6 days 16 hours).
 */
function buildSample(scanStart: number): AutopsyInput {
  const now = scanStart + 40 * H;
  const at = (hoursAfter: number): string => new Date(scanStart + hoursAfter * H).toISOString();
  return {
  sample: true,
  now,
  creature: {
    repo: "e-1305/crypt-demo",
    team: { scanStart },
    counts: { limbs: 6, findings: 5, exorcised: 3, spawned: 2, possessed: 1, rotting: 3, healthy: 2 },
    limbs: [
      { id: "JQUERY", name: "jquery", owner: "@e-1305", state: "Healthy", spawned: true, kev: false, wasKev: true, epss: 0.62, healed: true, healedBy: "e-1305" },
      { id: "HANDLEBARS", name: "handlebars", owner: "@e-1305", state: "Possessed", spawned: true, kev: true, epss: 0.91 },
      { id: "LODASH", name: "lodash", owner: "unowned", state: "Rotting", spawned: false, kev: false, epss: 0.04 },
      { id: "MINIMIST", name: "minimist", owner: "@e-1305", state: "Healthy", spawned: false, kev: false, epss: 0.05, healed: true, healedBy: "e-1305" },
      { id: "MS", name: "ms", owner: "unowned", state: "Rotting", spawned: false, kev: false, epss: 0.01 },
      { id: "MKDIRP", name: "mkdirp", owner: "@e-1305", state: "Healthy", spawned: false, kev: false, epss: 0 },
    ],
  },
  state: {
    schemaVersion: 1,
    limbs: {
      JQUERY: { state: "healed", pr: "crypt/jquery", updatedAt: at(6), ecosystem: "npm", name: "jquery", from: "3.4.1", to: "3.5.0", healedBy: "e-1305" },
      MINIMIST: { state: "healed", pr: "crypt/minimist", updatedAt: at(10), ecosystem: "npm", name: "minimist", from: "0.0.8", to: "1.2.8", healedBy: "e-1305" },
    },
  },
  history: [
    { at: at(-120), possessed: 2, rotting: 5, healthy: 8, spawned: 4, healed: 0 },
    { at: at(-96), possessed: 2, rotting: 5, healthy: 8, spawned: 4, healed: 0 },
    { at: at(-72), possessed: 2, rotting: 4, healthy: 9, spawned: 3, healed: 1 },
    { at: at(-48), possessed: 1, rotting: 4, healthy: 10, spawned: 3, healed: 2 },
    { at: at(-24), possessed: 1, rotting: 3, healthy: 11, spawned: 2, healed: 3 },
    { at: at(0), possessed: 1, rotting: 3, healthy: 11, spawned: 2, healed: 3 },
  ],
};
}

/** Fixed clock: used by tests, snapshots and the gazette sample. */
export const SAMPLE_INPUT: AutopsyInput = buildSample(SAMPLE_SCAN_START);

/** Sample dated relative to the given clock (default today), so a generated page never looks stale. */
export function sampleInput(now: number = Date.now()): AutopsyInput {
  return buildSample(now - 40 * H);
}
