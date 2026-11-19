// ROI estimate for /for-teams.html. Pure, offline. The page labels the result ESTIMATE and prints this formula.
// hours saved per month = repos x findings per repo per month x noise share x triage minutes / 60
// "Noise share" is the share of findings the filter exorcises (they stay in the report, nobody triages them one by one).

export interface RoiInputs {
  repos: number;
  findingsPerRepo: number;
  noiseShare: number; // 0..1
  triageMinutes: number;
}

/** Census defaults: 10 findings per repo (median), 95.2% noise. Triage minutes is an assumption, not a measurement. */
export const ROI_DEFAULTS: RoiInputs = { repos: 20, findingsPerRepo: 10, noiseShare: 0.952, triageMinutes: 15 };

export interface RoiResult {
  findings: number;
  filtered: number;
  hoursSaved: number;
}

/** Negative, NaN or infinite inputs count as 0. The noise share is clamped to 0..1. */
export function estimateRoi(i: RoiInputs): RoiResult {
  const n = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
  const findings = n(i.repos) * n(i.findingsPerRepo);
  const filtered = findings * Math.min(1, n(i.noiseShare));
  return { findings, filtered, hoursSaved: (filtered * n(i.triageMinutes)) / 60 };
}
