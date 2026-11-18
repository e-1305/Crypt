// Deterministic sample graveyard for `crypt graveyard --sample`, tests and visual QA. Fixed clock, no network.
import { HOUR_MS, type RepoRecord } from "./model.js";

export const SAMPLE_SCANNED_AT = Date.UTC(2025, 10, 3, 9, 0, 0);
/** 40 hours after the scan: Possessed windows (48 h) are at risk. */
export const SAMPLE_NOW = SAMPLE_SCANNED_AT + 40 * HOUR_MS;

const l = (name: string, state: "Possessed" | "Rotting", epss: number | null, owner: string) => ({ name, state, kev: state === "Possessed", epss, owner });

export const SAMPLE_REPOS: RepoRecord[] = [
  { repo: "example-org/api", scannedAt: SAMPLE_SCANNED_AT, scannedLimbs: 310, ownersKnown: true, limbs: [l("handlebars", "Possessed", 0.91, "@example-org/platform"), l("lodash", "Rotting", 0.04, "@example-org/platform"), l("ms", "Rotting", 0.01, "unowned")] },
  { repo: "example-org/docs", scannedAt: SAMPLE_SCANNED_AT, scannedLimbs: 42, ownersKnown: true, limbs: [] },
  { repo: "example-org/mobile", scannedAt: SAMPLE_SCANNED_AT, scannedLimbs: 120, ownersKnown: true, limbs: [l("minimist", "Rotting", 0.18, "@example-org/mobile"), l("node-fetch", "Rotting", 0.02, "unowned")] },
  { repo: "example-org/web", scannedAt: SAMPLE_SCANNED_AT, scannedLimbs: 900, ownersKnown: true, limbs: [l("jquery", "Possessed", 0.62, "@example-org/web"), l("handlebars", "Possessed", 0.91, "@example-org/web"), l("mkdirp", "Rotting", null, "unowned")] },
];
